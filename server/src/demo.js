import { query, tx, resetDemoData } from './db.js'
import { enrichItem, interpret } from './intel.js'

/**
 * Örnek "geçmiş" verisi (IT operasyon ekibi): kişi rehberi (Üst Yönetim / Birim Yöneticisi / PO),
 * wiki sayfaları (MQ, OpenShift, server upgrade, decom, pipeline, batch, change…) ve son 60 günde
 * kapanmış işler (Mail, Zoom, TFS Kanban, Jira). Ajanın "geçmişe bakarak yorum" yapabilmesi için gerekir.
 * SEED=true iken bir kez yüklenir (app_setting demo/history_v2), "Demo verisini sıfırla" ile yeniden yüklenir.
 * v0.6'dan (history_v1) gelen kurulumda örnek veri bir kez sıfırlanıp bu veriyle değiştirilir (SEED_UPGRADE=false ile atlanır).
 */
const VERSION_KEY = 'history_v2'

// [e-posta, ad, unvan, birim, seviye: ust | birim | po | diger]
const CONTACTS = [
  ['hakan.erdem@firma.com', 'Hakan Erdem', 'BT Genel Müdür Yardımcısı', 'Bilgi Teknolojileri', 'ust'],
  ['selin.koc@firma.com', 'Selin Koç', 'Altyapı ve Operasyon Direktörü', 'Bilgi Teknolojileri', 'ust'],
  ['murat.aydin@firma.com', 'Murat Aydın', 'Sistem Yönetimi Birim Müdürü', 'Sistem Yönetimi', 'birim'],
  ['deniz.arslan@firma.com', 'Deniz Arslan', 'Middleware ve Entegrasyon Birim Müdürü', 'Middleware', 'birim'],
  ['elif.sahin@firma.com', 'Elif Şahin', 'Servis Yönetimi Birim Müdürü', 'Servis Yönetimi', 'birim'],
  ['burak.cetin@firma.com', 'Burak Çetin', 'Uygulama Geliştirme Birim Müdürü', 'Yazılım Geliştirme', 'birim'],
  ['gizem.yildiz@firma.com', 'Gizem Yıldız', 'Product Owner — Ödeme Platformu', 'Ödeme Sistemleri', 'po'],
  ['emre.kurt@firma.com', 'Emre Kurt', 'Product Owner — Mobil Kanal', 'Dijital Kanallar', 'po'],
  ['ece.tan@firma.com', 'Ece Tan', 'Product Owner — Müşteri Portalı', 'Dijital Kanallar', 'po'],
  ['ayse.yilmaz@firma.com', 'Ayşe Yılmaz', 'Takım Lideri — DevOps ve Operasyon', 'DevOps', 'diger'],
  ['mehmet.kaya@firma.com', 'Mehmet Kaya', 'Middleware / MQ Uzmanı', 'DevOps', 'diger'],
  ['zeynep.demir@firma.com', 'Zeynep Demir', 'Sistem ve OpenShift Uzmanı', 'DevOps', 'diger'],
  ['can.ozturk@firma.com', 'Can Öztürk', 'DevOps Mühendisi (CI/CD)', 'DevOps', 'diger'],
  ['noreply@monitor.firma.com', 'İzleme Sistemi', 'Otomatik alarm', 'İzleme', 'diger'],
]

// v0.6 örnek wiki sayfaları (yükseltmede kaldırılır)
const OLD_WIKI = ['prod-olay-yonetimi', 'rapor-performans', 'rapor-toplam-tutarsizligi', 'fatura-servisi-hata-kodlari', 'vpn-hesap-acma',
  'sso-giris-sorunlari', 'batch-gecikme-runbook', 'kvkk-veri-talebi', 'lisans-sertifika-envanteri']

