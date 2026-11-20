-- =====================================================================
-- YAVER — Çözüm açıklaması (0.9.19)
--   Bir iş "Tamamlandı"ya alınırken ne yapıldığı yazılır: neden, yapılan, kalıcı önlem.
--   resolved_by: açıklamayı yazan (kullanıcı adı ya da "GenAI Studio"), resolved_at: zamanı.
-- Açılışta otomatik çalışır; tekrar çalıştırmak güvenlidir.
-- =====================================================================
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(100);
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
