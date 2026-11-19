-- =====================================================================
-- YAVER — önerilen veritabanı şeması (MSSQL / SQL Server)
-- Jumbo ile aynı altyapı varsayıldı (MSSQL). PostgreSQL için:
--   NVARCHAR → VARCHAR/TEXT, DATETIME2 → TIMESTAMPTZ, BIT → BOOLEAN,
--   IDENTITY → GENERATED ALWAYS AS IDENTITY.
-- Ayrıntılı açıklama: docs/DB-SEMA.md
-- =====================================================================

-- ---------- Kullanıcılar ----------
CREATE TABLE app_user (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    username        NVARCHAR(100)  NOT NULL UNIQUE,      -- sAMAccountName veya lokal kullanıcı
    full_name       NVARCHAR(200)  NULL,
    email           NVARCHAR(256)  NULL,
    auth_source     VARCHAR(10)    NOT NULL DEFAULT 'ldap',  -- 'local' | 'ldap'
    password_hash   NVARCHAR(255)  NULL,                 -- yalnız lokal hesap (admin)
    role            VARCHAR(20)    NOT NULL DEFAULT 'member', -- 'admin' | 'member' | 'viewer'
    team_group      NVARCHAR(200)  NULL,                 -- LDAP ekip grubu (ör. SY-BBB)
    is_active       BIT            NOT NULL DEFAULT 1,
    last_login_at   DATETIME2      NULL,
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ---------- E-postalar ----------
CREATE TABLE email (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    message_id      NVARCHAR(500)  NOT NULL UNIQUE,      -- RFC Message-ID → tekrar çekmede çift kayıt olmaz
    thread_id       NVARCHAR(500)  NULL,                 -- konuşma kimliği (Exchange ConversationId)
    mailbox         NVARCHAR(256)  NOT NULL,             -- hangi kutudan (takim@firma.com)
    from_address    NVARCHAR(256)  NOT NULL,
    from_name       NVARCHAR(256)  NULL,
    to_addresses    NVARCHAR(MAX)  NULL,                 -- JSON dizi
    cc_addresses    NVARCHAR(MAX)  NULL,                 -- JSON dizi
    subject         NVARCHAR(1000) NULL,
    body_preview    NVARCHAR(2000) NULL,                 -- listede gösterilen ilk ~500 karakter
    body_html       NVARCHAR(MAX)  NULL,
    importance      VARCHAR(10)    NOT NULL DEFAULT 'normal', -- low | normal | high
    has_attachments BIT            NOT NULL DEFAULT 0,
    received_at     DATETIME2      NOT NULL,
    is_read         BIT            NOT NULL DEFAULT 0,
    work_item_id    BIGINT         NULL,                 -- işe dönüştürüldüyse (FK aşağıda)
    ingested_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_email_received ON email(received_at DESC);
CREATE INDEX ix_email_thread   ON email(thread_id);

CREATE TABLE email_attachment (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    email_id        BIGINT         NOT NULL REFERENCES email(id) ON DELETE CASCADE,
    file_name       NVARCHAR(500)  NOT NULL,
    content_type    NVARCHAR(200)  NULL,
    size_bytes      BIGINT         NULL,
    storage_path    NVARCHAR(1000) NULL                  -- dosya içeriği DB dışında (disk/obje deposu)
);

-- ---------- Zoom toplantıları ----------
CREATE TABLE meeting (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    zoom_meeting_id NVARCHAR(50)   NOT NULL,             -- tekrarlayan toplantılarda aynı olabilir
    zoom_uuid       NVARCHAR(100)  NOT NULL UNIQUE,      -- her oturum için tekil
    topic           NVARCHAR(500)  NOT NULL,
    agenda          NVARCHAR(MAX)  NULL,
    host_email      NVARCHAR(256)  NULL,
    host_name       NVARCHAR(256)  NULL,
    start_time      DATETIME2      NOT NULL,
    duration_min    INT            NOT NULL DEFAULT 30,
    timezone        NVARCHAR(64)   NULL,
    join_url        NVARCHAR(1000) NULL,
    status          VARCHAR(12)    NOT NULL DEFAULT 'scheduled', -- scheduled | live | ended | cancelled
    recording_url   NVARCHAR(1000) NULL,
    notes           NVARCHAR(MAX)  NULL,
    work_item_id    BIGINT         NULL,                 -- toplantıdan açılan iş (FK aşağıda, work_item sonra tanımlandığı için)
    ingested_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_meeting_start ON meeting(start_time);

CREATE TABLE meeting_participant (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    meeting_id      BIGINT         NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
    name            NVARCHAR(256)  NULL,
    email           NVARCHAR(256)  NULL,
    join_time       DATETIME2      NULL,
    leave_time      DATETIME2      NULL,
    attended        BIT            NOT NULL DEFAULT 0
);
CREATE INDEX ix_participant_meeting ON meeting_participant(meeting_id);

-- ---------- İşler (merkez tablo) ----------
CREATE TABLE work_item (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    code            AS ('YVR-' + CAST(id + 1000 AS VARCHAR(20))) PERSISTED, -- YVR-1001
    title           NVARCHAR(500)  NOT NULL,
    description     NVARCHAR(MAX)  NULL,
    source_type     VARCHAR(10)    NOT NULL,             -- mail | zoom | manual | api
    source_id       BIGINT         NULL,                 -- email.id / meeting.id
    external_ref    NVARCHAR(200)  NULL,                 -- API kaynağındaki anahtar (Jira key vb.)
    status          VARCHAR(12)    NOT NULL DEFAULT 'new', -- new | in_progress | waiting | done | cancelled
    priority        VARCHAR(10)    NOT NULL DEFAULT 'normal', -- low | normal | high | critical
    category        NVARCHAR(100)  NULL,                 -- Talep | Olay | Aksiyon | …
    assignee_id     INT            NULL REFERENCES app_user(id),
    requester       NVARCHAR(256)  NULL,                 -- mail göndereni / toplantı sahibi (iç kullanıcı olmayabilir)
    due_date        DATE           NULL,
    created_by      INT            NULL REFERENCES app_user(id),
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    closed_at       DATETIME2      NULL,
    CONSTRAINT ck_work_item_source CHECK (source_type IN ('mail','zoom','manual','api')),
    CONSTRAINT ck_work_item_status CHECK (status IN ('new','in_progress','waiting','done','cancelled')),
    CONSTRAINT ck_work_item_priority CHECK (priority IN ('low','normal','high','critical'))
);
CREATE INDEX ix_work_item_status   ON work_item(status, priority);
CREATE INDEX ix_work_item_assignee ON work_item(assignee_id, status);
CREATE INDEX ix_work_item_source   ON work_item(source_type, source_id);
CREATE UNIQUE INDEX ux_work_item_extref ON work_item(source_type, external_ref) WHERE external_ref IS NOT NULL;

ALTER TABLE email ADD CONSTRAINT fk_email_work_item FOREIGN KEY (work_item_id) REFERENCES work_item(id);
ALTER TABLE meeting ADD CONSTRAINT fk_meeting_work_item FOREIGN KEY (work_item_id) REFERENCES work_item(id);

CREATE TABLE work_item_tag (
    work_item_id    BIGINT         NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
    tag             NVARCHAR(100)  NOT NULL,
    PRIMARY KEY (work_item_id, tag)
);

-- İşin tarihçesi: durum/atama/öncelik değişiklikleri ve yorumlar
CREATE TABLE work_item_activity (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    work_item_id    BIGINT         NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
    actor_id        INT            NULL REFERENCES app_user(id),  -- NULL = sistem
    action          VARCHAR(20)    NOT NULL,             -- created | status | assign | priority | comment | linked
    old_value       NVARCHAR(500)  NULL,
    new_value       NVARCHAR(500)  NULL,
    comment         NVARCHAR(MAX)  NULL,
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_activity_item ON work_item_activity(work_item_id, created_at DESC);

-- ---------- API çağrı servisi ----------
CREATE TABLE api_poll_config (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(200)  NOT NULL,
    enabled         BIT            NOT NULL DEFAULT 0,
    target          VARCHAR(10)    NOT NULL DEFAULT 'generic', -- mail | zoom | generic(work_item)
    url             NVARCHAR(2000) NOT NULL,
    method          VARCHAR(6)     NOT NULL DEFAULT 'GET',
    interval_sec    INT            NOT NULL DEFAULT 60,  -- varsayılan 1 dk
    timeout_sec     INT            NOT NULL DEFAULT 15,
    auth_type       VARCHAR(10)    NOT NULL DEFAULT 'none', -- none | bearer | basic | api_key
    auth_header     NVARCHAR(100)  NULL,
    auth_username   NVARCHAR(200)  NULL,
    auth_secret_enc NVARCHAR(MAX)  NULL,                 -- token/şifre — Fernet ile şifreli (Jumbo'daki gibi)
    headers_json    NVARCHAR(MAX)  NULL,
    body_json       NVARCHAR(MAX)  NULL,
    last_run_at     DATETIME2      NULL,
    last_status     VARCHAR(5)     NULL,                 -- ok | error
    locked_until    DATETIME2      NULL,                 -- çoklu pod'da aynı servisin iki kez çalışmaması için
    updated_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_poll_interval CHECK (interval_sec >= 10)
);

CREATE TABLE api_poll_log (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    config_id       INT            NOT NULL REFERENCES api_poll_config(id) ON DELETE CASCADE,
    started_at      DATETIME2      NOT NULL,
    duration_ms     INT            NOT NULL,
    http_status     INT            NULL,
    ok              BIT            NOT NULL,
    record_count    INT            NOT NULL DEFAULT 0,   -- yeni eklenen kayıt
    message         NVARCHAR(1000) NULL
);
CREATE INDEX ix_poll_log ON api_poll_log(config_id, started_at DESC);

-- ---------- Ayarlar (LDAP, genel) — Jumbo ile aynı model ----------
CREATE TABLE app_setting (
    category        VARCHAR(50)    NOT NULL,             -- ldap | general | …
    [key]           VARCHAR(100)   NOT NULL,             -- server, port, bind_dn, …
    value           NVARCHAR(MAX)  NULL,
    is_secret       BIT            NOT NULL DEFAULT 0,   -- bind_password gibi: Fernet şifreli saklanır
    updated_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_by      INT            NULL REFERENCES app_user(id),
    PRIMARY KEY (category, [key])
);

-- ---------- Denetim kaydı ----------
CREATE TABLE audit_log (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    actor_id        INT            NULL REFERENCES app_user(id),
    entity          VARCHAR(50)    NOT NULL,             -- work_item | api_poll_config | app_setting …
    entity_id       NVARCHAR(100)  NULL,
    action          VARCHAR(20)    NOT NULL,             -- create | update | delete | login
    diff_json       NVARCHAR(MAX)  NULL,                 -- { alan: [eski, yeni] }
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_audit_entity ON audit_log(entity, entity_id);
