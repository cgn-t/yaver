import { query, tx } from './db.js'
import { enrichItem, interpret } from './intel.js'

/**
 * Örnek "geçmiş" verisi: kişi rehberi (unvanlar), wiki sayfaları ve son 60 günde kapanmış işler + mailleri.
 * Ajanın "geçmişe bakarak yorum" yapabilmesi için gerekir. SEED=true iken bir kez yüklenir
 * (app_setting demo/history_v1), "Demo verisini sıfırla" ile yeniden yüklenir.
 */

const CONTACTS = [
  ['hakan.erdem@firma.com', 'Hakan Erdem', 'Genel Müdür', 'Genel Müdürlük', 'gm'],
  ['selin.koc@firma.com', 'Selin Koç', 'Genel Müdür Yardımcısı', 'Bilgi Teknolojileri', 'gmy'],
  ['burak.cetin@firma.com', 'Burak Çetin', 'Genel Müdür Yardımcısı', 'Finans', 'gmy'],
  ['deniz.arslan@firma.com', 'Deniz Arslan', 'Raporlama Direktörü', 'İş Zekâsı', 'direktor'],
  ['murat.aydin@firma.com', 'Murat Aydın', 'Operasyon Direktörü', 'Operasyon', 'direktor'],
  ['elif.sahin@firma.com', 'Elif Şahin', 'İK Müdürü', 'İnsan Kaynakları', 'mudur'],
  ['gizem.yildiz@firma.com', 'Gizem Yıldız', 'Satış Müdürü', 'Satış', 'mudur'],
  ['ayse.yilmaz@firma.com', 'Ayşe Yılmaz', 'Takım Lideri', 'Uygulama Destek', 'diger'],
  ['mehmet.kaya@firma.com', 'Mehmet Kaya', 'Kıdemli Yazılım Uzmanı', 'Uygulama Destek', 'diger'],
  ['zeynep.demir@firma.com', 'Zeynep Demir', 'Veritabanı Uzmanı', 'Uygulama Destek', 'diger'],
  ['can.ozturk@firma.com', 'Can Öztürk', 'Yazılım Uzmanı', 'Uygulama Destek', 'diger'],
  ['ece.tan@musteri.com', 'Ece Tan', 'Müşteri', 'Dış', 'diger'],
]

const W = 'https://wiki.firma.local/display'
const WIKI = [
  ['ust-yonetim-sla', 'Üst yönetim taleplerinde SLA', 'Süreç', ['üst-yönetim', 'sla', 'öncelik'],
    'Genel Müdür ve GMY taleplerine 4 saat içinde ilk dönüş yapılır, iş en az Yüksek öncelikle açılır.\nDirektör taleplerinde ilk dönüş 1 iş günüdür.\nTalep eden üst yönetimse takım lideri (ayse.yilmaz) bilgilendirilir.'],
  ['prod-olay-yonetimi', 'Prod olay yönetimi (P1/P2)', 'Operasyon', ['prod', 'kesinti', 'olay', 'p1'],
    'Prod kesintisinde önce etki (kaç kullanıcı / hangi servis) belirlenir, #prod-olay kanalı açılır.\nP1: 30 dk içinde ilk durum notu, her saat güncelleme. Kök neden analizi 2 iş günü içinde wiki\'ye yazılır.'],
  ['rapor-performans', 'Rapor performans kontrol listesi', 'Raporlama', ['rapor', 'performans', 'sorgu', 'yavaş', 'indeks'],
    'Yavaş açılan raporlarda önce sorgu planına bakılır (EXPLAIN ANALYZE), eksik indeks en sık nedendir.\nAylık rapor tablosunda (fact_sales) tarih + bölge birleşik indeksi olmalıdır. Önbellek 15 dk.'],
  ['rapor-toplam-tutarsizligi', 'Raporda toplam tutarsızlığı — bilinen nedenler', 'Raporlama', ['rapor', 'toplam', 'tutarsızlık', 'hatalı'],
    'Toplamlar tutmuyorsa: 1) iade kayıtları negatif mi geliyor, 2) kur dönüşümü günü, 3) gece ETL yarım kalmış mı (batch logu).\nGeçmişte 3 vakanın 2\'si ETL\'in yarım kalmasından çıktı.'],
  ['fatura-servisi-hata-kodlari', 'Fatura servisi hata kodları', 'Finans Sistemleri', ['fatura', 'ödeme', 'hata', '500'],
    'FTR-500: e-fatura entegratörüne bağlantı yok (sertifika süresi?). FTR-409: aynı fatura numarası tekrar. FTR-503: kuyruk dolu, worker yeniden başlatılır.\nSorumlu ekip: Uygulama Destek, ikinci seviye: Finans Sistemleri.'],
  ['vpn-hesap-acma', 'VPN ve uygulama hesabı açma süreci', 'BT Hizmetleri', ['vpn', 'erişim', 'yetki', 'hesap', 'işe başlama'],
    'Yeni çalışan için İK\'dan gelen form yeterlidir. VPN grubu: VPN-Users. Uygulama rolleri yöneticinin onayıyla verilir.\nOrtalama süre: 1 iş günü.'],
  ['sso-giris-sorunlari', 'SSO / portal giriş sorunları', 'BT Hizmetleri', ['sso', 'giriş', 'portal', 'şifre'],
    'Kurumsal müşterilerde SSO hatası çoğunlukla IdP sertifikası yenilendiğinde metadata güncellenmediği için olur.\nKontrol: /saml/metadata tarihi, saat farkı (NTP).'],
  ['batch-gecikme-runbook', 'Gece batch işi gecikme runbook', 'Operasyon', ['batch', 'gecikme', 'mutabakat', 'etl'],
    'Mutabakat batch\'i 02:00\'de başlar. Gecikmede önce kilitli oturum (blocking) kontrol edilir, sonra yedekleme penceresiyle çakışma.\nKalıcı çözüm: yedekleme 04:00\'e alındı (YVR-0990).'],
  ['kvkk-veri-talebi', 'KVKK veri sahibi başvuruları', 'Hukuk & Uyum', ['kvkk', 'uyum', 'veri silme', 'denetim'],
    'Başvurular 30 gün içinde yanıtlanmalıdır. Talep Hukuk\'a iletilir, kimlik doğrulaması yapılmadan veri silinmez.\nTeknik ekip yalnız silme/anonimleştirme adımını uygular.'],
  ['lisans-sertifika-envanteri', 'Lisans ve sertifika envanteri', 'BT Hizmetleri', ['lisans', 'sertifika', 'denetim', 'envanter'],
    'Envanter tablosu her ay güncellenir. SSL sertifikaları bitişten 30 gün önce yenilenir. Denetim öncesi liste buradan alınır.'],
]