const W = 'https://wiki.firma.local/display'
// [slug, başlık, alan, etiketler, gövde]
const WIKI = [
  ['ust-yonetim-sla', 'Talep eden seviyesine göre SLA', 'Servis Yönetimi', ['üst-yönetim', 'sla', 'öncelik', 'po', 'birim'],
    'Üst Yönetim (GMY, Direktör) taleplerine 4 saat içinde ilk dönüş yapılır, iş en az Yüksek öncelikle açılır ve takım lideri (ayse.yilmaz) bilgilendirilir.\nBirim yöneticisi taleplerinde ilk dönüş 1 iş günüdür. PO talepleri sprint önceliğine göre 2 iş günü içinde planlanır.'],
  ['mq-kuyruk-dolulugu', 'MQ kuyruk doluluğu ve DLQ runbook', 'Middleware', ['mq', 'kuyruk', 'queue', 'dlq'],
    'Kuyruk max depth\'e yaklaşınca önce consumer uygulamanın ayakta olduğu (OpenShift pod durumu) kontrol edilir; en sık neden consumer pod\'larının CrashLoop\'ta olmasıdır.\nGeçici çözüm: MAXDEPTH artırılır, DLQ handler çalıştırılır. Kalıcı çözüm için consumer ekibiyle incident açılır.'],
  ['mq-channel-retry', 'MQ channel RETRY / STOPPED durumları', 'Middleware', ['mq', 'channel', 'sertifika', 'tls'],
    'Channel RETRY\'da kalıyorsa sırasıyla: 1) TLS sertifika süresi, 2) karşı QMGR listener, 3) HBINT/KAINT ayarları.\nSertifika yenilemede REFRESH SECURITY TYPE(SSL) sonrası channel\'lar tek tek yeniden başlatılır; kesintisiz yapılabilir.'],
  ['openshift-upgrade', 'OpenShift upgrade kontrol listesi', 'Platform', ['openshift', 'ocp', 'upgrade', 'cluster', 'worker node'],
    'Upgrade öncesi: operator uyumluluk matrisi, etcd yedeği, PodDisruptionBudget kontrolü. Prod upgrade\'i test cluster provasından en az 1 hafta sonra yapılır.\nWorker drain uzun sürüyorsa PDB\'si minAvailable=replicas olan uygulamalar bulunur. Bakım penceresi CAB onayıyla Cumartesi 02:00.'],
  ['server-upgrade-rhel', 'RHEL / Windows server upgrade süreci', 'Sistem Yönetimi', ['server', 'upgrade', 'rhel', 'yama', 'patch', 'windows server'],
    'Destek süresi biten OS\'lar için server upgrade TFS Kanban\'da kart olarak izlenir. Sıra: snapshot → upgrade → uygulama sahibinin testi → CMDB güncelleme.\nRHEL 7→8 geçişinde Java 8 / Python 2 bağımlılıkları en sık engeldir; istisna için birim müdürü onayı gerekir.'],
  ['decom-sureci', 'Sunucu / uygulama decom süreci', 'Sistem Yönetimi', ['decom', 'decommission', 'dns', 'yedek', 'cmdb'],
    'Decom adımları: 90 günlük trafik/bağımlılık analizi → son yedek → 2 hafta kapalı bekletme → DNS, firewall ve CMDB temizliği → lisans iadesi.\nOrtalama süre 1-2 hafta; acil değildir, düşük öncelikle planlanır.'],
  ['pipeline-failed', 'Pipeline failed — sık nedenler', 'DevOps', ['pipeline', 'failed', 'jenkins', 'helm', 'build', 'deploy'],
    'Helm adımında timeout: readiness probe ve --wait süresi kontrol edilir. Build adımında failed: nexus erişimi ve bağımlılık sürümü.\nJenkins agent\'ları down ise önce agent diskleri (workspace) kontrol edilir.'],
  ['batch-failed', 'Batch job FAILED runbook (EOD)', 'Operasyon', ['batch', 'failed', 'eod', 'ora-01555'],
    'EOD_MUTABAKAT failed olursa job logundaki ORA kodu kontrol edilir. ORA-01555: undo retention / yedekleme penceresi çakışması.\nJob yeniden çalıştırılmadan önce yarım kalan kayıtlar temizlenir; sabah raporları için 07:00\'ye kadar bitmelidir.'],
  ['change-cab', 'Change ve CAB süreci', 'Servis Yönetimi', ['change', 'cab', 'değişiklik', 'itsm'],
    'Normal change\'ler Salı CAB toplantısında onaylanır; acil change için CAB üyelerinden ikisinin onayı yeterlidir.\nYıl sonu dondurma döneminde (15 Aralık – 5 Ocak) yalnız acil change yapılır.'],
  ['release-yonetimi', 'Release ve deploy penceresi talepleri', 'Yazılım', ['release', 'deploy', 'versiyon', 'sprint', 'po'],
    'PO, sprint sonu release için deploy penceresini TFS kartı ile en geç Perşembe ister. Prod deploy Salı ve Perşembe 22:00 pencerelerindedir.\nRelease öncesi: test onayı, release notu, geri dönüş planı.'],
  ['incident-p1', 'Incident (P1/P2) yönetimi', 'Servis Yönetimi', ['incident', 'p1', 'olay', 'down'],
    'P1: servis tamamen down ya da para hareketi etkileniyor. 15 dk içinde incident kaydı ve köprü toplantısı; her 30 dk durum notu.\nKök neden analizi 2 iş günü içinde problem kaydı olarak açılır.'],
]

