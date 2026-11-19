-- =====================================================================
-- YAVER — GenAI Studio "Chat Block" entegrasyonu  (v0.8)
--   * genai_job: her iş için kuyruk + çağrı geçmişi (istek özeti, ham yanıt, sonuç)
--   * work_item.keywords_by: konu (anahtar kelime grubu) AI tarafından atandıysa 'genai';
--     o zaman metinden otomatik eşleşme konuyu ezmez.
-- Açılışta otomatik çalışır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

ALTER TABLE work_item ADD COLUMN IF NOT EXISTS keywords_by VARCHAR(20);

CREATE TABLE IF NOT EXISTS genai_job (
    id              BIGSERIAL     PRIMARY KEY,
    kind            VARCHAR(20)   NOT NULL CHECK (kind IN ('interpret','mail','meeting')),
    work_item_id    BIGINT        REFERENCES work_item(id) ON DELETE CASCADE,
    email_id        BIGINT        REFERENCES email(id) ON DELETE CASCADE,
    meeting_id      BIGINT        REFERENCES meeting(id) ON DELETE CASCADE,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','skipped')),
    attempts        INT           NOT NULL DEFAULT 0,
    next_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    trigger         VARCHAR(40),                      -- event | manual | retry
    thread_id       VARCHAR(200),                     -- Chat Block'un döndürdüğü thread
    request_chars   INT,
    http_status     INT,
    duration_ms     INT,
    response_text   TEXT,                             -- ham yanıt (kısaltılmış)
    result          JSONB,                            -- ayrıştırılmış AI yanıtı + uygulanan değişiklikler
    error           TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_genai_job_pending ON genai_job(status, next_at);
CREATE INDEX IF NOT EXISTS ix_genai_job_item    ON genai_job(work_item_id, created_at DESC);