// [gün önce, çözüm süresi (gün), gönderen, konu, gövde, atanan, öncelik, kategori, çözüm notu]
const HISTORY = [
  [58, 1.5, 'deniz.arslan@firma.com', 'Aylık satış raporu çok yavaş açılıyor', 'Aylık satış raporu 40 sn\'de açılıyor, ekip kullanamıyor.', 'zeynep.demir', 'high', 'Olay',
    'fact_sales tablosuna tarih+bölge indeksi eklendi, rapor 3 sn\'ye indi.'],
  [51, 0.3, 'hakan.erdem@firma.com', 'ACİL: Yönetim sunumunda bölge toplamları hatalı', 'YK sunumundaki bölge toplamları ana tabloyla tutmuyor, bugün düzeltilmeli.', 'mehmet.kaya', 'critical', 'Olay',
    'Gece ETL yarım kalmıştı, yeniden çalıştırıldı; toplamlar düzeldi. GM\'ye 3 saatte dönüldü.'],
  [47, 2.0, 'selin.koc@firma.com', 'Fatura servisi prod\'da 500 hatası veriyor', 'e-fatura gönderimi duruyor, müşteriler fatura göremiyor.', 'mehmet.kaya', 'critical', 'Olay',
    'FTR-500: entegratör sertifikası süresi dolmuş. Sertifika yenilendi, kuyruk boşaltıldı.'],
  [44, 1.0, 'elif.sahin@firma.com', '3 yeni çalışan için VPN ve hesap açılması', 'Yeni başlayanlar için VPN ve uygulama hesabı rica ederiz.', 'can.ozturk', 'normal', 'Talep',
    'VPN-Users grubuna eklendi, uygulama rolleri yönetici onayıyla verildi.'],
  [40, 3.0, 'murat.aydin@firma.com', 'Mutabakat batch işi gecikiyor', 'Gece batch işi 3 gündür 2 saat geç bitiyor.', 'zeynep.demir', 'high', 'Olay',
    'Yedekleme penceresiyle çakışıyordu; yedekleme 04:00\'e alındı.'],
  [36, 0.5, 'burak.cetin@firma.com', 'Ödeme ekranı yavaşlığı — muhasebe kapanışı', 'Ödeme ekranı kapanış günü çok yavaş, acil bakılmalı.', 'mehmet.kaya', 'high', 'Olay',
    'Ödeme servisinde bağlantı havuzu 20→60 yapıldı, yanıt süresi normale döndü.'],
  [31, 4.0, 'deniz.arslan@firma.com', 'Kapasite raporuna disk trendi eklenmesi', 'Çeyrek kapasite raporuna disk büyüme trendi eklenebilir mi?', 'zeynep.demir', 'normal', 'Talep',
    'Rapora sunucu bazında 90 günlük disk trendi grafiği eklendi.'],
  [27, 1.0, 'gizem.yildiz@firma.com', 'Kurumsal müşteriler portala SSO ile giremiyor', 'Birkaç kurumsal müşteri SSO ile giriş yapamıyor.', 'can.ozturk', 'high', 'Olay',
    'IdP sertifikası yenilenmiş, metadata güncellenmemişti. Metadata yenilendi.'],
  [22, 6.0, 'ece.tan@musteri.com', 'KVKK veri silme başvurusu', 'Kişisel verilerimin silinmesini talep ediyorum.', 'ayse.yilmaz', 'normal', 'Talep',
    'Hukuk onayı sonrası müşteri kaydı anonimleştirildi, başvuru sahibine 6. günde dönüldü.'],
  [18, 2.0, 'selin.koc@firma.com', 'İç denetim için lisans listesi', 'Denetim öncesi yazılım lisansları ve bitiş tarihleri gerekiyor.', 'ayse.yilmaz', 'normal', 'Talep',
    'Envanterden liste çıkarıldı, 2 lisansın yenilemesi başlatıldı.'],
  [12, 0.8, 'hakan.erdem@firma.com', 'Yönetim panosuna tahsilat grafiği', 'Yönetim panosunda haftalık tahsilat trendini görmek istiyorum.', 'mehmet.kaya', 'high', 'Talep',
    'Panoya haftalık tahsilat trendi eklendi, GM onayladı.'],
  [8, 1.2, 'murat.aydin@firma.com', 'Sipariş API yanıt süresi yükseldi', 'Monitoring alarmı: sipariş API p95 2 sn.', 'zeynep.demir', 'high', 'Olay',
    'Eksik indeks + N+1 sorgu düzeltildi, p95 300 ms.'],
]

