import { query, resetDemoData } from './db.js'
import { bulkImport, bulkSendMail, interpret } from './intel.js'
import { createWorkItem, httpError } from './state.js'
import { loadDemoHistory } from './demo.js'
import * as G from './genai.js'

/**
 * Demo iş akışı (0.9): Jira, TFS Kanban, Mail ve Zoom'dan "yeni gelmiş" gibi görünen işler.
 * Her senaryonun DB'de geçmişi olan bir konusu vardır (MQ, Failed, Decom, OpenShift, DevOps, batch…),
 * böylece AI benzer eski işlere, çözenlere ve wiki sayfalarına dayanarak yorum yapabilir.
 *
 * Akış normal girişle aynıdır: mail → email + iş, Jira/TFS → bulk-import, Zoom → toplantı + iş;
 * ardından iş GenAI kuyruğuna (GenAI kapalıysa pod içi örnek yorumlayıcıya) gider, yorum DB'ye yazılır.
 * Demo kayıtları "demo-akis" etiketi / <demo-akis-…> message_id / demo-akis-… zoom id ile işaretlenir;
 * tekrar çalıştırıldığında önce eskileri silinir, çift kayıt olmaz.
 *
 * Pod yeniden başlarken (rollout) DEMO_RESET_ON_BOOT=true ise tüm veri örnek (seed) hâline döner;
 * DEMO_AUTORUN=true ise açılıştan sonra demo akışı kendiliğinden bir kez çalışır.
 */

export const DEMO_TAG = 'demo-akis'

// [anahtar, kaynak, dış ref, gönderen/düzenleyen, başlık, gövde, öncelik]
const SCENARIOS = [
  ['mq-payment-out', 'mail', null, 'deniz.arslan@firma.com', 'PAYMENT.OUT kuyruğu max depth\'e yaklaştı, EFT çıkışları gecikiyor',
    'Merhaba ekip,\nÖdeme kanalında PAYMENT.OUT MQ kuyruğunun derinliği %92\'ye çıktı, giden EFT\'ler 10-15 dk gecikmeli işleniyor. '
    + 'DLQ\'da da mesaj birikmeye başladı. Geçen ay PAYMENT.IN\'de benzer bir durum yaşamıştık. Kök nedeni ve aksiyonu bugün paylaşabilir misiniz?\nDeniz', 'high'],
  ['mobil-failed', 'mail', null, 'hakan.erdem@firma.com', 'ACİL: Mobil kanalda para transferleri yine failed dönüyor',
    'Mobil kanalda sabahtan beri transferlerin bir kısmı failed dönüyor, müşteri şikayetleri artıyor. '
    + 'Konunun bugün içinde çözülmesini ve bana durum bilgisi verilmesini rica ediyorum.', 'high'],
  ['rhel-upgrade', 'mail', null, 'murat.aydin@firma.com', 'RHEL 7 rapor sunucuları için server upgrade planı',
    'Destek süresi biten RHEL 7 rapor sunucularının (RPTAPP01-03) OS upgrade\'ini bu çeyrek tamamlamamız gerekiyor. '
    + 'Önceki APPSRV upgrade\'inde yaşadıklarımıza göre bir takvim önerir misiniz?', 'normal'],
  ['helm-timeout', 'jira', 'OPS-1201', 'burak.cetin@firma.com', 'Kart ödeme servisi deploy\'u helm upgrade timeout ile failed',
    'Jira: test ortamına deploy sırasında helm upgrade adımı 5 dakikada timeout veriyor, pipeline failed. Sprint sonu release riskte.', 'high'],
  ['eod-batch', 'jira', 'ITSM-3315', 'elif.sahin@firma.com', 'EOD_MUTABAKAT batch job\'ı yine ORA-01555 ile failed',
    'Problem kaydı adayı: EOD_MUTABAKAT gece 02:10\'da ORA-01555 snapshot too old ile failed oldu. Sabah raporları gecikti. '
    + 'Bu ay ikinci kez yaşanıyor.', 'high'],
  ['rapor-decom', 'tfs', 'TFS-48401', 'gizem.yildiz@firma.com', 'Eski rapor sunucularının (RPTSRV01-04) decom edilmesi',
    'Kanban kartı: yeni raporlama platformuna geçiş tamamlandı. RPTSRV01-04 sunucuları decom edilecek; bağımlılık analizi ve takvim gerekli.', 'low'],
  ['mq-cert', 'tfs', 'TFS-48402', 'deniz.arslan@firma.com', 'MQ QMGR_PROD2 TLS sertifikası 7 gün içinde bitiyor',
    'Kanban kartı: QMGR_PROD2 kanallarının TLS sertifikası 7 gün sonra sona eriyor. Yenileme kesintisiz yapılmalı.', 'high'],
  ['ocp-upgrade', 'zoom', null, 'selin.koc@firma.com', 'OpenShift prod cluster 4.14 → 4.16 upgrade planlama',
    'Gündem: prod upgrade penceresi, worker node drain süreleri, PDB ayarları, operator uyumluluğu, geri dönüş planı.', 'high'],
  ['jenkins-incident', 'zoom', null, 'elif.sahin@firma.com', 'Incident değerlendirme: Jenkins build\'leri kuyrukta bekliyor',
    'Gündem: sabah tüm build\'lerin kuyrukta beklemesi, agent disk doluluğu, kalıcı çözüm ve aksiyon sahipleri.', 'normal'],
]

