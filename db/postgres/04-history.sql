-- =====================================================================
-- YAVER — Geçmişe dayalı yorum için ek tablolar  (v0.6)
--   contact      : kişi rehberi (unvan → Üst Yönetim / Birim Yöneticisi / PO / Diğer)
--   keyword_rule : maildeki anahtar kelimeler (pano gruplaması)
--   wiki_page    : kurum içi bilgi (runbook, süreç) — ajan yorumunda kaynak
--   work_item    : talep edenin seviyesi, eşleşen anahtar kelimeler, ajan yorumu
-- Açılışta otomatik çalışır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

CREATE TABLE IF NOT EXISTS contact (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(256)  NOT NULL UNIQUE,
    full_name       VARCHAR(200)  NOT NULL,
    title           VARCHAR(200),                       -- unvan (ör. Genel Müdür Yardımcısı)
    department      VARCHAR(200),
    mgmt_level      VARCHAR(10)   NOT NULL DEFAULT 'diger',      -- ust | birim | po | diger (kısıt 05-it-ops.sql'de)
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contact_name ON contact(lower(full_name));

CREATE TABLE IF NOT EXISTS keyword_rule (
    id              SERIAL PRIMARY KEY,
    key             VARCHAR(50)   NOT NULL UNIQUE,      -- grup anahtarı (ör. prod)
    label           VARCHAR(100)  NOT NULL,             -- ekranda görünen ad
    terms           TEXT[]        NOT NULL,             -- mail konusu/gövdesinde aranan kelimeler (küçük harf)
    color           VARCHAR(9)    NOT NULL DEFAULT '#5148E5',
    sort_order      INT           NOT NULL DEFAULT 100, -- birden çok eşleşmede önce gelen grubu belirler
    enabled         BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Varsayılan kurallar 05-it-ops.sql'de (takip edilen IT konuları)

CREATE TABLE IF NOT EXISTS wiki_page (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(200)  NOT NULL UNIQUE,
    title           VARCHAR(300)  NOT NULL,
    space           VARCHAR(100)  NOT NULL DEFAULT 'Genel',   -- Confluence alanı / klasör
    body            TEXT          NOT NULL DEFAULT '',
    tags            TEXT[]        NOT NULL DEFAULT '{}',
    url             VARCHAR(1000),
    updated_by      VARCHAR(200),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE work_item ADD COLUMN IF NOT EXISTS requester_email      VARCHAR(256);
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS mgmt_level           VARCHAR(10) NOT NULL DEFAULT 'diger';
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS keywords             TEXT[]      NOT NULL DEFAULT '{}';
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS agent_comment        TEXT;
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS agent_sources        JSONB       NOT NULL DEFAULT '[]';
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS agent_confidence     NUMERIC(3,2);
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS agent_suggestion     JSONB;     -- {assignee, priority, eta_days}
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS agent_comment_by     VARCHAR(100);
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS agent_comment_at     TIMESTAMPTZ;
-- mgmt_level değer kısıtı 05-it-ops.sql'de (ust | birim | po | diger)
CREATE INDEX IF NOT EXISTS ix_work_item_mgmt ON work_item(mgmt_level);
