-- =====================================================================
-- YAVER — Ajan (LangGraph) entegrasyonu için ek tablolar  (v0.4)
-- Uygulama açılışta 01-schema.sql'den sonra bunu çalıştırır; tekrar çalıştırmak güvenlidir.
-- Ayrıntı: docs/AJAN-API.md
-- =====================================================================

-- ---------- Ajan rolü ----------
DO $$ BEGIN
  ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
  ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('admin','member','viewer','agent'));
END $$;

-- Ajanın kendi kullanıcısı: yazdığı her şey tarihçede "yaver-ajan" olarak görünür. Şifresi yok, ekrandan giriş yapamaz.
INSERT INTO app_user (username, full_name, auth_source, role)
VALUES ('yaver-ajan', 'Yaver Ajan', 'local', 'agent') ON CONFLICT (username) DO NOTHING;

-- ---------- İş: iyimser kilit + ajan tarihçesi ----------
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE work_item_activity DROP CONSTRAINT IF EXISTS work_item_activity_action_check;
  ALTER TABLE work_item_activity ADD CONSTRAINT work_item_activity_action_check
    CHECK (action IN ('created','status','assign','priority','comment','linked','edit','agent_note','agent_proposal'));
END $$;
ALTER TABLE work_item_activity ADD COLUMN IF NOT EXISTS on_behalf_of INT REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE work_item_activity ADD COLUMN IF NOT EXISTS agent_run_id BIGINT;

-- ---------- Mail: ajanın okuyacağı tam gövde + triyaj durumu ----------
ALTER TABLE email ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE email ADD COLUMN IF NOT EXISTS triage_status VARCHAR(12) NOT NULL DEFAULT 'pending';
DO $$ BEGIN
  ALTER TABLE email DROP CONSTRAINT IF EXISTS email_triage_status_check;
  ALTER TABLE email ADD CONSTRAINT email_triage_status_check
    CHECK (triage_status IN ('pending','processing','done','ignored','failed'));
END $$;
CREATE INDEX IF NOT EXISTS ix_email_triage ON email(triage_status, received_at DESC);
CREATE INDEX IF NOT EXISTS ix_email_work_item ON email(work_item_id);

-- ---------- API token'ları (ajan / servis hesapları) ----------
CREATE TABLE IF NOT EXISTS api_token (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INT           NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name            VARCHAR(100)  NOT NULL,
    token_hash      CHAR(64)      NOT NULL UNIQUE,      -- sha256(token); düz metin yalnız oluşturulurken bir kez gösterilir
    prefix          VARCHAR(12)   NOT NULL,             -- ekranda tanımak için ilk karakterler
    scopes          TEXT[]        NOT NULL,
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_by      INT REFERENCES app_user(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------- Olay kutusu (outbox): backend → ajan ----------
CREATE TABLE IF NOT EXISTS agent_event (
    id              BIGSERIAL PRIMARY KEY,
    type            VARCHAR(50)   NOT NULL,             -- email.received, work_item.created, chat.message …
    entity          VARCHAR(30)   NOT NULL,             -- work_item | email | meeting | agent_action | chat_session
    entity_id       BIGINT        NOT NULL,
    payload         JSONB         NOT NULL DEFAULT '{}',
    actor_id        INT REFERENCES app_user(id) ON DELETE SET NULL,
    actor_role      VARCHAR(20),
    status          VARCHAR(10)   NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','acked','failed','skipped')),
    attempts        INT           NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- teslim sırasında kira (lease) olarak da kullanılır
    last_error      VARCHAR(1000),
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_agent_event_due ON agent_event(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_agent_event_entity ON agent_event(entity, entity_id);

-- ---------- Ajan çalışmaları ----------
CREATE TABLE IF NOT EXISTS agent_run (
    id              BIGSERIAL PRIMARY KEY,
    graph           VARCHAR(100)  NOT NULL,             -- LangGraph grafiği / assistant adı
    event_id        BIGINT REFERENCES agent_event(id) ON DELETE SET NULL,
    chat_session_id BIGINT,
    external_run_id VARCHAR(200),                       -- LangGraph run_id
    thread_id       VARCHAR(200),                       -- LangGraph thread_id
    status          VARCHAR(10)   NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','succeeded','failed','cancelled')),
    summary         TEXT,
    error           TEXT,
    tokens_in       INT,
    tokens_out      INT,
    started_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_agent_run_started ON agent_run(started_at DESC);

-- ---------- Ajan önerileri (insan onayı bekleyen değişiklikler) ----------
CREATE TABLE IF NOT EXISTS agent_action (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT REFERENCES agent_run(id) ON DELETE SET NULL,
    work_item_id    BIGINT REFERENCES work_item(id) ON DELETE CASCADE,
    email_id        BIGINT REFERENCES email(id) ON DELETE CASCADE,
    meeting_id      BIGINT REFERENCES meeting(id) ON DELETE CASCADE,
    kind            VARCHAR(20)   NOT NULL
                    CHECK (kind IN ('create','status','priority','assign','due_date','category','tags','edit','link')),
    payload         JSONB         NOT NULL DEFAULT '{}',
    confidence      NUMERIC(3,2)  CHECK (confidence BETWEEN 0 AND 1),
    reasoning       TEXT,
    status          VARCHAR(10)   NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','applied','rejected','failed')),
    result_json     JSONB,
    error           VARCHAR(1000),
    created_by      INT REFERENCES app_user(id) ON DELETE SET NULL,
    decided_by      INT REFERENCES app_user(id) ON DELETE SET NULL,
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_agent_action_pending ON agent_action(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_agent_action_item ON agent_action(work_item_id);

-- ---------- Tekrar güvenliği (Idempotency-Key) ----------
CREATE TABLE IF NOT EXISTS idempotency_key (
    actor_id        INT           NOT NULL,
    key             VARCHAR(200)  NOT NULL,
    method          VARCHAR(10)   NOT NULL,
    path            VARCHAR(500)  NOT NULL,
    response_status INT,                                -- NULL = istek hâlâ işleniyor
    response_json   JSONB,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_id, key)
);

-- ---------- Chat ----------
CREATE TABLE IF NOT EXISTS chat_session (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INT           NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    title           VARCHAR(200)  NOT NULL DEFAULT 'Yeni sohbet',
    context_json    JSONB         NOT NULL DEFAULT '{}',   -- {"work_item_id": 12} gibi
    agent_thread_id VARCHAR(200),                         -- LangGraph thread_id (konuşma hafızası ajanda)
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_chat_session_user ON chat_session(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_message (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT        NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
    role            VARCHAR(10)   NOT NULL CHECK (role IN ('user','assistant','tool','system')),
    content         TEXT          NOT NULL DEFAULT '',
    tool_calls_json JSONB,
    run_id          BIGINT REFERENCES agent_run(id) ON DELETE SET NULL,
    status          VARCHAR(10)   NOT NULL DEFAULT 'done' CHECK (status IN ('pending','streaming','done','error')),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_chat_message_session ON chat_message(session_id, id);
