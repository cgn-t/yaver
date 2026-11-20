-- =====================================================================
-- YAVER — GenAI çağrısının hangi aşamada olduğu (0.9.16)
--   stage: token / istek gönderildi / cevap alındı …  started_at: iş çalışmaya başladığında
-- Açılışta otomatik çalışır; tekrar çalıştırmak güvenlidir.
-- =====================================================================
ALTER TABLE genai_job ADD COLUMN IF NOT EXISTS stage VARCHAR(200);
ALTER TABLE genai_job ADD COLUMN IF NOT EXISTS stage_at TIMESTAMPTZ;
ALTER TABLE genai_job ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