// Kapanmış geçmiş işler — [gün önce, çözüm süresi (gün), kaynak, dış ref, gönderen, konu, gövde, atanan, öncelik, kategori, çözüm notu]
const HISTORY = [
  [57, 1.0, 'mail', null, 'deniz.arslan@firma.com', 'MQ PAYMENT.IN kuyruğu doldu', 'Ödeme kanalında MQ kuyruğu max depth\'e ulaştı, işlemler beklemede.', 'mehmet.kaya', 'critical', 'Olay',
    'Consumer uygulamanın 2 pod\'u CrashLoop\'taydı; yeniden başlatıldı, MAXDEPTH 50k yapıldı, DLQ boşaltıldı.'],
  [50, 0.15, 'mail', null, 'hakan.erdem@firma.com', 'ACİL: Mobil kanalda transferler failed oluyor', 'Mobil kanalda para transferleri failed dönüyor, bugün içinde çözülmeli.', 'mehmet.kaya', 'critical', 'Olay',
    'MQ channel TLS sertifikası süresi dolmuştu, yenilendi; channel RUNNING. GMY\'ye 3 saatte dönüldü.'],
  [46, 6.0, 'jira', 'OPS-1012', 'selin.koc@firma.com', 'OpenShift test cluster 4.12 → 4.14 upgrade', 'Prod öncesi prova: test cluster upgrade\'i.', 'zeynep.demir', 'high', 'Planlama',
    'Upgrade tamamlandı. Worker drain için PDB\'ler düzeltildi, Elastic operator uyumsuzluğu wiki\'ye yazıldı.'],
  [42, 2.0, 'tfs', 'TFS-47102', 'burak.cetin@firma.com', 'Release pipeline helm adımında failed', 'Kanban: test ortamına deploy sırasında helm upgrade timeout.', 'can.ozturk', 'high', 'Kanban',
    'Helm --wait 5→15 dk yapıldı, readiness probe düzeltildi; pipeline yeşil.'],
  [38, 12.0, 'tfs', 'TFS-46988', 'murat.aydin@firma.com', 'RHEL 7 → 8 server upgrade (APPSRV01-06)', '6 uygulama sunucusunun OS upgrade\'i.', 'zeynep.demir', 'normal', 'Kanban',
    '6 sunucu 3 bakım penceresinde yükseltildi; Java 8 bağımlılığı olan 1 uygulama için istisna açıldı.'],
  [33, 3.0, 'mail', null, 'elif.sahin@firma.com', 'Firewall change\'i için CAB onayı', 'Gece yapılacak firewall değişikliği için change kaydı ve CAB onayı.', 'ayse.yilmaz', 'normal', 'Talep',
    'CHG-2231 CAB\'den geçti, gece uygulandı, geri dönüş gerekmedi.'],
  [29, 1.5, 'mail', null, 'noreply@monitor.firma.com', '[ALARM] Batch job FAILED — EOD_MUTABAKAT', 'EOD_MUTABAKAT job\'ı failed: ORA-01555 snapshot too old.', 'zeynep.demir', 'high', 'Olay',
    'Undo retention artırıldı, job yeniden çalıştırıldı; yedekleme penceresi 04:00\'e kaydırıldı.'],
  [25, 8.0, 'jira', 'OPS-1055', 'murat.aydin@firma.com', 'Eski log sunucularının decom edilmesi', 'LOGSRV01-03 artık kullanılmıyor, decom edilecek.', 'ayse.yilmaz', 'low', 'Planlama',
    'Bağımlılık analizi yapıldı, son yedek alındı, DNS ve CMDB temizlendi, sunucular kapatıldı.'],
  [20, 0.3, 'zoom', null, 'selin.koc@firma.com', 'Incident: Jenkins agent\'ları down', 'Haftalık operasyon toplantısında açılan incident: tüm build\'ler kuyrukta.', 'can.ozturk', 'critical', 'Olay',
    'Agent diskleri dolmuştu; workspace temizliği cron\'a bağlandı, agent\'lar ayağa kalktı.'],
  [16, 4.0, 'tfs', 'TFS-47560', 'gizem.yildiz@firma.com', 'Ödeme platformu 3.7 release ve prod deploy', 'Sprint 40 release kartı: deploy penceresi talebi.', 'can.ozturk', 'normal', 'Kanban',
    'Release CAB\'den geçti, Salı 22:00 penceresinde deploy edildi; smoke test OK.'],
  [12, 2.0, 'jira', 'OPS-1088', 'deniz.arslan@firma.com', 'MQ QMGR_PROD1 TLS sertifika yenilemesi', 'Sertifika bitişine 10 gün kaldı.', 'mehmet.kaya', 'high', 'Talep',
    'Sertifika keystore\'a eklendi, channel\'lar REFRESH SECURITY ile sırayla yenilendi; kesinti olmadı.'],
  [8, 1.0, 'mail', null, 'emre.kurt@firma.com', 'Mobil uygulamada login bug\'ı (Android)', 'Yeni versiyonda Android kullanıcılar login olamıyor.', 'can.ozturk', 'high', 'Olay',
    'Token yenileme bug\'ı hotfix release ile giderildi (v5.2.1).'],
  [5, 0.2, 'mail', null, 'hakan.erdem@firma.com', 'OpenShift prod\'da ödeme pod\'ları CrashLoop', 'Ödeme servisi prod\'da çalışmıyor, pod\'lar sürekli yeniden başlıyor.', 'zeynep.demir', 'critical', 'Olay',
    'Worker node\'da memory pressure vardı; limitler artırıldı, pod\'lar başka node\'a taşındı.'],
  [3, 2.0, 'jira', 'ITSM-3290', 'elif.sahin@firma.com', 'Problem kaydı: tekrarlayan MQ channel kesintileri', 'Son ay 3 kez yaşanan channel kesintileri için problem kaydı.', 'mehmet.kaya', 'normal', 'Talep',
    'Kök neden heartbeat ayarı; HBINT 300→60 yapıldı, problem kapatıldı.'],
]

