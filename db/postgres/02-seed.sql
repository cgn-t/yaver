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
  ('admin', 'Yönetici', 'admin@firma.com', 'local', 'scrypt$2c3f7ddbfcb7fd01bfcdc5a0bf3e9e44$d299d17acd9d30dc386013e5b2cb7ef92d482a8bec81f1644a71a61140225e5f', 'admin', 'ScrumGroup'),
  ('ayse.yilmaz', 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', 'ldap', NULL, 'member', 'ScrumGroup'),
  ('mehmet.kaya', 'Mehmet Kaya', 'mehmet.kaya@firma.com', 'ldap', NULL, 'member', 'ScrumGroup'),
  ('zeynep.demir', 'Zeynep Demir', 'zeynep.demir@firma.com', 'ldap', NULL, 'member', 'ScrumGroup'),
  ('can.ozturk', 'Can Öztürk', 'can.ozturk@firma.com', 'ldap', NULL, 'member', 'ScrumGroup')
ON CONFLICT (username) DO NOTHING;

-- ---------- İşler ----------
-- id sabit verilir ki mail/toplantı bağlantıları okunabilir olsun; sonra sequence ilerletilir.
INSERT INTO work_item (id, title, description, source_type, status, priority, category, assignee_id, requester, due_date, created_at, updated_at, closed_at) VALUES
  (1, 'Prod rapor servisi yavaşlığı', 'Merhaba, sabahtan beri aylık rapor ekranı 30 sn üzerinde açılıyor. Kontrol edebilir misiniz?', 'mail', 'in_progress', 'high', 'Olay', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Deniz Arslan', current_date, now() - interval '84 minutes', now() - interval '30 minutes', NULL),
  (2, 'Yeni kullanıcılar için yetki açılması', 'Ekibimize katılan 3 kişi için uygulama erişimi açılmasını rica ederiz. Liste ektedir.', 'mail', 'new', 'normal', 'Talep', NULL, 'Elif Şahin', current_date + 2, now() - interval '234 minutes', now() - interval '234 minutes', NULL),
  (3, 'Rapor sorgusuna indeks eklenmesi', 'Performans toplantısından çıkan aksiyon maddesi.', 'zoom', 'new', 'high', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Mehmet Kaya', current_date + 1, now() - interval '150 minutes', now() - interval '150 minutes', NULL),
  (4, 'Sprint demo test ortamı hazırlığı', 'Cuma günkü demo için test ortamına son sürümün çıkılması gerekiyor.', 'mail', 'waiting', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Burak Çetin', current_date - 1, now() - interval '1500 minutes', now() - interval '360 minutes', NULL),
  (5, 'Sertifika yenileme takvimi', 'Q1 yenilemeleri için plan çıkarılacak.', 'manual', 'done', 'low', 'Planlama', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'admin', current_date - 3, now() - interval '5760 minutes', now() - interval '1800 minutes', now() - interval '1800 minutes'),
  (6, 'Jira kayıtlarının senkronizasyonu', 'API servisinden gelen dış kayıt.', 'api', 'in_progress', 'critical', 'Entegrasyon', (SELECT id FROM app_user WHERE username = 'admin'), 'Jira', current_date, now() - interval '480 minutes', now() - interval '60 minutes', NULL),
  (7, 'VPN erişim talebi', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'admin'), 'Deniz Arslan', current_date + 2, now() - interval '600 minutes', now() - interval '300 minutes', now() - interval '240 minutes'),
  (8, 'Rapor çıktısında hatalı toplam', 'Takıma iletilen talep.', 'mail', 'done', 'critical', 'Olay', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Elif Şahin', current_date + 1, now() - interval '2820 minutes', now() - interval '1410 minutes', now() - interval '1128 minutes'),
  (9, 'Yeni ortam için DNS kaydı', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Burak Çetin', current_date + 1, now() - interval '5040 minutes', now() - interval '2520 minutes', now() - interval '2016 minutes'),
  (10, 'Log arşivleme politikası', 'Takıma iletilen talep.', 'zoom', 'in_progress', 'low', 'Planlama', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Selin Koç', current_date, now() - interval '7260 minutes', now() - interval '3630 minutes', NULL),
  (11, 'Kullanıcı şifre sıfırlama', 'Takıma iletilen talep.', 'manual', 'waiting', 'high', 'Talep', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Murat Aydın', current_date - 5, now() - interval '9480 minutes', now() - interval '4740 minutes', NULL),
  (12, 'API yanıt süresi uyarısı', 'Takıma iletilen talep.', 'api', 'new', 'normal', 'Olay', (SELECT id FROM app_user WHERE username = 'admin'), 'Gizem Yıldız', current_date - 5, now() - interval '11700 minutes', now() - interval '5850 minutes', NULL),
  (13, 'Lisans yenileme hatırlatması', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Deniz Arslan', current_date - 6, now() - interval '13920 minutes', now() - interval '6960 minutes', now() - interval '5568 minutes'),
  (14, 'Test verisi maskeleme', 'Takıma iletilen talep.', 'mail', 'cancelled', 'critical', 'Planlama', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Elif Şahin', current_date - 6, now() - interval '16140 minutes', now() - interval '8070 minutes', now() - interval '6456 minutes'),
  (15, 'Dashboard yetki düzenlemesi', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Burak Çetin', current_date - 11, now() - interval '18360 minutes', now() - interval '9180 minutes', now() - interval '7344 minutes'),
  (16, 'Batch iş gecikmesi', 'Takıma iletilen talep.', 'zoom', 'done', 'low', 'Olay', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Selin Koç', current_date + 2, now() - interval '1380 minutes', now() - interval '690 minutes', now() - interval '552 minutes'),
  (17, 'Mobil uygulama giriş sorunu', 'Takıma iletilen talep.', 'manual', 'done', 'high', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'admin'), 'Murat Aydın', current_date + 2, now() - interval '3600 minutes', now() - interval '1800 minutes', now() - interval '1440 minutes'),
  (18, 'Sunucu yama planı', 'Takıma iletilen talep.', 'api', 'in_progress', 'normal', 'Planlama', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Gizem Yıldız', current_date + 1, now() - interval '5820 minutes', now() - interval '2910 minutes', NULL),
  (19, 'Yedekleme doğrulaması', 'Takıma iletilen talep.', 'mail', 'waiting', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Deniz Arslan', current_date - 4, now() - interval '8040 minutes', now() - interval '4020 minutes', NULL),
  (20, 'Müşteri veri çekme talebi', 'Takıma iletilen talep.', 'mail', 'new', 'critical', 'Olay', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Elif Şahin', current_date - 4, now() - interval '10260 minutes', now() - interval '5130 minutes', NULL),
  (21, 'SSO entegrasyon testi', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Burak Çetin', current_date - 5, now() - interval '12480 minutes', now() - interval '6240 minutes', now() - interval '4992 minutes'),
  (22, 'Kapasite raporu hazırlığı', 'Takıma iletilen talep.', 'zoom', 'cancelled', 'low', 'Planlama', (SELECT id FROM app_user WHERE username = 'admin'), 'Selin Koç', current_date - 5, now() - interval '14700 minutes', now() - interval '7350 minutes', now() - interval '5880 minutes'),
  (23, 'VPN erişim talebi', 'Takıma iletilen talep.', 'manual', 'done', 'high', 'Talep', (SELECT id FROM app_user WHERE username = 'zeynep.demir'), 'Murat Aydın', current_date - 10, now() - interval '16920 minutes', now() - interval '8460 minutes', now() - interval '6768 minutes'),
  (24, 'Rapor çıktısında hatalı toplam', 'Takıma iletilen talep.', 'api', 'done', 'normal', 'Olay', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Gizem Yıldız', current_date - 10, now() - interval '19140 minutes', now() - interval '9570 minutes', now() - interval '7656 minutes'),
  (25, 'Yeni ortam için DNS kaydı', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Deniz Arslan', current_date + 3, now() - interval '2160 minutes', now() - interval '1080 minutes', now() - interval '864 minutes'),
  (26, 'Log arşivleme politikası', 'Takıma iletilen talep.', 'mail', 'in_progress', 'critical', 'Planlama', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Elif Şahin', current_date + 2, now() - interval '4380 minutes', now() - interval '2190 minutes', NULL),
  (27, 'Kullanıcı şifre sıfırlama', 'Takıma iletilen talep.', 'mail', 'waiting', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'admin'), 'Burak Çetin', current_date - 3, now() - interval '6600 minutes', now() - interval '3300 minutes', NULL),
  (28, 'API yanıt süresi uyarısı', 'Takıma iletilen talep.', 'zoom', 'new', 'low', 'Olay', NULL, 'Selin Koç', current_date - 3, now() - interval '8820 minutes', now() - interval '4410 minutes', NULL),
  (29, 'Lisans yenileme hatırlatması', 'Takıma iletilen talep.', 'manual', 'done', 'high', 'Aksiyon', (SELECT id FROM app_user WHERE username = 'ayse.yilmaz'), 'Murat Aydın', current_date - 4, now() - interval '11040 minutes', now() - interval '5520 minutes', now() - interval '4416 minutes'),
  (30, 'Test verisi maskeleme', 'Takıma iletilen talep.', 'api', 'cancelled', 'normal', 'Planlama', (SELECT id FROM app_user WHERE username = 'can.ozturk'), 'Gizem Yıldız', current_date - 4, now() - interval '13260 minutes', now() - interval '6630 minutes', now() - interval '5304 minutes'),
  (31, 'Dashboard yetki düzenlemesi', 'Takıma iletilen talep.', 'mail', 'done', 'normal', 'Talep', (SELECT id FROM app_user WHERE username = 'mehmet.kaya'), 'Deniz Arslan', current_date - 9, now() - interval '15480 minutes', now() - interval '7740 minutes', now() - interval '6192 minutes'),
  (32, 'Batch iş gecikmesi', 'Takıma iletilen talep.', 'mail', 'done', 'critical', 'Olay', (SELECT id FROM app_user WHERE username = 'admin'), 'Elif Şahin', current_date - 9, now() - interval '17700 minutes', now() - interval '8850 minutes', now() - interval '7080 minutes');
SELECT setval(pg_get_serial_sequence('work_item','id'), (SELECT max(id) FROM work_item));

INSERT INTO work_item_tag (work_item_id, tag) VALUES
  (1, 'prod'),
  (1, 'performans'),
  (2, 'yetki'),
  (3, 'db'),
  (4, 'test'),
  (6, 'entegrasyon');

-- ---------- E-postalar ----------
INSERT INTO email (id, message_id, thread_id, mailbox, from_address, from_name, to_addresses, cc_addresses, subject, body_preview, importance, has_attachments, received_at, is_read, work_item_id) VALUES
  (1, '<a1@firma.com>', 't1', 'takim@firma.com', 'deniz.arslan@firma.com', 'Deniz Arslan', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Prod ortamında rapor servisi yavaş', 'Merhaba, sabahtan beri aylık rapor ekranı 30 sn üzerinde açılıyor. Kontrol edebilir misiniz?', 'high', FALSE, now() - interval '90 minutes', FALSE, 1),
  (2, '<a2@firma.com>', 't2', 'takim@firma.com', 'elif.sahin@firma.com', 'Elif Şahin', '["takim@firma.com"]'::jsonb, '["yonetim@firma.com"]'::jsonb, 'Yeni kullanıcı yetki talebi', 'Ekibimize katılan 3 kişi için uygulama erişimi açılmasını rica ederiz. Liste ektedir.', 'normal', TRUE, now() - interval '240 minutes', TRUE, 2),
  (3, '<a3@firma.com>', 't3', 'takim@firma.com', 'noreply@monitor.firma.com', 'İzleme Sistemi', '["takim@firma.com"]'::jsonb, '[]'::jsonb, '[UYARI] Disk doluluk %85 — app-node-03', 'app-node-03 üzerinde /var bölümü %85 doluluğa ulaştı.', 'high', FALSE, now() - interval '20 minutes', FALSE, NULL),
  (4, '<a4@firma.com>', 't4', 'takim@firma.com', 'burak.cetin@firma.com', 'Burak Çetin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Sprint demo için ortam hazırlığı', 'Cuma günkü demo için test ortamına son sürümün çıkılması gerekiyor.', 'normal', FALSE, now() - interval '1560 minutes', TRUE, 4),
  (5, '<a5@firma.com>', 't5', 'takim@firma.com', 'selin.koc@firma.com', 'Selin Koç', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Teşekkürler — sorun çözüldü', 'Dünkü bağlantı sorunu çözüldü, ilginiz için teşekkürler.', 'low', FALSE, now() - interval '3000 minutes', TRUE, NULL),
  (6, '<gen0@firma.com>', 'g0', 'takim@firma.com', 'burak.cetin@firma.com', 'Burak Çetin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Rapor çıktısında hatalı toplam', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'high', TRUE, now() - interval '360 minutes', FALSE, NULL),
  (7, '<gen1@firma.com>', 'g1', 'takim@firma.com', 'selin.koc@firma.com', 'Selin Koç', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Kullanıcı şifre sıfırlama', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '900 minutes', FALSE, NULL),
  (8, '<gen2@firma.com>', 'g2', 'takim@firma.com', 'murat.aydin@firma.com', 'Murat Aydın', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Test verisi maskeleme', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '1440 minutes', TRUE, NULL),
  (9, '<gen3@firma.com>', 'g3', 'takim@firma.com', 'gizem.yildiz@firma.com', 'Gizem Yıldız', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Mobil uygulama giriş sorunu', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', TRUE, now() - interval '1980 minutes', TRUE, NULL),
  (10, '<gen4@firma.com>', 'g4', 'takim@firma.com', 'deniz.arslan@firma.com', 'Deniz Arslan', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Müşteri veri çekme talebi', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'high', FALSE, now() - interval '2520 minutes', TRUE, NULL),
  (11, '<gen5@firma.com>', 'g5', 'takim@firma.com', 'elif.sahin@firma.com', 'Elif Şahin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'VPN erişim talebi', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '3060 minutes', TRUE, NULL),
  (12, '<gen6@firma.com>', 'g6', 'takim@firma.com', 'burak.cetin@firma.com', 'Burak Çetin', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Log arşivleme politikası', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', TRUE, now() - interval '3600 minutes', TRUE, NULL),
  (13, '<gen7@firma.com>', 'g7', 'takim@firma.com', 'selin.koc@firma.com', 'Selin Koç', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Lisans yenileme hatırlatması', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'normal', FALSE, now() - interval '4140 minutes', TRUE, NULL),
  (14, '<gen8@firma.com>', 'g8', 'takim@firma.com', 'murat.aydin@firma.com', 'Murat Aydın', '["takim@firma.com"]'::jsonb, '[]'::jsonb, 'Batch iş gecikmesi', 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', 'high', FALSE, now() - interval '4680 minutes', TRUE, NULL);
SELECT setval(pg_get_serial_sequence('email','id'), (SELECT max(id) FROM email));
INSERT INTO email_attachment (email_id, file_name, content_type, size_bytes) VALUES (2, 'yeni_kullanicilar.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 18432);

-- ---------- Zoom toplantıları ----------
INSERT INTO meeting (id, zoom_meeting_id, zoom_uuid, topic, agenda, host_email, host_name, start_time, duration_min, timezone, join_url, status, recording_url, notes, work_item_id) VALUES
  (1, '845 2231 9087', 'u1', 'Haftalık takım senkronu', 'Açık işler, engeller, sprint durumu', 'ayse.yilmaz@firma.com', 'Ayşe Yılmaz', now() + interval '120 minutes', 45, 'Europe/Istanbul', 'https://zoom.us/j/84522319087', 'scheduled', NULL, '', NULL),
  (2, '912 0043 5521', 'u2', 'Rapor servisi performans analizi', 'Yavaşlık kök neden analizi', 'mehmet.kaya@firma.com', 'Mehmet Kaya', now() - interval '180 minutes', 30, 'Europe/Istanbul', 'https://zoom.us/j/91200435521', 'ended', 'https://zoom.us/rec/share/ornek', 'İndeks eksikliği tespit edildi. Aksiyon: indeks ekle, sorguyu optimize et.', 3),
  (3, '733 8812 0045', 'u3', 'Müşteri entegrasyon toplantısı', 'API sözleşmesi', 'can.ozturk@firma.com', 'Can Öztürk', now() + interval '1560 minutes', 60, 'Europe/Istanbul', 'https://zoom.us/j/73388120045', 'scheduled', NULL, '', NULL),
  (4, '601 220 9000', 'gen0', 'Sprint planlama', NULL, 'ayse.yilmaz@firma.com', 'Ayşe Yılmaz', now() - interval '3000 minutes', 30, 'Europe/Istanbul', 'https://zoom.us/j/000', 'ended', NULL, '', NULL),
  (5, '611 221 9011', 'gen1', 'Mimari gözden geçirme', NULL, 'ayse.yilmaz@firma.com', 'Mehmet Kaya', now() - interval '1620 minutes', 45, 'Europe/Istanbul', 'https://zoom.us/j/000', 'ended', NULL, '', NULL),
  (6, '621 222 9022', 'gen2', 'Olay sonrası değerlendirme', NULL, 'ayse.yilmaz@firma.com', 'Can Öztürk', now() + interval '300 minutes', 60, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL),
  (7, '631 223 9033', 'gen3', 'Birebir: ekip lideri', NULL, 'ayse.yilmaz@firma.com', 'Ayşe Yılmaz', now() + interval '1320 minutes', 30, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL),
  (8, '641 224 9044', 'gen4', 'Ürün demo', NULL, 'ayse.yilmaz@firma.com', 'Mehmet Kaya', now() + interval '1800 minutes', 45, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL),
  (9, '651 225 9055', 'gen5', 'Sprint planlama', NULL, 'ayse.yilmaz@firma.com', 'Can Öztürk', now() + interval '2880 minutes', 60, 'Europe/Istanbul', 'https://zoom.us/j/000', 'scheduled', NULL, '', NULL);
SELECT setval(pg_get_serial_sequence('meeting','id'), (SELECT max(id) FROM meeting));
INSERT INTO meeting_participant (meeting_id, name, email, attended) VALUES
  (1, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', FALSE),
  (1, 'Mehmet Kaya', 'mehmet.kaya@firma.com', FALSE),
  (1, 'Zeynep Demir', 'zeynep.demir@firma.com', FALSE),
  (2, 'Mehmet Kaya', 'mehmet.kaya@firma.com', TRUE),
  (2, 'Deniz Arslan', 'deniz.arslan@firma.com', TRUE),
  (3, 'Can Öztürk', 'can.ozturk@firma.com', FALSE),
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
UPDATE work_item SET external_ref = 'JIRA-4821' WHERE id = 6;

-- ---------- İş tarihçesi ----------
INSERT INTO work_item_activity (work_item_id, actor_id, action, old_value, new_value, comment, created_at) VALUES
  (1, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '84 minutes'),
  (2, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '234 minutes'),
  (3, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '150 minutes'),
  (4, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '1500 minutes'),
  (5, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '5760 minutes'),
  (6, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '480 minutes'),
  (7, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '600 minutes'),
  (8, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '2820 minutes'),
  (9, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '5040 minutes'),
  (10, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '7260 minutes'),
  (11, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '9480 minutes'),
  (12, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '11700 minutes'),
  (13, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '13920 minutes'),
  (14, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '16140 minutes'),
  (15, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '18360 minutes'),
  (16, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '1380 minutes'),
  (17, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '3600 minutes'),
  (18, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '5820 minutes'),
  (19, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '8040 minutes'),
  (20, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '10260 minutes'),
  (21, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '12480 minutes'),
  (22, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '14700 minutes'),
  (23, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '16920 minutes'),
  (24, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '19140 minutes'),
  (25, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '2160 minutes'),
  (26, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '4380 minutes'),
  (27, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '6600 minutes'),
  (28, NULL, 'created', NULL, NULL, 'Toplantıdan oluşturuldu', now() - interval '8820 minutes'),
  (29, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '11040 minutes'),
  (30, NULL, 'created', NULL, NULL, 'Kayıt oluşturuldu', now() - interval '13260 minutes'),
  (31, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '15480 minutes'),
  (32, NULL, 'created', NULL, NULL, 'Mailden oluşturuldu', now() - interval '17700 minutes'),
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