// Şu an açık, üst yönetimden gelen birkaç iş (pano dolu görünsün)
// [saat önce, gönderen, konu, gövde, öncelik]
const OPEN_NOW = [
  [3, 'hakan.erdem@firma.com', 'ACİL: Bütçe raporunda toplamlar tutmuyor', 'Yarın sabahki bütçe toplantısı için rapordaki toplamlar hatalı görünüyor, bugün içinde düzeltilmesi gerekiyor.', 'high'],
  [26, 'burak.cetin@firma.com', 'Fatura gönderiminde gecikme', 'Dünden beri e-fatura gönderimleri 1-2 saat gecikmeli gidiyor, kontrol rica ederim.', 'high'],
  [50, 'selin.koc@firma.com', 'Sertifika bitiş tarihleri — denetim', 'Önümüzdeki ay biten SSL sertifikalarının listesini paylaşır mısınız? Denetim sorusu.', 'normal'],
  [80, 'deniz.arslan@firma.com', 'Rapor ekranı yine yavaş', 'Satış raporu bu hafta tekrar yavaşladı, 30 sn üzerinde açılıyor.', 'normal'],
  [130, 'murat.aydin@firma.com', 'Batch işi bu gece de gecikti', 'Mutabakat batch\'i yine geç bitti, sabah raporları eksik.', 'normal'],
]

const uid = async (c, username) => (await c.query('SELECT id FROM app_user WHERE username = $1', [username])).rows[0]?.id ?? null