// Şu an açık işler — [saat önce, kaynak, dış ref, gönderen, konu, gövde, öncelik]
const OPEN_NOW = [
  [2, 'mail', null, 'hakan.erdem@firma.com', 'ACİL: Ödeme kanalında MQ kuyrukları doluyor',
    'Ödeme kanalında işlemler beklemede kalıyor; MQ tarafında PAYMENT.IN kuyruğunun dolduğu söyleniyor. Bugün içinde durum ve kök neden rica ediyorum.', 'high'],
  [5, 'jira', 'OPS-1131', 'selin.koc@firma.com', 'OpenShift prod cluster upgrade — worker node drain sorunu',
    'Upgrade provasında worker node drain 40 dk sürdü; prod upgrade öncesi PDB ayarları gözden geçirilmeli.', 'high'],
  [20, 'tfs', 'TFS-48213', 'burak.cetin@firma.com', 'Ödeme servisi deploy pipeline\'ı helm adımında failed',
    'Kanban kartı: Dev → Test geçişinde helm upgrade timeout veriyor, sprint sonu release riskte.', 'high'],
  [30, 'mail', null, 'murat.aydin@firma.com', 'RHEL 7 sunucuların server upgrade takvimi',
    'Destek süresi biten RHEL 7 sunucular için OS upgrade takvimini birim bazında çıkaralım.', 'normal'],
  [52, 'tfs', 'TFS-48230', 'gizem.yildiz@firma.com', 'Ödeme platformu 3.8 release hazırlığı',
    'Sprint 42 release kartı: release notları hazır, prod deploy penceresi talep ediyorum.', 'normal'],
  [75, 'zoom', null, 'elif.sahin@firma.com', 'Yıl sonu dondurma öncesi change takvimi',
    'Servis yönetimi toplantısı aksiyonu: freeze öncesi yapılması gereken change kayıtları ve CAB tarihleri.', 'normal'],
  [100, 'jira', 'OPS-1140', 'murat.aydin@firma.com', 'Legacy FTP sunucusunun decom edilmesi',
    'Son 90 günde trafik yok; decom öncesi bağımlılık analizi yapılmalı.', 'low'],
  [170, 'mail', null, 'emre.kurt@firma.com', 'Mobil backend yeni versiyon için test ortamı',
    'Yeni API versiyonunun test ortamına deploy edilmesi gerekiyor, backlog önceliği yüksek.', 'normal'],
  [200, 'mail', null, 'noreply@monitor.firma.com', '[ALARM] Batch job FAILED — EOD_MUTABAKAT',
    'EOD_MUTABAKAT job\'ı 02:14\'te failed durumuna düştü. Hata: ORA-01555 snapshot too old.', 'high'],
]

