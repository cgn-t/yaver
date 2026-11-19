-- =====================================================================
-- YAVER — veritabanı şeması (PostgreSQL 14+)
-- Tek pod kurulumunda uygulama açılışta bu dosyayı otomatik çalıştırır
-- (tüm ifadeler IF NOT EXISTS — tekrar çalıştırmak güvenli).
-- MSSQL karşılığı: db/schema-mssql.sql
-- =====================================================================

-- ---------- Kullanıcılar ----------
CREATE TABLE IF NOT EXISTS app_user (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100)  NOT NULL UNIQUE,         -- sAMAccountName veya lokal kullanıcı
    full_name       VARCHAR(200),
    email           VARCHAR(256),
    auth_source     VARCHAR(10)   NOT NULL DEFAULT 'ldap'   CHECK (auth_source IN ('local','ldap')),
    password_hash   VARCHAR(255),                           -- yalnız lokal hesap (scrypt)
    role            VARCHAR(20)   NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
    team_group      VARCHAR(200),                           -- LDAP ekip grubu (ör. SY-BBB)
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------- İşler (merkez tablo) ----------
CREATE TABLE IF NOT EXISTS work_item (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(20)   GENERATED ALWAYS AS ('YVR-' || (id + 1000)) STORED,   -- YVR-1001
    title           VARCHAR(500)  NOT NULL,
    description     TEXT,
    source_type     VARCHAR(10)   NOT NULL CHECK (source_type IN ('mail','zoom','tfs','jira','manual','api')),
    source_id       BIGINT,                                 -- email.id / meeting.id
    external_ref    VARCHAR(200),                           -- API kaynağındaki anahtar (Jira key vb.)
    status          VARCHAR(12)   NOT NULL DEFAULT 'new'    CHECK (status IN ('new','in_progress','waiting','done','cancelled')),
    priority        VARCHAR(10)   NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
    category        VARCHAR(100),
    assignee_id     INT REFERENCES app_user(id) ON DELETE SET NULL,
    requester       VARCHAR(256),                           -- mail göndereni / toplantı sahibi
    due_date        DATE,
    created_by      INT REFERENCES app_user(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_work_item_status   ON work_item(status, priority);
CREATE INDEX IF NOT EXISTS ix_work_item_assignee ON work_item(assignee_id, status);
CREATE INDEX IF NOT EXISTS ix_work_item_source   ON work_item(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_item_extref ON work_item(source_type, external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS work_item_tag (
    work_item_id    BIGINT        NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
    tag             VARCHAR(100)  NOT NULL,
    PRIMARY KEY (work_item_id, tag)
);

-- İşin tarihçesi: durum/atama/öncelik değişiklikleri ve yorumlar
CREATE TABLE IF NOT EXISTS work_item_activity (
    id              BIGSERIAL PRIMARY KEY,
    work_item_id    BIGINT        NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
    actor_id        INT REFERENCES app_user(id) ON DELETE SET NULL,   -- NULL = sistem
    action          VARCHAR(20)   NOT NULL CHECK (action IN ('created','status','assign','priority','comment','linked')),
    old_value       VARCHAR(500),
    new_value       VARCHAR(500),
    comment         TEXT,                                   -- ekranda gösterilen metin / yorum
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_activity_item ON work_item_activity(work_item_id, created_at DESC);

-- ---------- E-postalar ----------
CREATE TABLE IF NOT EXISTS email (
    id              BIGSERIAL PRIMARY KEY,
    message_id      VARCHAR(500)  NOT NULL UNIQUE,          -- RFC Message-ID → tekrar çekmede çift kayıt olmaz
    thread_id       VARCHAR(500),
    mailbox         VARCHAR(256)  NOT NULL,
    from_address    VARCHAR(256)  NOT NULL,
    from_name       VARCHAR(256),
    to_addresses    JSONB         NOT NULL DEFAULT '[]',
    cc_addresses    JSONB         NOT NULL DEFAULT '[]',
    subject         VARCHAR(1000),
    body_preview    VARCHAR(2000),
    body_html       TEXT,
    importance      VARCHAR(10)   NOT NULL DEFAULT 'normal' CHECK (importance IN ('low','normal','high')),
    has_attachments BOOLEAN       NOT NULL DEFAULT FALSE,
    received_at     TIMESTAMPTZ   NOT NULL,
    is_read         BOOLEAN       NOT NULL DEFAULT FALSE,
    work_item_id    BIGINT REFERENCES work_item(id) ON DELETE SET NULL,
    ingested_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_email_received ON email(received_at DESC);

CREATE TABLE IF NOT EXISTS email_attachment (
    id              BIGSERIAL PRIMARY KEY,
    email_id        BIGINT        NOT NULL REFERENCES email(id) ON DELETE CASCADE,
    file_name       VARCHAR(500)  NOT NULL,
    content_type    VARCHAR(200),
    size_bytes      BIGINT,
    storage_path    VARCHAR(1000)
);

-- ---------- Zoom toplantıları ----------
CREATE TABLE IF NOT EXISTS meeting (
    id              BIGSERIAL PRIMARY KEY,
    zoom_meeting_id VARCHAR(50)   NOT NULL,
    zoom_uuid       VARCHAR(100)  NOT NULL UNIQUE,          -- her oturum için tekil
    topic           VARCHAR(500)  NOT NULL,
    agenda          TEXT,
    host_email      VARCHAR(256),
    host_name       VARCHAR(256),
    start_time      TIMESTAMPTZ   NOT NULL,
    duration_min    INT           NOT NULL DEFAULT 30,
    timezone        VARCHAR(64)   DEFAULT 'Europe/Istanbul',
    join_url        VARCHAR(1000),
    status          VARCHAR(12)   NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
    recording_url   VARCHAR(1000),
    notes           TEXT          NOT NULL DEFAULT '',
    work_item_id    BIGINT REFERENCES work_item(id) ON DELETE SET NULL,   -- toplantıdan açılan iş
    ingested_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_meeting_start ON meeting(start_time);

CREATE TABLE IF NOT EXISTS meeting_participant (
    id              BIGSERIAL PRIMARY KEY,
    meeting_id      BIGINT        NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
    name            VARCHAR(256),
    email           VARCHAR(256),
    join_time       TIMESTAMPTZ,
    leave_time      TIMESTAMPTZ,
    attended        BOOLEAN       NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS ix_participant_meeting ON meeting_participant(meeting_id);

-- ---------- API çağrı servisi ----------
CREATE TABLE IF NOT EXISTS api_poll_config (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200)  NOT NULL,
    enabled         BOOLEAN       NOT NULL DEFAULT FALSE,
    target          VARCHAR(10)   NOT NULL DEFAULT 'generic' CHECK (target IN ('mail','zoom','tfs','jira','generic')),
    url             VARCHAR(2000) NOT NULL DEFAULT '',
    method          VARCHAR(6)    NOT NULL DEFAULT 'GET'   CHECK (method IN ('GET','POST','PUT')),
    interval_sec    INT           NOT NULL DEFAULT 60      CHECK (interval_sec >= 10),   -- varsayılan 1 dk
    timeout_sec     INT           NOT NULL DEFAULT 15,
    auth_type       VARCHAR(10)   NOT NULL DEFAULT 'none'  CHECK (auth_type IN ('none','bearer','basic','api_key')),
    auth_header     VARCHAR(100)  DEFAULT 'X-API-Key',
    auth_username   VARCHAR(200)  DEFAULT '',
    auth_secret     TEXT          DEFAULT '',              -- token/şifre (üretimde şifreli saklayın)
    headers_json    TEXT          DEFAULT '{"Accept": "application/json"}',
    body_json       TEXT          DEFAULT '',
    last_run_at     TIMESTAMPTZ,
    last_status     VARCHAR(5)    CHECK (last_status IN ('ok','error')),
    locked_until    TIMESTAMPTZ,                           -- çoklu replika olursa aynı servis iki kez çalışmaz
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_poll_log (
    id              BIGSERIAL PRIMARY KEY,
    config_id       INT           NOT NULL REFERENCES api_poll_config(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ   NOT NULL,
    duration_ms     INT           NOT NULL,
    http_status     INT,
    ok              BOOLEAN       NOT NULL,
    record_count    INT           NOT NULL DEFAULT 0,      -- yeni eklenen kayıt
    message         VARCHAR(1000)
);
CREATE INDEX IF NOT EXISTS ix_poll_log ON api_poll_log(config_id, started_at DESC);

-- ---------- Ayarlar (LDAP, genel) ----------
CREATE TABLE IF NOT EXISTS app_setting (
    category        VARCHAR(50)   NOT NULL,                -- ldap | general
    key             VARCHAR(100)  NOT NULL,
    value           TEXT,
    is_secret       BOOLEAN       NOT NULL DEFAULT FALSE,  -- bind_password gibi: ekrana maskeli döner
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_by      INT REFERENCES app_user(id) ON DELETE SET NULL,
    PRIMARY KEY (category, key)
);

-- ---------- Denetim kaydı ----------
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor_id        INT REFERENCES app_user(id) ON DELETE SET NULL,
    entity          VARCHAR(50)   NOT NULL,
    entity_id       VARCHAR(100),
    action          VARCHAR(20)   NOT NULL,
    diff_json       JSONB,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity, entity_id);
