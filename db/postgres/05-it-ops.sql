-- =====================================================================
-- YAVER — IT operasyon kaynakları ve kırılımı  (v0.7)
--   * İş kaynakları: Mail, Zoom, TFS Kanban, Jira (+ manuel, API)
--   * Talep eden kırılımı: Üst Yönetim / Birim Yöneticisi / PO / Diğer
--     (eski gm, gmy, direktor → ust; mudur → birim)
--   * Takip edilen konular (keyword_rule): MQ, OpenShift Upgrade, Server Upgrade, Decom, DevOps,
--     Failed hataları, Servis Yönetimi, Yazılım — eski iş-birimi kuralları bir kez pasife alınır.
-- Açılışta otomatik çalışır; tekrar çalıştırmak güvenlidir.
-- =====================================================================

-- ---------- Kaynak türleri ----------
ALTER TABLE work_item DROP CONSTRAINT IF EXISTS work_item_source_type_check;
ALTER TABLE work_item ADD CONSTRAINT work_item_source_type_check
  CHECK (source_type IN ('mail','zoom','tfs','jira','manual','api'));
ALTER TABLE api_poll_config DROP CONSTRAINT IF EXISTS api_poll_config_target_check;
ALTER TABLE api_poll_config ADD CONSTRAINT api_poll_config_target_check CHECK (target IN ('mail','zoom','tfs','jira','generic'));
ALTER TABLE work_item ADD COLUMN IF NOT EXISTS external_url VARCHAR(1000);   -- TFS / Jira kaydının bağlantısı

-- ---------- Talep eden kırılımı ----------
ALTER TABLE contact   DROP CONSTRAINT IF EXISTS contact_mgmt_level_check;
ALTER TABLE work_item DROP CONSTRAINT IF EXISTS work_item_mgmt_level_check;
UPDATE contact   SET mgmt_level = 'ust'   WHERE mgmt_level IN ('gm','gmy','direktor');
UPDATE contact   SET mgmt_level = 'birim' WHERE mgmt_level = 'mudur';
UPDATE work_item SET mgmt_level = 'ust'   WHERE mgmt_level IN ('gm','gmy','direktor');
UPDATE work_item SET mgmt_level = 'birim' WHERE mgmt_level = 'mudur';
ALTER TABLE contact   ADD CONSTRAINT contact_mgmt_level_check   CHECK (mgmt_level IN ('ust','birim','po','diger'));
ALTER TABLE work_item ADD CONSTRAINT work_item_mgmt_level_check CHECK (mgmt_level IN ('ust','birim','po','diger'));

-- ---------- Takip edilen konular ----------
-- v0.6'nın varsayılan kuralları (acil, prod, fatura…) yalnız ilk geçişte pasife alınır; sonradan açarsanız dokunulmaz.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_setting WHERE category = 'migration' AND key = 'keyword_rules_v07') THEN
    UPDATE keyword_rule SET enabled = FALSE WHERE key IN ('acil','prod','fatura','rapor','erisim','denetim');
    INSERT INTO app_setting (category, key, value) VALUES ('migration', 'keyword_rules_v07', now()::text);
  END IF;
END $$;

INSERT INTO keyword_rule (key, label, terms, color, sort_order) VALUES
  ('mq',        'MQ',                ARRAY['mq','ibm mq','qmgr','kuyruk','queue','channel','dlq','mesaj kuyruğu'],                         '#E2A336', 10),
  ('openshift', 'OpenShift Upgrade', ARRAY['openshift','ocp','pod','cluster upgrade','operator','worker node','kubernetes','k8s'],               '#E5484D', 20),
  ('server',    'Server Upgrade',    ARRAY['server upgrade','sunucu upgrade','os upgrade','rhel','yama','patch','firmware','windows server','sunucu güncelleme'], '#3E63DD', 30),
  ('decom',     'Decom',             ARRAY['decom','decommission','devreden çıkar','kapatılması','sunucu kapatma','emekliye'],              '#5B5F6B', 40),
  ('devops',    'DevOps',            ARRAY['pipeline','ci/cd','jenkins','argocd','helm','azure devops','gitlab','build','deploy'],         '#12A594', 50),
  ('failed',    'Failed hataları',   ARRAY['failed','başarısız','hata','error','exception','crashloop','timeout','patladı','down'],       '#F76B15', 60),
  ('servis',    'Servis Yönetimi',   ARRAY['incident','olay kaydı','change','değişiklik kaydı','cab','problem kaydı','itsm','servicenow','sla ihlali','sla süresi'], '#8E4EC6', 70),
  ('yazilim',   'Yazılım',           ARRAY['yazılım','bug ','bug''','bugfix','geliştirme','release','versiyon','user story','backlog','sprint','kod'],    '#2E90FA', 80)
ON CONFLICT (key) DO NOTHING;