export async function loadDemoHistory({ force = false } = {}) {
  const done = (await query(`SELECT value FROM app_setting WHERE category = 'demo' AND key = 'history_v1'`)).rows[0]
  if (done && !force) return false
  await tx(async (c) => {
    for (const [email, name, title, dept, lvl] of CONTACTS) {
      await c.query(`INSERT INTO contact (email, full_name, title, department, mgmt_level) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
        [email, name, title, dept, lvl])
    }
    for (const [slug, title, space, tags, body] of WIKI) {
      await c.query(`INSERT INTO wiki_page (slug, title, space, tags, body, url, updated_by, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,'ayse.yilmaz', now() - make_interval(days => $7)) ON CONFLICT (slug) DO NOTHING`,
        [slug, title, space, tags, body, `${W}/${encodeURIComponent(space)}/${slug}`, (slug.length % 20) + 3])
    }
    const contacts = Object.fromEntries((await c.query('SELECT email, full_name FROM contact')).rows.map((r) => [r.email, r.full_name]))
    const mailbox = 'takim@firma.com'
    let k = 0
    for (const [ago, dur, from, subject, body, assignee, priority, category, note] of HISTORY) {
      k++
      const e = (await c.query(
        `INSERT INTO email (message_id, thread_id, mailbox, from_address, from_name, to_addresses, subject, body_preview, body_text, importance,
                            received_at, is_read, triage_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text, $8::text, $9, now() - make_interval(days => $10), TRUE, 'done')
         ON CONFLICT (message_id) DO NOTHING RETURNING id`,
        [`<hist-${k}@firma.com>`, `hist-${k}`, mailbox, from, contacts[from] ?? from, JSON.stringify([mailbox]), subject, body,
         priority === 'critical' || priority === 'high' ? 'high' : 'normal', ago])).rows[0]
      if (!e) continue
      const a = await uid(c, assignee)
      const w = (await c.query(
        `INSERT INTO work_item (title, description, source_type, source_id, status, priority, category, assignee_id, requester, requester_email,
                                created_at, updated_at, closed_at)
         VALUES ($1, $2, 'mail', $3, 'done', $4, $5, $6, $7, $8, now() - make_interval(days => $9),
                 now() - make_interval(days => $9) + make_interval(secs => $10), now() - make_interval(days => $9) + make_interval(secs => $10))
         RETURNING id`,
        [subject.replace(/^ACİL:\s*/u, ''), body, e.id, priority, category, a, contacts[from] ?? from, from, ago, Math.round(dur * 86400)])).rows[0]
      await c.query('UPDATE email SET work_item_id = $1 WHERE id = $2', [w.id, e.id])
      const at = (frac) => [w.id, ago, Math.round(dur * 86400 * frac)]
      await c.query(`INSERT INTO work_item_activity (work_item_id, action, comment, created_at) VALUES ($1, 'created', 'Mailden oluşturuldu', now() - make_interval(days => $2) + make_interval(secs => $3))`, at(0))
      await c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, new_value, comment, created_at)
                     VALUES ($1, $4, 'assign', $5, $6, now() - make_interval(days => $2) + make_interval(secs => $3))`, [...at(0.05), a, assignee, `Atanan: ${assignee}`])
      await c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, comment, created_at)
                     VALUES ($1, $4, 'comment', $5, now() - make_interval(days => $2) + make_interval(secs => $3))`, [...at(0.95), a, note])
      await c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, old_value, new_value, comment, created_at)
                     VALUES ($1, $4, 'status', 'in_progress', 'done', 'Durum: Devam Ediyor → Tamamlandı', now() - make_interval(days => $2) + make_interval(secs => $3))`, [...at(1), a])
    }
    for (const [hours, from, subject, body, imp] of OPEN_NOW) {
      k++
      const e = (await c.query(
        `INSERT INTO email (message_id, thread_id, mailbox, from_address, from_name, to_addresses, subject, body_preview, body_text, importance, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text, $8::text, $9, now() - make_interval(hours => $10)) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
        [`<open-${k}@firma.com>`, `open-${k}`, mailbox, from, contacts[from] ?? from, JSON.stringify([mailbox]), subject, body, imp, hours])).rows[0]
      if (!e) continue
      const w = (await c.query(
        `INSERT INTO work_item (title, description, source_type, source_id, status, priority, category, requester, requester_email, created_at, updated_at)
         VALUES ($1, $2, 'mail', $3, 'new', $4, 'Talep', $5, $6, now() - make_interval(hours => $7), now() - make_interval(hours => $7)) RETURNING id`,
        [subject.replace(/^ACİL:\s*/u, ''), body, e.id, imp === 'high' ? 'high' : 'normal', contacts[from] ?? from, from, hours])).rows[0]
      await c.query('UPDATE email SET work_item_id = $1 WHERE id = $2', [w.id, e.id])
      await c.query(`INSERT INTO work_item_activity (work_item_id, action, comment, created_at) VALUES ($1, 'created', 'Mailden oluşturuldu', now() - make_interval(hours => $2))`, [w.id, hours])
    }
    // Örnek veride sabit id ile eklenen kayıtlar sequence'i ilerletmiş olabilir
    await c.query(`SELECT setval(pg_get_serial_sequence('work_item','id'), (SELECT max(id) FROM work_item))`)
    await c.query(`SELECT setval(pg_get_serial_sequence('email','id'), (SELECT max(id) FROM email))`)
    for (const r of (await c.query('SELECT id FROM work_item')).rows) await enrichItem(c, r.id)
    await c.query(`INSERT INTO app_setting (category, key, value) VALUES ('demo', 'history_v1', now()::text)
                   ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value`)
  })
  // Açık işler için örnek ajan yorumu
  const open = (await query(`SELECT id FROM work_item WHERE status NOT IN ('done','cancelled') ORDER BY id`)).rows
  for (const r of open) await interpret(r.id)
  console.log(`[demo] geçmiş verisi yüklendi: ${CONTACTS.length} kişi, ${WIKI.length} wiki, ${HISTORY.length} kapanmış iş; ${open.length} açık işe ajan yorumu yazıldı`)
  return true
}