const uid = async (c, username) => (await c.query('SELECT id FROM app_user WHERE username = $1', [username])).rows[0]?.id ?? null
const SRC_TEXT = { mail: 'Mailden oluşturuldu', zoom: 'Toplantıdan oluşturuldu', tfs: 'TFS Kanban kartından oluşturuldu', jira: 'Jira kaydından oluşturuldu' }
const extUrl = (src, ref) => (src === 'tfs' ? `https://tfs.firma.local/tfs/DefaultCollection/_workitems/edit/${ref.replace(/^TFS-/, '')}`
  : src === 'jira' ? `https://jira.firma.local/browse/${ref}` : null)

/** Kaynağa göre (mail → email satırı; tfs/jira → external_ref) bir iş ekler. `at` = SQL zaman ifadesi parametresi. */
async function insertItem(c, k, contacts, { src, ref, from, subject, body, priority, status, category, assignee, agoSql, agoVal, closeSecs }) {
  const mailbox = 'takim@firma.com'
  let emailId = null
  if (src === 'mail') {
    const e = (await c.query(
      `INSERT INTO email (message_id, thread_id, mailbox, from_address, from_name, to_addresses, subject, body_preview, body_text, importance,
                          received_at, is_read, triage_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text, $8::text, $9, now() - ${agoSql.replace('$13', '$10')}, $11, $12) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
      [`<demo-${k}@firma.com>`, `demo-${k}`, mailbox, from, contacts[from] ?? from, JSON.stringify([mailbox]), subject, body,
       priority === 'critical' || priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'normal', agoVal, status === 'done', status === 'done' ? 'done' : 'pending'])).rows[0]
    if (!e) return null
    emailId = e.id
  }
  const closed = status === 'done'
  const w = (await c.query(
    `INSERT INTO work_item (title, description, source_type, source_id, external_ref, external_url, status, priority, category, assignee_id,
                            requester, requester_email, created_at, updated_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() - ${agoSql},
             now() - ${agoSql} + make_interval(secs => $14), ${closed ? `now() - ${agoSql} + make_interval(secs => $14)` : 'NULL'})
     ON CONFLICT DO NOTHING RETURNING id`,
    [subject.replace(/^ACİL:\s*/u, ''), body, src, emailId, ref, ref ? extUrl(src, ref) : null, status, priority, category,
     await uid(c, assignee), contacts[from] ?? from, from, agoVal, closeSecs ?? 0])).rows[0]
  if (!w) return null
  if (emailId) await c.query('UPDATE email SET work_item_id = $1 WHERE id = $2', [w.id, emailId])
  await c.query(`INSERT INTO work_item_activity (work_item_id, action, comment, created_at) VALUES ($1, 'created', $2, now() - ${agoSql.replace('$13', '$3')})`,
    [w.id, SRC_TEXT[src] ?? 'Kayıt oluşturuldu', agoVal])
  return w.id
}

export async function loadDemoHistory({ force = false } = {}) {
  const has = async (key) => !!(await query(`SELECT 1 FROM app_setting WHERE category = 'demo' AND key = $1`, [key])).rows[0]
  if (!force && await has(VERSION_KEY)) return false
  if (!force && await has('history_v1')) {
    // 0.6 → 0.7: örnek veri IT operasyon konularına göre yenilenir
    if (process.env.SEED_UPGRADE === 'false') {
      await query(`INSERT INTO app_setting (category, key, value) VALUES ('demo', $1, 'skipped') ON CONFLICT (category, key) DO NOTHING`, [VERSION_KEY])
      return false
    }
    console.log('[demo] 0.6 örnek verisi bulundu; IT operasyon örnek verisiyle yenileniyor (SEED_UPGRADE=false ile atlanır)')
    await resetDemoData()
  }
  await query(`DELETE FROM wiki_page WHERE slug = ANY($1)`, [OLD_WIKI])
  await query(`DELETE FROM contact WHERE email = 'ece.tan@musteri.com'`)
  await tx(async (c) => {
    for (const [email, name, title, dept, lvl] of CONTACTS) {
      await c.query(`INSERT INTO contact (email, full_name, title, department, mgmt_level) VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, title = EXCLUDED.title,
                       department = EXCLUDED.department, mgmt_level = EXCLUDED.mgmt_level`, [email, name, title, dept, lvl])
    }
    for (const [i, [slug, title, space, tags, body]] of WIKI.entries()) {
      await c.query(`INSERT INTO wiki_page (slug, title, space, tags, body, url, updated_by, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,'ayse.yilmaz', now() - make_interval(days => $7))
                     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, space = EXCLUDED.space, tags = EXCLUDED.tags, body = EXCLUDED.body,
                       url = EXCLUDED.url, updated_at = EXCLUDED.updated_at`,
        [slug, title, space, tags, body, `${W}/${encodeURIComponent(space)}/${slug}`, 3 + i * 4])
    }
    const contacts = Object.fromEntries((await c.query('SELECT email, full_name FROM contact')).rows.map((r) => [r.email, r.full_name]))
    let k = 0
    for (const [ago, dur, src, ref, from, subject, body, assignee, priority, category, note] of HISTORY) {
      k++
      const id = await insertItem(c, `hist-${k}`, contacts, { src, ref, from, subject, body, priority, status: 'done', category, assignee,
        agoSql: 'make_interval(days => $13)', agoVal: ago, closeSecs: Math.round(dur * 86400) })
      if (!id) continue
      const a = await uid(c, assignee)
      const at = (frac) => `now() - make_interval(days => $2) + make_interval(secs => ${Math.round(dur * 86400 * frac)})`
      await c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, new_value, comment, created_at)
                     VALUES ($1, $3, 'assign', $4, $5, ${at(0.05)})`, [id, ago, a, assignee, `Atanan: ${assignee}`])
      await c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, comment, created_at) VALUES ($1, $3, 'comment', $4, ${at(0.95)})`, [id, ago, a, note])
      await c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, old_value, new_value, comment, created_at)
                     VALUES ($1, $3, 'status', 'in_progress', 'done', 'Durum: Devam Ediyor → Tamamlandı', ${at(1)})`, [id, ago, a])
    }
    for (const [hours, src, ref, from, subject, body, priority] of OPEN_NOW) {
      k++
      await insertItem(c, `open-${k}`, contacts, { src, ref, from, subject, body, priority, status: 'new',
        category: src === 'tfs' ? 'Kanban' : src === 'jira' ? 'Jira' : 'Talep', assignee: null, agoSql: 'make_interval(hours => $13)', agoVal: hours })
    }
    // Örnek veride sabit id ile eklenen kayıtlar sequence'i ilerletmiş olabilir
    await c.query(`SELECT setval(pg_get_serial_sequence('work_item','id'), (SELECT max(id) FROM work_item))`)
    await c.query(`SELECT setval(pg_get_serial_sequence('email','id'), (SELECT max(id) FROM email))`)
    for (const r of (await c.query('SELECT id FROM work_item')).rows) await enrichItem(c, r.id)
    await c.query(`INSERT INTO app_setting (category, key, value) VALUES ('demo', $1, now()::text)
                   ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value`, [VERSION_KEY])
  })
  // Açık işler için örnek ajan yorumu
  const open = (await query(`SELECT id FROM work_item WHERE status NOT IN ('done','cancelled') ORDER BY id`)).rows
  for (const r of open) await interpret(r.id)
  console.log(`[demo] geçmiş verisi yüklendi: ${CONTACTS.length} kişi, ${WIKI.length} wiki, ${HISTORY.length} kapanmış iş; ${open.length} açık işe ajan yorumu yazıldı`)
  return true
}
