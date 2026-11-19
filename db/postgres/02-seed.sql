-- =====================================================================
-- YAVER — örnek veri (PostgreSQL)
-- Otomatik üretildi: db/tools/gen-seed.ts  (kaynak: frontend/src/data/seed.ts)
-- Tarihler now()/current_date'e göre görelidir: hangi gün yüklenirse yüklensin
-- pano "bugün" verisiyle dolu görünür.
-- Uygulama ilk açılışta work_item tablosu BOŞSA bu dosyayı çalıştırır.
-- =====================================================================
BEGIN;

-- ---------- Kullanıcılar ----------
-- admin / admin  (lokal hesap, scrypt özeti). Diğerleri LDAP üzerinden giriş yapar.
INSERT INTO app_user (username, full_name, email, auth_source, password_hash, role, team_group) VALUES
  ('admin', 'Yönetici', 'admin@firma.com', 'local', 'scrypt$082268705bdd372b8c29dfdbc9c0f711$27188d808bed9d8e4e2b27f63b12f1dbd421b342926f5566e3a2dc171122cbaf', 'admin', 'ScrumGroup'),
  ('ayse.yilmaz', 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', 'ldap', NULL, 'member', 'ScrumGroup'),
  ('mehmet.kaya', 'Mehmet Kaya', 'mehmet.kaya@firma.com', 'ldap', NULL, 'member', 'ScrumGroup'),
  ('zeynep.demir', 'Zeynep Demir', 'zeynep.demir@firma.com', 'ldap', NULL, 'member', 'ScrumGroup'),
  ('can.ozturk', 'Can Öztürk', 'can.ozturk@firma.com', 'ldap', NULL, 'member', 'ScrumGroup')
ON CONFLICT (username) DO NOTHING;

-- ---------- İşler ----------
-- id sabit verilir ki mail/toplantı bağlantıları okunabilir olsun; sonra sequence ilerletilir.
INSERT INTO work_item (id, title, description, source_type, external_ref, status, priority, category, assignee_id, requester, due_date, created_at, updated_at, closed_at) VALUES
  (1, 'MQ channel CRM.TO.CORE RETRY durumunda', 'Sabahtan beri CRM → Çekirdek MQ channel RETRY durumunda, mesajlar DLQ''ya düşüyor. Kontrol edebilir misiniz?', 'mail', NULL, 'in_progress', 'high', 'Olay', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Deniz Arslan', current_date, now() - interval '84 minutes', now() - interval '30 minutes', NULL),
  (2, 'APPSRV07-09 server upgrade (RHEL 8)', 'Destek süresi biten üç uygulama sunucusunun RHEL 8''e server upgrade''i için bakım penceresi planlayalım. Liste ektedir.', 'mail', NULL, 'new', 'normal', 'Talep', NULL, 'Murat Aydın', current_date + 2, now() - interval '234 minutes', now() - interval '234 minutes', NULL),
  (3, 'OpenShift operator uyumluluk kontrolü', 'Upgrade hazırlık toplantısından çıkan aksiyon maddesi.', 'zoom', NULL, 'new', 'high', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Selin Koç', current_date + 1, now() - interval '150 minutes', now() - interval '150 minutes', NULL),
  (4, 'Ödeme platformu release''i için test ortamı deploy', 'Cuma günkü sprint demosu için ödeme platformunun son versiyonunun test ortamına deploy edilmesi gerekiyor.', 'mail', NULL, 'waiting', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Gizem Yıldız', current_date - 1, now() - interval '1500 minutes', now() - interval '360 minutes', NULL),
  (5, 'Q1 sunucu decom listesi', 'Kullanılmayan sunucular için decom planı çıkarılacak.', 'manual', NULL, 'done', 'low', 'Planlama', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'admin', current_date - 3, now() - interval '5760 minutes', now() - interval '1800 minutes', now() - interval '1800 minutes'),
  (6, 'Kart: mobil backend pipeline build adımında failed', 'TFS Kanban kartı — build adımında nexus bağımlılık hatası.', 'tfs', 'TFS-48190', 'in_progress', 'critical', 'Kanban', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Burak Çetin', current_date, now() - interval '480 minutes', now() - interval '60 minutes', NULL),
  (7, 'MQ kuyruk derinliği alarmı', 'Takıma iletilen talep.', 'mail', NULL, 'done', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'admin'), 'Deniz Arslan', current_date + 2, now() - interval '600 minutes', now() - interval '300 minutes', now() - interval '240 minutes'),
  (8, 'Jenkins agent disk doluluğu', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47017', 'done', 'critical', 'Kanban', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Murat Aydın', current_date + 1, now() - interval '2820 minutes', now() - interval '1410 minutes', now() - interval '1128 minutes'),
  (9, 'OpenShift test cluster upgrade', 'Jira kaydından gelen iş.', 'jira', 'OPS-914', 'done', 'normal', 'Jira', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Burak Çetin', current_date + 1, now() - interval '5040 minutes', now() - interval '2520 minutes', now() - interval '2016 minutes'),
  (10, 'RHEL yama (patch) penceresi', 'Takıma iletilen talep.', 'mail', NULL, 'in_progress', 'low', 'Planlama', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Selin Koç', current_date, now() - interval '7260 minutes', now() - interval '3630 minutes', NULL),
  (11, 'Batch job failed — gece mutabakatı', 'Takıma iletilen talep.', 'zoom', NULL, 'waiting', 'high', 'Talep', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Elif Şahin', current_date - 5, now() - interval '9480 minutes', now() - interval '4740 minutes', NULL),
  (12, 'Change kaydı için CAB onayı', 'Jira kaydından gelen iş.', 'jira', 'OPS-935', 'new', 'normal', 'Jira', (SELECT id FROM app_user WHERE username = 'admin'), 'Gizem Yıldız', current_date - 5, now() - interval '11700 minutes', now() - interval '5850 minutes', NULL),
  (13, 'Eski DNS kayıtlarının temizliği (decom)', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47102', 'done', 'normal', 'Kanban', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Emre Kurt', current_date - 6, now() - interval '13920 minutes', now() - interval '6960 minutes', now() - interval '5568 minutes'),
  (14, 'Helm chart versiyon güncellemesi', 'Takıma iletilen talep.', 'manual', NULL, 'cancelled', 'critical', 'Planlama', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Hakan Erdem', current_date - 6, now() - interval '16140 minutes', now() - interval '8070 minutes', now() - interval '6456 minutes'),
  (15, 'Incident: API gateway timeout', 'Takıma iletilen talep.', 'mail', NULL, 'done', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Deniz Arslan', current_date - 11, now() - interval '18360 minutes', now() - interval '9180 minutes', now() - interval '7344 minutes'),
  (16, 'Windows Server 2012 server upgrade', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47153', 'done', 'low', 'Kanban', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Murat Aydın', current_date + 2, now() - interval '1380 minutes', now() - interval '690 minutes', now() - interval '552 minutes'),
  (17, 'MQ sertifika yenilemesi', 'Jira kaydından gelen iş.', 'jira', 'OPS-970', 'done', 'high', 'Jira', (SELECT id FROM app_user WHERE username = 'admin'), 'Burak Çetin', current_date + 2, now() - interval '3600 minutes', now() - interval '1800 minutes', now() - interval '1440 minutes'),
  (18, 'ArgoCD senkron hatası', 'Takıma iletilen talep.', 'mail', NULL, 'in_progress', 'normal', 'Planlama', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Selin Koç', current_date + 1, now() - interval '5820 minutes', now() - interval '2910 minutes', NULL),
  (19, 'Backlog: log toplama geliştirmesi', 'Takıma iletilen talep.', 'zoom', NULL, 'waiting', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Elif Şahin', current_date - 4, now() - interval '8040 minutes', now() - interval '4020 minutes', NULL),
  (20, 'Problem kaydı: tekrarlayan pod restart', 'Jira kaydından gelen iş.', 'jira', 'OPS-991', 'new', 'critical', 'Jira', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Gizem Yıldız', current_date - 4, now() - interval '10260 minutes', now() - interval '5130 minutes', NULL),
  (21, 'Decom: eski rapor sunucuları', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47238', 'done', 'normal', 'Kanban', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Emre Kurt', current_date - 5, now() - interval '12480 minutes', now() - interval '6240 minutes', now() - interval '4992 minutes'),
  (22, 'Sprint release deploy penceresi', 'Takıma iletilen talep.', 'manual', NULL, 'cancelled', 'low', 'Planlama', (SELECT id FROM app_user WHERE username = 'admin'), 'Hakan Erdem', current_date - 5, now() - interval '14700 minutes', now() - interval '7350 minutes', now() - interval '5880 minutes'),
  (23, 'MQ kuyruk derinliği alarmı', 'Takıma iletilen talep.', 'mail', NULL, 'done', 'high', 'Talep', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Deniz Arslan', current_date - 10, now() - interval '16920 minutes', now() - interval '8460 minutes', now() - interval '6768 minutes'),
  (24, 'Jenkins agent disk doluluğu', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47289', 'done', 'normal', 'Kanban', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Murat Aydın', current_date - 10, now() - interval '19140 minutes', now() - interval '9570 minutes', now() - interval '7656 minutes'),
  (25, 'OpenShift test cluster upgrade', 'Jira kaydından gelen iş.', 'jira', 'OPS-1026', 'done', 'normal', 'Jira', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Burak Çetin', current_date + 3, now() - interval '2160 minutes', now() - interval '1080 minutes', now() - interval '864 minutes'),
  (26, 'RHEL yama (patch) penceresi', 'Takıma iletilen talep.', 'mail', NULL, 'in_progress', 'critical', 'Planlama', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Selin Koç', current_date + 2, now() - interval '4380 minutes', now() - interval '2190 minutes', NULL),
  (27, 'Batch job failed — gece mutabakatı', 'Takıma iletilen talep.', 'zoom', NULL, 'waiting', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'admin'), 'Elif Şahin', current_date - 3, now() - interval '6600 minutes', now() - interval '3300 minutes', NULL),
  (28, 'Change kaydı için CAB onayı', 'Jira kaydından gelen iş.', 'jira', 'OPS-1047', 'new', 'low', 'Jira', NULL, 'Gizem Yıldız', current_date - 3, now() - interval '8820 minutes', now() - interval '4410 minutes', NULL),
  (29, 'Eski DNS kayıtlarının temizliği (decom)', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47374', 'done', 'high', 'Kanban', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Emre Kurt', current_date - 4, now() - interval '11040 minutes', now() - interval '5520 minutes', now() - interval '4416 minutes'),
  (30, 'Helm chart versiyon güncellemesi', 'Takıma iletilen talep.', 'manual', NULL, 'cancelled', 'normal', 'Planlama', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Hakan Erdem', current_date - 4, now() - interval '13260 minutes', now() - interval '6630 minutes', now() - interval '5304 minutes'),
  (31, 'Incident: API gateway timeout', 'Takıma iletilen talep.', 'mail', NULL, 'done', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Deniz Arslan', current_date - 9, now() - interval '15480 minutes', now() - interval '7740 minutes', now() - interval '6192 minutes'),
  (32, 'Windows Server 2012 server upgrade', 'TFS Kanban kartından gelen iş.', 'tfs', 'TFS-47425', 'done', 'critical', 'Kanban', (SELECT id FROM app_user WHERE username = 'admin'), 'Murat Aydın', current_date - 9, now() - interval '17700 minutes', now() - interval '8850 minutes', now() - interval '7080 minutes');
SELECT setval(pg_get_serial_sequence('work_item','id'), (SELECT max(id) FROM work_item));

INSERT INTO work_item_tag (work_item_id, tag) VALUES
  (1, 'mq'),
  (1, 'prod'),
  (2, 'upgrade'),
  (3, 'openshift'),
  (4, 'release'),
  (6, 'pipeline');

-- ---------- E-postalar ----------
INSERT INTO email (id, message_id, thread_id, mailbox, from_address, from_name, to_addresses, cc_addresses, subject, body_preview, importance, has_attachments, received_at, is_read, work_item_id) VALUES
  (1, '<a1@firma.com>', 't1', 'takim@firma.com', 'deniz.arslan@firma.com', 'Deniz Arslan', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'MQ channel CRM.TO.CORE RETRY durumunda', 'Sabahtan beri CRM → Çekirdek MQ channel RETRY durumunda, mesajlar DLQ''ya düşüyor. Kontrol edebilir misiniz?', 'high', FALSE, now() - interval '90 minutes', FALSE, 1),
  (2, '<a2@firma.com>', 't2', 'takim@firma.com', 'murat.aydin@firma.com', 'Murat Aydın', '["takim@firma.com"]'::jsonb, '["sistem@firma.com"]'::jsonb, 'APPSRV07-09 server upgrade (RHEL 8)', 'Destek süresi biten üç uygulama sunucusunun RHEL 8''e server upgrade''i için bakım penceresi planlayalım. Liste ektedir.', 'normal', TRUE, now() - interval '240 minutes', TRUE, 2),
  (3, '<a3@firma.com>', 't3', 'takim@firma.com', 'noreply@monitor.firma.com', 'İzleme Sistemi', '["takim@firma.com"]'::jsonb, '[]'::jsonb, '[UYARI] OpenShift worker-node-05 disk doluluğu %85', 'ocp-prod worker-node-05 üzerinde /var/lib/containers %85 doluluğa ulaştı.', 'high', FALSE, now() - interval '20 minutes', FALSE, NULL),
  (4, '<a4@firma.com>', 't4', 'takim@firma.com', 'gizem.yildiz@firma.com', 'Gizem Yıldız', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Ödeme platformu release''i için test ortamı', 'Cuma günkü sprint demosu için ödeme platformunun son versiyonunun test ortamına deploy edilmesi gerekiyor.', 'normal', FALSE, now() - interval '1560 minutes', TRUE, 4),
  (5, '<a5@firma.com>', 't5', 'takim@firma.com', 'selin.koc@firma.com', 'Selin Koç', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Teşekkürler — Jenkins sorunu çözüldü', 'Dünkü Jenkins agent sorunu çözüldü, hızlı dönüşünüz için teşekkürler.', 'low', FALSE, now() - interval '3000 minutes', TRUE, NULL),
  (6, '<gen0@firma.com>', 'g0', 'takim@firma.com', 'burak.cetin@firma.com', 'Burak Çetin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Jenkins agent disk doluluğu', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'high', TRUE, now() - interval '360 minutes', FALSE, NULL),
  (7, '<gen1@firma.com>', 'g1', 'takim@firma.com', 'selin.koc@firma.com', 'Selin Koç', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Batch job failed — gece mutabakatı', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '900 minutes', FALSE, NULL),
  (8, '<gen2@firma.com>', 'g2', 'takim@firma.com', 'elif.sahin@firma.com', 'Elif Şahin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Helm chart versiyon güncellemesi', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '1440 minutes', TRUE, NULL),
  (9, '<gen3@firma.com>', 'g3', 'takim@firma.com', 'gizem.yildiz@firma.com', 'Gizem Yıldız', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'MQ sertifika yenilemesi', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', TRUE, now() - interval '1980 minutes', TRUE, NULL),
  (10, '<gen4@firma.com>', 'g4', 'takim@firma.com', 'emre.kurt@firma.com', 'Emre Kurt', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Problem kaydı: tekrarlayan pod restart', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'high', FALSE, now() - interval '2520 minutes', TRUE, NULL),
  (11, '<gen5@firma.com>', 'g5', 'takim@firma.com', 'hakan.erdem@firma.com', 'Hakan Erdem', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'MQ kuyruk derinliği alarmı', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '3060 minutes', TRUE, NULL),
  (12, '<gen6@firma.com>', 'g6', 'takim@firma.com', 'deniz.arslan@firma.com', 'Deniz Arslan', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'RHEL yama (patch) penceresi', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', TRUE, now() - interval '3600 minutes', TRUE, NULL),
  (13, '<gen7@firma.com>', 'g7', 'takim@firma.com', 'murat.aydin@firma.com', 'Murat Aydın', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Eski DNS kayıtlarının temizliği (decom)', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '4140 minutes', TRUE, NULL),
  (14, '<gen8@firma.com>', 'g8', 'takim@firma.com', 'burak.cetin@firma.com', 'Burak Çetin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Windows Server 2012 server upgrade', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'high', FALSE, now() - interval '4680 minutes', TRUE, NULL);
SELECT setval(pg_get_serial_sequence('email','id'), (SELECT max(id) FROM email));
INSERT INTO email_attachment (email_id, file_name, content_type, size_bytes) VALUES (2, 'yeni_kullanicilar.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 18432);

-- ---------- Zoom toplantıları ----------
INSERT INTO meeting (id, zoom_meeting_id, zoom_uuid, topic, agenda, host_email, host_name, start_time, duration_min, timezone, join_url, status, recording_url, notes, work_item_id) VALUES
  (1, '845 2231 9087', 'u1', 'Haftalık DevOps senkronu', 'Açık işler, upgrade takvimi, engeller', 'ayse.yilmaz@firma.com', 'Ayşe Yılmaz', now() + interval '120 minutes', 45, 'Europe/Istanbul', 'https://zoom.us/j/84522319087', 'scheduled', NULL, '', NULL),
  (2, '912 0043 5521', 'u2', 'OpenShift upgrade hazırlık toplantısı', 'Prod cluster upgrade riskleri', 'zeynep.demir@firma.com', 'Zeynep Demir', now() - interval '180 minutes', 30, 'Europe/Istanbul', 'https://zoom.us/j/91200435521', 'ended', 'https://zoom.us/rec/share/ornek', 'Operator uyumluluk matrisi eksik. Aksiyon: operator sürümlerini doğrula, PDB''leri gözden geçir.', 3),
  (3, '733 8812 0045', 'u3', 'CAB — haftalık change değerlendirmesi', 'Bu haftanın change kayıtları', 'elif.sahin@firma.com', 'Elif Şahin', now() + interval '1560 minutes', 60, 'Europe/Istanbul', 'https://zoom.us/j/73388120045', 'scheduled', NULL, '', NULL),
  (4, '601 220 9000', 'gen0', 'Sprint planlama', NULL, 'ayse.yilmaz@firma.com', 'Ayşe Yılmaz', now() - interval '3000 minutes', 30, 'Europe/Istanbul', 'https://zoom.us/j/000', 'ended', NULL, '', NULL),
  (5, '611 221 9011', 'gen1', 'OpenShift upgrade gözden geçirme', NULL, 'ayse.yilmaz@firma.com', 'Mehmet Kaya', now() - interval '1620 minutes', 45, 'Europe/Istanbul', 'https://zoom.us/j/000', 'ended', NULL, '', NULL),
  (6, '621 222 9022', 'gen2', 'Incident sonrası değerlendirme', NULL, 'ayse.yilmaz@firma.com', 'Can Öztürk', now() + interval '300 minutes', 60, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL),
  (7, '631 223 9033', 'gen3', 'CAB toplantısı', NULL, 'ayse.yilmaz@firma.com', 'Ayşe Yılmaz', now() + interval '1320 minutes', 30, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL),
  (8, '641 224 9044', 'gen4', 'MQ mimari gözden geçirme', NULL, 'ayse.yilmaz@firma.com', 'Mehmet Kaya', now() + interval '1800 minutes', 45, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL),
  (9, '651 225 9055', 'gen5', 'Sprint planlama', NULL, 'ayse.yilmaz@firma.com', 'Can Öztürk', now() + interval '2880 minutes', 60, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL);
SELECT setval(pg_get_serial_sequence('meeting','id'), (SELECT max(id) FROM meeting));
INSERT INTO meeting_participant (meeting_id, name, email, attended) VALUES
  (1, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (1, 'Mehmet Kaya', 'mehmet.kaya@firma.com', FALSE),
  (1, 'Zeynep Demir', 'zeynep.demir@firma.com', FALSE),
  (2, 'Zeynep Demir', 'zeynep.demir@firma.com', TRUE),
  (2, 'Selin Koç', 'selin.koc@firma.com', TRUE),
  (3, 'Elif Şahin', 'elif.sahin@firma.com', FALSE),
  (3, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (4, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', TRUE),
  (4, 'Zeynep Demir', 'zeynep.demir@firma.com', TRUE),
  (4, 'Can Öztürk', 'can.ozturk@firma.com', FALSE),
  (5, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', TRUE),
  (5, 'Zeynep Demir', 'zeynep.demir@firma.com', TRUE),
  (5, 'Can Öztürk', 'can.ozturk@firma.com', FALSE),
  (6, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (6, 'Zeynep Demir', 'zeynep.demir@firma.com', FALSE),
  (6, 'Can Öztürk', 'can.ozturk@firma.com', FALSE),
  (7, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (7, 'Zeynep Demir', 'zeynep.demir@firma.com', FALSE),
  (7, 'Can Öztürk', 'can.ozturk@firma.com', FALSE),
  (8, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (8, 'Zeynep Demir', 'zeynep.demir@firma.com', FALSE),
  (8, 'Can Öztürk', 'can.ozturk@firma.com', FALSE),
  (9, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (9, 'Zeynep Demir', 'zeynep.demir@firma.com', FALSE),
  (9, 'Can Öztürk', 'can.ozturk@firma.com', FALSE);

-- İş ↔ kaynak bağlantıları (mail/toplantıdan açılan işler)
UPDATE work_item SET source_id = 1 WHERE id = 1;
UPDATE work_item SET source_id = 2 WHERE id = 2;
UPDATE work_item SET source_id = 2 WHERE id = 3;
UPDATE work_item SET source_id = 4 WHERE id = 4;
UPDATE meeting SET work_item_id = 3 WHERE id = 2;

-- ---------- İş tarihçesi ----------
INSERT INTO work_item_activity (work_item_id, actor_id, action, old_value, new_value, comment, created_at) VALUES
  (1, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '84 minutes'),
  (2, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '234 minutes'),
  (3, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '150 minutes'),
  (4, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '1500 minutes'),
  (5, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '5760 minutes'),
  (6, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '480 minutes'),
  (7, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '600 minutes'),
  (8, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '2820 minutes'),
  (9, NULL, 'created', NULL, NULL, 'Jira kaydından oluşturuldu', now() - interval '5040 minutes'),
  (10, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '7260 minutes'),
  (11, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '9480 minutes'),
  (12, NULL, 'created', NULL, NULL, 'Jira kaydından oluşturuldu', now() - interval '11700 minutes'),
  (13, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '13920 minutes'),
  (14, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '16140 minutes'),
  (15, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '18360 minutes'),
  (16, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '1380 minutes'),
  (17, NULL, 'created', NULL, NULL, 'Jira kaydından oluşturuldu', now() - interval '3600 minutes'),
  (18, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '5820 minutes'),
  (19, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '8040 minutes'),
  (20, NULL, 'created', NULL, NULL, 'Jira kaydından oluşturuldu', now() - interval '10260 minutes'),
  (21, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '12480 minutes'),
  (22, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '14700 minutes'),
  (23, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '16920 minutes'),
  (24, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '19140 minutes'),
  (25, NULL, 'created', NULL, NULL, 'Jira kaydından oluşturuldu', now() - interval '2160 minutes'),
  (26, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '4380 minutes'),
  (27, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '6600 minutes'),
  (28, NULL, 'created', NULL, NULL, 'Jira kaydından oluşturuldu', now() - interval '8820 minutes'),
  (29, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '11040 minutes'),
  (30, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '13260 minutes'),
  (31, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '15480 minutes'),
  (32, NULL, 'created', NULL, NULL, 'TFS Kanban kartından oluşturuldu', now() - interval '17700 minutes'),
  (1, (SELECT id FROM app_user WHERE username = 'admin'), 'status', 'new', 'in_progress', 'Durum: Yeni → Devam ediyor', now() - interval '60 minutes'),
  (1, (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'comment', NULL, NULL, 'Yavaş sorgu tespit edildi, indeks analizi yapılıyor.', now() - interval '40 minutes'),
  (4, (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'status', 'in_progress', 'waiting', 'Durum: Devam ediyor → Beklemede', now() - interval '360 minutes');

-- ---------- API çağrı servisleri (varsayılan 1 dk) ----------
INSERT INTO api_poll_config (name, enabled, target, url, method, interval_sec, timeout_sec, auth_type, headers_json) VALUES
  ('Mail kutusu senkronu', FALSE, 'mail', '/api/integrations/mail/sync', 'GET', 60, 15, 'none', '{
  "Accept": "application/json"
}'),
  ('Zoom toplantı senkronu', FALSE, 'zoom', '/api/integrations/zoom/sync', 'GET', 60, 15, 'none', '{
  "Accept": "application/json"
}'),
  ('TFS Kanban kartları', FALSE, 'tfs', 'https://tfs.firma.local/tfs/DefaultCollection/_apis/wit/wiql?api-version=6.0', 'GET', 60, 15, 'none', '{
  "Accept": "application/json"
}'),
  ('Jira kayıtları', FALSE, 'jira', 'https://jira.firma.local/rest/api/2/search?jql=project=OPS', 'GET', 60, 15, 'none', '{
  "Accept": "application/json"
}');

-- ---------- Ayarlar ----------
INSERT INTO app_setting (category, key, value, is_secret) VALUES
  ('ldap', 'enabled', 'false', FALSE),
  ('ldap', 'server', 'ldaps://dc.firma.local', FALSE),
  ('ldap', 'port', '636', FALSE),
  ('ldap', 'use_ssl', 'true', FALSE),
  ('ldap', 'start_tls', 'false', FALSE),
  ('ldap', 'skip_cert_verify', 'false', FALSE),
  ('ldap', 'ca_cert', '', FALSE),
  ('ldap', 'bind_dn', 'CN=svc_yaver,OU=Service Accounts,DC=firma,DC=local', FALSE),
  ('ldap', 'bind_password', '', TRUE),
  ('ldap', 'base_dn', 'DC=firma,DC=local', FALSE),
  ('ldap', 'user_filter', '(&(objectClass=user)(sAMAccountName={username}))', FALSE),
  ('ldap', 'user_attr', 'sAMAccountName', FALSE),
  ('ldap', 'email_attr', 'mail', FALSE),
  ('ldap', 'display_attr', 'displayName', FALSE),
  ('ldap', 'group_base', '', FALSE),
  ('ldap', 'group_filter', '', FALSE),
  ('ldap', 'team_group_ou', 'ScrumGroup', FALSE),
  ('ldap', 'timeout_sec', '10', FALSE),
  ('general', 'app_title', 'Yaver', FALSE),
  ('general', 'default_assignee', '', FALSE),
  ('general', 'sla_hours', '24', FALSE),
  ('general', 'mailbox', 'takim@firma.com', FALSE),
  ('general', 'team_members', '["admin","ayse.yilmaz","mehmet.kaya","zeynep.demir","can.ozturk"]', FALSE)
ON CONFLICT (category, key) DO NOTHING;

COMMIT;