export function listScenarios() {
  return SCENARIOS.map(([key, src, ref, from, title, body, priority]) => ({ key, source_type: src, external_ref: ref, from, title, body, priority }))
}

/** Demo kayıtlarını (işler, mailler, toplantılar ve bağlı yorum/öneri/çağrı kayıtları) siler. */
export async function clearDemo() {
  const ids = (await query(`SELECT work_item_id AS id FROM work_item_tag WHERE tag = $1`, [DEMO_TAG])).rows.map((r) => r.id)
  if (ids.length) await query(`DELETE FROM work_item WHERE id = ANY($1::bigint[])`, [ids])
  const e = await query(`DELETE FROM email WHERE message_id LIKE '<demo-akis-%'`)
  const m = await query(`DELETE FROM meeting WHERE zoom_meeting_id LIKE 'demo-akis-%'`)
  return { work_items: ids.length, emails: e.rowCount, meetings: m.rowCount }
}

async function zoomItem([key, , , host, topic, agenda, priority], actor, i) {
  const c = (await query('SELECT full_name FROM contact WHERE email = $1', [host])).rows[0]
  const start = new Date(Date.now() - (i + 1) * 3600_000).toISOString()
  const m = (await query(
    `INSERT INTO meeting (zoom_meeting_id, zoom_uuid, topic, agenda, host_email, host_name, start_time, duration_min, status, notes)
     VALUES ($1, $1, $2, $3, $4, $5, $6, 45, 'ended', $7) RETURNING id`,
    [`demo-akis-${key}`, topic, agenda, host, c?.full_name ?? host, start, `Toplantı aksiyonu: ${topic}`])).rows[0]
  await query(`INSERT INTO meeting_participant (meeting_id, name, email, attended) VALUES ($1, $2, $3, TRUE), ($1, 'Ayşe Yılmaz', 'ayse.yilmaz@firma.com', TRUE)`,
    [m.id, c?.full_name ?? host, host])
  const item = await createWorkItem({
    title: topic, description: `${agenda}\nToplantı: ${start}`, source_type: 'zoom', source_id: m.id,
    requester: c?.full_name ?? host, requester_email: host, priority, category: 'Toplantı', tags: [DEMO_TAG],
  }, actor)
  return item
}

/**
 * Demo akışını çalıştırır.
 * body: { keys?: string[] (boşsa hepsi), reset?: true, interpret?: true, wait?: false, timeout_sec?: 180 }
 */
export async function runDemo(body = {}, actor) {
  const keys = Array.isArray(body.keys) && body.keys.length ? new Set(body.keys.map(String)) : null
  const list = SCENARIOS.filter(([k]) => !keys || keys.has(k))
  if (!list.length) throw httpError(400, 'invalid', `Bilinen senaryo yok. Senaryolar: ${SCENARIOS.map(([k]) => k).join(', ')}`, { field: 'keys' })
  const cleared = body.reset === false ? null : await clearDemo()
  const genai = G.isActive()
  const items = []
  for (const [i, s] of list.entries()) {
    const [key, src, ref, from, title, text, priority] = s
    let item
    if (src === 'mail') {
      const r = await bulkSendMail({ interpret: false, mails: [{ from_address: from, subject: title, body: text, importance: priority === 'low' ? 'low' : priority === 'normal' ? 'normal' : 'high',
        message_id: `<demo-akis-${key}@yaver.local>`, tags: [DEMO_TAG] }] }, actor)
      item = r.work_items[0]
    } else if (src === 'tfs' || src === 'jira') {
      const r = await bulkImport({ interpret: false, items: [{ source_type: src, external_ref: ref, requester_email: from, title, description: text, priority, tags: [DEMO_TAG] }] }, actor)
      item = r.work_items[0] ?? null
    } else {
      item = await zoomItem(s, actor, i)
    }
    if (!item) continue
    items.push({ key, id: item.id, code: item.code, source_type: src, title })
  }
  // Yorum: GenAI açıksa kuyruğa (olay zaten koymuş olabilir; enqueue tekrarı engeller), kapalıysa örnek yorumlayıcı
  if (body.interpret !== false) {
    for (const it of items) {
      if (genai) it.job_id = await G.enqueue('interpret', it.id, 'demo')
      else await interpret(it.id)
    }
  }
  const out = { mode: genai ? 'genai' : 'yerel', cleared, count: items.length, items }
  if (body.wait && genai && body.interpret !== false) {
    const until = Date.now() + Math.min(600, Math.max(5, Number(body.timeout_sec) || 180)) * 1000
    while (Date.now() < until) {
      const st = await demoStatus()
      if (st.items.every((x) => !['pending', 'running'].includes(x.genai_status))) return { ...out, status: st }
      await new Promise((r) => setTimeout(r, 2000))
    }
    return { ...out, status: await demoStatus(), timed_out: true }
  }
  return { ...out, status: await demoStatus() }
}

/** Demo işlerinin durumu: yorum yazıldı mı, GenAI çağrısı ne durumda, kaç öneri onay bekliyor. */
export async function demoStatus() {
  const { rows } = await query(
    `SELECT w.id, w.code, w.title, w.source_type, w.external_ref, w.status, w.priority, w.category, w.keywords, w.agent_comment_by,
            left(w.agent_comment, 400) AS agent_comment, w.agent_confidence, w.created_at,
            (SELECT j.status FROM genai_job j WHERE j.work_item_id = w.id AND j.kind = 'interpret' ORDER BY j.id DESC LIMIT 1) AS genai_status,
            (SELECT j.error FROM genai_job j WHERE j.work_item_id = w.id AND j.kind = 'interpret' ORDER BY j.id DESC LIMIT 1) AS genai_error,
            (SELECT count(*)::int FROM agent_action a WHERE a.work_item_id = w.id AND a.status = 'pending') AS pending_actions
     FROM work_item w JOIN work_item_tag t ON t.work_item_id = w.id AND t.tag = $1 ORDER BY w.id`, [DEMO_TAG])
  const done = rows.filter((r) => r.agent_comment).length
  return { mode: G.isActive() ? 'genai' : 'yerel', total: rows.length, commented: done, items: rows }
}

/** Tüm veriyi örnek (seed) hâline döndürür: işler, mailler, toplantılar, ajan/GenAI kayıtları. Ayarlar korunur. */
export async function resetAll() {
  await resetDemoData()
  await loadDemoHistory({ force: true })
  return { ok: true }
}

/** Açılışta: DEMO_RESET_ON_BOOT=true → seed hâline dön. */
export async function demoOnBoot() {
  if (process.env.DEMO_RESET_ON_BOOT !== 'true') return false
  console.log('[demo] DEMO_RESET_ON_BOOT=true: veri örnek hâline döndürülüyor')
  await resetAll()
  return true
}

/** Açılıştan sonra: DEMO_AUTORUN=true → demo akışını bir kez çalıştır (GenAI kuyruğu hazır olduktan sonra). */
export function demoAutorun(actor) {
  if (process.env.DEMO_AUTORUN !== 'true') return
  if (!actor) return console.warn('[demo] DEMO_AUTORUN: ajan kullanıcısı yok, atlandı')
  setTimeout(() => runDemo({}, actor)
    .then((r) => console.log(`[demo] otomatik demo akışı: ${r.count} iş (${r.mode})`))
    .catch((e) => console.error('[demo] otomatik demo akışı:', e.message)), 3000)
}
