import crypto from 'node:crypto'
import { query, tx } from './db.js'
import { emit } from './events.js'
import { ITEM_SQL, createWorkItem, httpError, toItem } from './state.js'

/**
 * Geçmişe dayalı yorum katmanı.
 *  - enrichItem   : işin anahtar kelimelerini (keyword_rule) ve talep edenin üst yönetim seviyesini (contact) hesaplar
 *  - buildContext : ajan için "geçmiş" paketi — benzer eski işler (DB), ilgili wiki sayfaları, göndericinin önceki mailleri
 *  - interpret    : pod içindeki örnek yorumlayıcı; buildContext'ten kural tabanlı bir yorum yazar.
 *                   Gerçek LangGraph ajanı aynı paketi GET /api/work-items/:id/context ile alıp
 *                   PUT /api/work-items/:id/agent-comment ile kendi yorumunu yazar (bu yorumun üstüne).
 *  - bulkSendMail : toplu mail girişi → mail + iş + yorum
 */

export const MGMT_LABEL = { ust: 'Üst Yönetim', birim: 'Birim Yöneticisi', po: 'PO', diger: 'Diğer' }
export const MGMT_LEVELS = Object.keys(MGMT_LABEL)
export const isSenior = (lvl) => lvl === 'ust'
/** Talep edenin seviyesine göre ilk dönüş hedefi */
export const SLA_BY_LEVEL = { ust: '4 saat', birim: '1 iş günü', po: '2 iş günü (sprint önceliği)' }
export const SOURCE_LABEL = { mail: 'Mail', zoom: 'Zoom', tfs: 'TFS Kanban', jira: 'Jira', manual: 'Manuel', api: 'API' }

const DEMO_ENV = process.env.AGENT_DEMO_INTERPRETER ?? 'auto'
let isGenaiActive = () => false
/** genai.js kendini kaydeder (döngüsel import olmasın diye) */
export const setGenaiProbe = (fn) => { isGenaiActive = fn }
export const DEMO_INTERPRETER = DEMO_ENV === 'true' || (DEMO_ENV === 'auto' && !process.env.AGENT_WEBHOOK_URL)

export const lower = (s) => String(s ?? '').toLocaleLowerCase('tr')
const STOP = new Set(['acil', 'ivedi', 'hemen', 'kritik', 'için', 'ile', 'olan', 'olarak', 'merhaba', 'rica', 'ederiz', 'ederim', 'teşekkürler', 'kontrol', 'edebilir',
  'misiniz', 'lütfen', 'yeni', 'talebi', 'talep', 'hakkında', 'gerekiyor', 'bugün', 'yarın', 'olarak', 'ekte', 'ektedir', 'bilgi',
  'ortamında', 'ortamı', 'sonra', 'sabah', 'gece', 'tekrar', 'yine', 'durum', 'planı', 'kaydı',
  'jira', 'kaydından', 'kartından', 'kartı', 'gelen', 'takıma', 'iletilen', 'detaylar', 'aşağıdadır', 'desteğinizi', 'konuyla', 'ilgili'])
export const tokens = (s) => [...new Set(lower(s).replace(/[^a-zçğıöşü0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 4 && !STOP.has(t)))]
export const stem = (t) => t.slice(0, 5)   // Türkçe ekleri kabaca yutmak için ilk 5 harf

const db = (c) => c ?? { query }

export async function keywordRules(c) {
  return (await db(c).query('SELECT key, label, terms, color, sort_order FROM keyword_rule WHERE enabled ORDER BY sort_order, id')).rows
}

export function matchKeywords(text, rules) {
  const t = lower(text)
  return rules.filter((r) => r.terms.some((term) => t.includes(lower(term)))).map((r) => r.key)
}

/** Talep edeni kişi rehberinde bulur: önce e-posta, sonra ad. */
async function findContact(c, email, name) {
  const r = await db(c).query(
    `SELECT * FROM contact WHERE ($1::text IS NOT NULL AND lower(email) = lower($1)) OR ($2::text IS NOT NULL AND lower(full_name) = lower($2))
     ORDER BY (lower(email) = lower(coalesce($1, ''))) DESC LIMIT 1`, [email || null, name || null])
  return r.rows[0] ?? null
}

/** İşin anahtar kelimelerini ve üst yönetim seviyesini hesaplayıp yazar. tx içinden c ile çağrılmalı. */
export async function enrichItem(c, id) {
  const it = (await db(c).query(
    `SELECT w.id, w.title, w.description, w.requester, w.requester_email, w.source_type, w.source_id, w.keywords AS cur_keywords, w.keywords_by,
            (SELECT string_agg(coalesce(e.subject, '') || ' ' || coalesce(e.body_text, e.body_preview, ''), ' ')
             FROM email e WHERE e.work_item_id = w.id OR (w.source_type = 'mail' AND e.id = w.source_id)) AS mail_text,
            (SELECT e.from_address FROM email e WHERE w.source_type = 'mail' AND e.id = w.source_id) AS mail_from
     FROM work_item w WHERE w.id = $1`, [id])).rows[0]
  if (!it) return null
  const rules = await keywordRules(c)
  // Konu GenAI tarafından atandıysa (keywords_by = 'genai') metin eşleşmesi onu ezmez
  const keywords = it.keywords_by ? it.cur_keywords : matchKeywords(`${it.title} ${it.description ?? ''} ${it.mail_text ?? ''}`, rules)
  const contact = await findContact(c, it.requester_email || it.mail_from, it.requester)
  await db(c).query(
    `UPDATE work_item SET keywords = $2, mgmt_level = $3, requester_email = coalesce(requester_email, $4) WHERE id = $1`,
    [id, keywords, contact?.mgmt_level ?? 'diger', contact?.email ?? it.mail_from ?? null])
  return { keywords, mgmt_level: contact?.mgmt_level ?? 'diger' }
}

const days = (a, b) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
const round1 = (n) => Math.round(n * 10) / 10

/** Ajanın yorum yaparken bakacağı geçmiş: DB (benzer işler), Wiki, Mail (gönderici geçmişi), ekip yükü. */
export async function buildContext(id) {
  const item = (await query(`${ITEM_SQL} WHERE w.id = $1`, [id])).rows.map(toItem)[0]
  if (!item) return null
  const rules = await keywordRules()
  const ruleBy = Object.fromEntries(rules.map((r) => [r.key, r]))
  const mail = item.source_type === 'mail' && item.source_id
    ? (await query(`SELECT id, from_address, from_name, subject, coalesce(body_text, body_preview, '') AS body, received_at FROM email WHERE id = $1`, [item.source_id])).rows[0]
    : null
  const contact = await findContact(null, item.requester_email || mail?.from_address, item.requester)
  const external = ['tfs', 'jira'].includes(item.source_type)
    ? { system: SOURCE_LABEL[item.source_type], ref: item.external_ref, url: item.external_url ?? null } : null
  const myTokens = tokens(`${item.title} ${item.description} ${mail?.subject ?? ''}`)
  const myStems = new Set(myTokens.map(stem))
  const overlap = (text) => tokens(text).filter((t) => myStems.has(stem(t)))

  // ---- DB: benzer geçmiş işler (anahtar kelime + kelime örtüşmesi) ----
  const cands = (await query(
    `SELECT w.id, w.code, w.title, w.description, w.status, w.keywords, w.created_at, w.closed_at, w.priority, u.username AS assignee,
            w.source_type, w.external_ref,
            (SELECT a.comment FROM work_item_activity a WHERE a.work_item_id = w.id AND a.action IN ('comment','agent_note')
             ORDER BY a.id DESC LIMIT 1) AS last_note
     FROM work_item w LEFT JOIN app_user u ON u.id = w.assignee_id
     WHERE w.id <> $1 AND w.status <> 'cancelled' ORDER BY w.created_at DESC LIMIT 500`, [id])).rows
  const similar = cands.map((w) => {
    const kw = w.keywords.filter((k) => item.keywords.includes(k))
    const words = overlap(`${w.title} ${w.description ?? ''}`)
    return { ...w, score: kw.length * 2 + words.length * 3 + (lower(w.title) === lower(item.title) ? 5 : 0), shared_keywords: kw, shared_words: words }
  }).filter((w) => w.score >= 3 && (w.shared_words.length > 0 || w.shared_keywords.length > 1))
    .sort((a, b) => b.score - a.score || (b.status === 'done') - (a.status === 'done')).slice(0, 5)
    .map((w) => ({ id: w.id, code: w.code, title: w.title, status: w.status, priority: w.priority, assignee: w.assignee,
                   source_type: w.source_type, external_ref: w.external_ref,
                   resolved_in_days: w.closed_at ? round1(days(w.created_at, w.closed_at)) : null, last_note: w.last_note,
                   shared_keywords: w.shared_keywords, shared_words: w.shared_words, score: w.score }))

  // ---- Wiki: anahtar kelime terimleri + kelime örtüşmesi ----
  const terms = item.keywords.flatMap((k) => ruleBy[k]?.terms ?? [])
  const pages = (await query('SELECT id, slug, title, space, body, tags, url, updated_at FROM wiki_page')).rows
  const wiki = pages.map((p) => {
    const text = lower(`${p.title} ${p.body} ${p.tags.join(' ')}`)
    const termHits = terms.filter((t) => text.includes(lower(t))).length
    const words = overlap(`${p.title} ${p.tags.join(' ')}`)
    const senior = isSenior(contact?.mgmt_level) && p.tags.includes('üst-yönetim') ? 4 : 0
    return { p, score: termHits + words.length * 3 + senior }
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3)
    .map(({ p, score }) => ({ id: p.id, slug: p.slug, title: p.title, space: p.space, url: p.url, tags: p.tags, score,
                              excerpt: p.body.split('\n').find((l) => l.trim().length > 30)?.trim().slice(0, 240) ?? p.body.slice(0, 240) }))

  // ---- Mail: göndericinin geçmişi ----
  const sender = contact?.email ?? mail?.from_address ?? null
  const senderMails = sender ? (await query(
    `SELECT e.id, e.subject, e.received_at, w.code AS work_item_code, w.status AS work_item_status
     FROM email e LEFT JOIN work_item w ON w.id = e.work_item_id
     WHERE lower(e.from_address) = lower($1) AND e.id <> coalesce($2, -1) AND e.received_at > now() - interval '120 days'
     ORDER BY e.received_at DESC LIMIT 10`, [sender, mail?.id ?? null])).rows : []

  const load = (await query(
    `SELECT u.username, count(w.id)::int AS open_items FROM app_user u
     LEFT JOIN work_item w ON w.assignee_id = u.id AND w.status NOT IN ('done','cancelled')
     WHERE u.is_active AND u.role <> 'agent' AND u.role <> 'admin' GROUP BY u.username ORDER BY 2, 1`)).rows

  return {
    item, mail, external, contact: contact && { email: contact.email, full_name: contact.full_name, title: contact.title, department: contact.department,
                                      mgmt_level: contact.mgmt_level, mgmt_label: MGMT_LABEL[contact.mgmt_level] },
    keywords: item.keywords.map((k) => ({ key: k, label: ruleBy[k]?.label ?? k })),
    similar_items: similar, wiki_pages: wiki, sender_mails: senderMails, team_load: load,
  }
}

/** Ajan yorumunu yazar (gerçek ajan da örnek yorumlayıcı da bunu kullanır). */
export async function setAgentComment(id, b, actor, byLabel = null) {
  const comment = String(b.comment ?? '').trim()
  if (!comment) throw httpError(400, 'invalid', 'comment zorunlu', { field: 'comment' })
  if (b.confidence !== undefined && b.confidence !== null && !(Number(b.confidence) >= 0 && Number(b.confidence) <= 1))
    throw httpError(400, 'invalid', 'confidence 0-1 arası olmalı', { field: 'confidence' })
  const sources = Array.isArray(b.sources) ? b.sources.slice(0, 20) : []
  const r = await query(
    `UPDATE work_item SET agent_comment = $2, agent_sources = $3, agent_confidence = $4, agent_suggestion = $5,
            agent_comment_by = $6, agent_comment_at = now() WHERE id = $1 RETURNING code`,
    [id, comment.slice(0, 8000), JSON.stringify(sources), b.confidence ?? null, b.suggestion ? JSON.stringify(b.suggestion) : null,
     byLabel ?? actor?.username ?? 'ajan'])
  if (!r.rows[0]) return null
  await emit(null, 'work_item.agent_commented', 'work_item', id, { code: r.rows[0].code }, actor)
  return (await query(`${ITEM_SQL} WHERE w.id = $1`, [id])).rows.map(toItem)[0]
}

const PRIORITY_TR = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' }
const durTxt = (d) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} saatte` : `${round1(d)} günde`)
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

/**
 * Örnek (kural tabanlı) yorumlayıcı — LLM yok. Geçmiş paketinden okunabilir bir değerlendirme üretir.
 * Gerçek ajan bağlandığında AGENT_DEMO_INTERPRETER=false yapılır ya da ajan bu yorumun üstüne yazar.
 */
export async function interpret(id) {
  const ctx = await buildContext(id)
  if (!ctx) return null
  const { item, contact, keywords, external, similar_items: sim, wiki_pages: wiki, sender_mails: sm, team_load: load } = ctx
  const lines = []
  const sources = []

  // 1) Kim istiyor?
  if (contact) {
    const lvl = contact.mgmt_level
    const who = `${contact.full_name} (${contact.title ?? MGMT_LABEL[lvl]}${contact.department ? `, ${contact.department}` : ''})`
    lines.push(lvl === 'diger' ? `Talep eden: ${who}.` : `**${MGMT_LABEL[lvl]} talebi** — ${who}.`)
  } else if (item.requester) {
    lines.push(`Talep eden: ${item.requester} (kişi rehberinde yok).`)
  }
  // 2) Nereden geldi, konu ne?
  const src = external ? `${external.system} kaydı${external.ref ? ` ${external.ref}` : ''}` : item.source_type === 'mail' ? 'Mail' : SOURCE_LABEL[item.source_type]
  lines.push(`Kaynak: ${src}.` + (keywords.length ? ` Konu: ${keywords.map((k) => `«${k.label}»`).join(', ')}.` : ' Takip edilen bir konuyla eşleşmedi.'))

  // 3) DB: benzer geçmiş işler
  const solved = sim.filter((s) => s.status === 'done')
  if (sim.length) {
    const best = sim[0]
    const how = best.status === 'done'
      ? `${best.assignee ?? 'ekip'} ${durTxt(best.resolved_in_days)} çözmüş`
      : `hâlâ açık (${best.assignee ?? 'atanmamış'})`
    const bestRef = best.external_ref ? ` (${SOURCE_LABEL[best.source_type]} ${best.external_ref})` : ''
    lines.push(`Geçmişte ${sim.length} benzer iş var. En yakını **${best.code}**${bestRef} «${best.title}» — ${how}.` +
      (best.last_note ? ` Son not: “${best.last_note.slice(0, 160)}${best.last_note.length > 160 ? '…' : ''}”` : ''))
    const openDup = sim.find((s) => s.status !== 'done' && s.score >= 8)
    if (openDup && openDup !== best) lines.push(`Açık bir benzer kayıt da var: ${openDup.code} — yinelenen talep olabilir.`)
    else if (best.status !== 'done' && best.score >= 8) lines.push('Bu, açık bir işin tekrarı olabilir; birleştirmeyi değerlendirin.')
    for (const s of sim.slice(0, 3)) sources.push({ type: 'db', id: s.id, ref: s.code, title: s.title })
  } else {
    lines.push('Geçmişte benzer bir iş bulunamadı; yeni bir konu.')
  }

  // 4) Wiki
  if (wiki.length) {
    lines.push(`İlgili wiki: ${wiki.map((w) => `«${w.title}» (${w.space})`).join(', ')}. ${wiki[0].excerpt}`)
    for (const w of wiki) sources.push({ type: 'wiki', id: w.id, ref: w.slug, title: w.title, url: w.url })
  }

  // 5) Mail geçmişi
  if (sm.length) {
    const asItem = sm.filter((m) => m.work_item_code)
    lines.push(`Bu göndericiden son 120 günde ${sm.length} mail daha gelmiş${asItem.length ? `; ${asItem.length} tanesi işe dönüşmüş (${asItem.slice(0, 3).map((m) => m.work_item_code).join(', ')})` : ''}.`)
    for (const m of sm.slice(0, 2)) sources.push({ type: 'mail', id: m.id, ref: m.work_item_code ?? `mail-${m.id}`, title: m.subject })
  }

  // 6) Öneri
  const kw = new Set(keywords.map((k) => k.key))
  const lvl = contact?.mgmt_level ?? 'diger'
  // Failed + (üst yönetim | MQ | OpenShift) → Kritik; Failed, üst yönetim ya da birim yöneticisinden altyapı upgrade'i → Yüksek; Decom → Düşük
  const infra = kw.has('mq') || kw.has('openshift') || kw.has('server')
  let priority = 'normal'
  if (kw.has('failed') && (lvl === 'ust' || kw.has('mq') || kw.has('openshift'))) priority = 'critical'
  else if (kw.has('failed') || lvl === 'ust' || (lvl === 'birim' && infra)) priority = 'high'
  else if (kw.has('decom') && keywords.length === 1) priority = 'low'
  if (/\b(acil|ivedi|kritik)\b/u.test(lower(`${item.title} ${item.description}`)) && priority !== 'critical') priority = priority === 'high' ? 'critical' : 'high'
  const loadOf = Object.fromEntries(load.map((l) => [l.username, l.open_items]))
  const resolvers = solved.map((s) => s.assignee).filter((u) => u && u in loadOf)
  const freq = resolvers.reduce((m, u) => ({ ...m, [u]: (m[u] ?? 0) + 1 }), {})
  const expert = Object.entries(freq).sort((a, b) => b[1] - a[1] || loadOf[a[0]] - loadOf[b[0]])[0]?.[0]
  const assignee = expert ?? load[0]?.username ?? null
  const eta = median(solved.map((s) => s.resolved_in_days).filter((d) => d !== null)) ?? (priority === 'critical' ? 0.5 : 2)
  const sla = SLA_BY_LEVEL[lvl] ?? null
  lines.push(`**Öneri:** öncelik ${PRIORITY_TR[priority]}` +
    (assignee ? `, atanan: ${assignee} (${expert ? 'benzer işleri çözmüş' : 'ekipte en az yüklü'}, açık işi ${loadOf[assignee] ?? 0})` : '') +
    `, tahmini çözüm ~${eta < 1 ? `${Math.max(1, Math.round(eta * 24))} saat` : `${round1(eta)} gün`}` + (sla ? `; ${MGMT_LABEL[lvl]} için ilk dönüş ${sla}.` : '.'))

  const topScore = sim[0]?.score ?? 0
  const confidence = Math.min(0.9, 0.3 + Math.min(solved.length, 3) * 0.08 + Math.min(topScore, 12) * 0.015 + (wiki.length ? 0.08 : 0) + (contact ? 0.05 : 0))
  return setAgentComment(id, {
    comment: lines.join('\n'), sources, confidence: Math.round(confidence * 100) / 100,
    suggestion: { priority, assignee, eta_days: round1(eta), sla },
  }, null, 'yaver-ajan (örnek)')
}

// =====================================================================
// Okuma: wiki, kişiler
// =====================================================================
export async function listWiki(q) {
  const vals = []
  const where = []
  if (q.q) { vals.push(`%${q.q}%`); where.push(`(title ILIKE $${vals.length} OR body ILIKE $${vals.length})`) }
  if (q.tag) { vals.push(q.tag); where.push(`$${vals.length} = ANY(tags)`) }
  if (q.space) { vals.push(q.space); where.push(`space = $${vals.length}`) }
  const { rows } = await query(
    `SELECT id, slug, title, space, tags, url, updated_by, updated_at, left(body, 240) AS excerpt FROM wiki_page
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 100`, vals)
  return { pages: rows }
}

export async function getWiki(idOrSlug) {
  const r = await query(`SELECT * FROM wiki_page WHERE ${/^\d+$/.test(String(idOrSlug)) ? 'id = $1::int' : 'slug = $1'}`, [String(idOrSlug)])
  return r.rows[0] ?? null
}

export async function upsertWiki(b) {
  if (!b.slug || !b.title) throw httpError(400, 'invalid', 'slug ve title zorunlu')
  const r = await query(
    `INSERT INTO wiki_page (slug, title, space, body, tags, url, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, space = EXCLUDED.space, body = EXCLUDED.body, tags = EXCLUDED.tags,
       url = EXCLUDED.url, updated_by = EXCLUDED.updated_by, updated_at = now() RETURNING *`,
    [String(b.slug).slice(0, 200), String(b.title).slice(0, 300), b.space ?? 'Genel', String(b.body ?? ''),
     Array.isArray(b.tags) ? b.tags.map(String) : [], b.url ?? null, b.updated_by ?? null])
  return r.rows[0]
}

export async function listContacts() {
  const { rows } = await query(`SELECT id, email, full_name, title, department, mgmt_level FROM contact ORDER BY
    array_position(ARRAY['ust','birim','po','diger']::varchar[], mgmt_level), full_name`)
  return { contacts: rows.map((r) => ({ ...r, mgmt_label: MGMT_LABEL[r.mgmt_level] })) }
}

export async function upsertContact(b) {
  if (!b.email || !b.full_name) throw httpError(400, 'invalid', 'email ve full_name zorunlu')
  if (b.mgmt_level && !(b.mgmt_level in MGMT_LABEL)) throw httpError(400, 'invalid', `mgmt_level: ${Object.keys(MGMT_LABEL).join(' | ')}`)
  const r = await query(
    `INSERT INTO contact (email, full_name, title, department, mgmt_level) VALUES (lower($1), $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, title = EXCLUDED.title, department = EXCLUDED.department,
       mgmt_level = EXCLUDED.mgmt_level RETURNING *`,
    [b.email, b.full_name, b.title ?? null, b.department ?? null, b.mgmt_level ?? 'diger'])
  // Bu kişinin işleri yeniden sınıflansın
  await query(`UPDATE work_item SET mgmt_level = $2 WHERE lower(requester_email) = lower($1) OR lower(requester) = lower($3)`,
    [r.rows[0].email, r.rows[0].mgmt_level, r.rows[0].full_name])
  return r.rows[0]
}

export async function saveKeywordRules(list) {
  if (!Array.isArray(list)) throw httpError(400, 'invalid', 'Dizi bekleniyor')
  await tx(async (c) => {
    for (const [i, r] of list.entries()) {
      if (!r.key || !r.label || !Array.isArray(r.terms) || !r.terms.length) throw httpError(400, 'invalid', 'key, label, terms[] zorunlu')
      await c.query(
        `INSERT INTO keyword_rule (key, label, terms, color, sort_order, enabled) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, terms = EXCLUDED.terms, color = EXCLUDED.color,
           sort_order = EXCLUDED.sort_order, enabled = EXCLUDED.enabled`,
        [String(r.key).slice(0, 50), String(r.label).slice(0, 100), r.terms.map((t) => lower(t)), r.color ?? '#DC0005', r.sort_order ?? (i + 1) * 10, r.enabled !== false])
    }
    const keys = list.map((r) => String(r.key))
    await c.query('UPDATE keyword_rule SET enabled = FALSE WHERE NOT (key = ANY($1))', [keys])
  })
  await reclassifyAll()
  return keywordRules()
}

/** Kurallar/kişiler değişince tüm işlerin anahtar kelime + seviye alanlarını yeniden hesaplar. */
export async function reclassifyAll() {
  const ids = (await query('SELECT id FROM work_item')).rows.map((r) => r.id)
  for (const id of ids) await enrichItem(null, id)
  return ids.length
}

// =====================================================================
// Toplu mail (bulk-send-mail)
// =====================================================================
const DEMO_MAILS = [
  ['hakan.erdem@firma.com', 'ACİL: Ödeme kanalında MQ kuyrukları doluyor', 'Ödeme kanalında işlemler beklemede kalıyor; MQ tarafında PAYMENT.IN kuyruğunun dolduğu söyleniyor. Bugün içinde durum ve kök neden rica ediyorum.', 'high'],
  ['selin.koc@firma.com', 'OpenShift 4.14 → 4.16 upgrade planı', 'Prod OpenShift cluster upgrade\'i için bakım penceresi ve geri dönüş planını CAB öncesi paylaşır mısınız?', 'normal'],
  ['murat.aydin@firma.com', 'RHEL 7 sunucuların server upgrade takvimi', 'Destek süresi biten RHEL 7 sunucuları için OS upgrade takvimini birim bazında çıkaralım. Liste ektedir.', 'normal'],
  ['deniz.arslan@firma.com', 'MQ channel RETRY durumunda kaldı', 'CRM → Çekirdek arasındaki MQ channel sabahtan beri RETRY durumunda, mesajlar DLQ\'ya düşüyor.', 'high'],
  ['elif.sahin@firma.com', 'Bu gece yapılacak change için CAB onayı', 'Gece yapılacak firewall değişikliği için change kaydı açıldı, CAB onayı ve uygulama ekibinin hazır olması gerekiyor.', 'normal'],
  ['burak.cetin@firma.com', 'Release pipeline failed — mobil backend', 'Mobil backend release pipeline\'ı build adımında failed oluyor, sprint sonu release riskte.', 'high'],
  ['gizem.yildiz@firma.com', 'Ödeme platformu sprint release\'i için deploy penceresi', 'Ödeme platformunun yeni versiyonu için prod deploy penceresi talep ediyorum, user story\'ler testten geçti.', 'normal'],
  ['emre.kurt@firma.com', 'Mobil uygulamada login bug\'ı', 'Yeni versiyonda bazı Android kullanıcılar login olamıyor, bug kaydını önceliklendirebilir misiniz?', 'high'],
  ['murat.aydin@firma.com', 'Eski rapor sunucularının decom edilmesi', 'RPTSRV01-04 artık kullanılmıyor; decom süreci, yedek ve DNS temizliği için iş açalım.', 'low'],
  ['noreply@monitor.firma.com', '[ALARM] Batch job FAILED — EOD_MUTABAKAT', 'EOD_MUTABAKAT job\'ı 02:14\'te failed durumuna düştü. Hata: ORA-01555 snapshot too old.', 'high'],
  ['ece.tan@firma.com', 'Müşteri portalı backlog önceliklendirmesi', 'Portal backlog\'undaki SSO user story\'lerinin geliştirme takvimini konuşmak istiyorum.', 'normal'],
  ['selin.koc@firma.com', 'Incident: Jenkins agent\'ları down', 'Tüm Jenkins agent\'ları down görünüyor, build kuyruğu 40 işi geçti. Incident kaydı açıldı.', 'high'],
]

// TFS Kanban ve Jira'dan gelen örnek kalemler (POST /api/bulk-import {count})
// [kaynak, ref, talep eden, başlık, açıklama, öncelik]
const DEMO_TICKETS = [
  ['tfs', 'TFS-48213', 'burak.cetin@firma.com', 'Ödeme servisi deploy pipeline\'ı helm adımında failed', 'Kanban kartı: Dev → Test geçişinde helm upgrade timeout veriyor.', 'high'],
  ['tfs', 'TFS-48230', 'gizem.yildiz@firma.com', 'Ödeme platformu 3.8 release hazırlığı', 'Sprint 42 release kartı: release notları, versiyon etiketi, prod deploy talebi.', 'normal'],
  ['tfs', 'TFS-48244', 'murat.aydin@firma.com', 'APPSRV12 Windows Server 2016 → 2022 server upgrade', 'Kanban kartı: uygulama sahibinden test onayı bekleniyor.', 'normal'],
  ['tfs', 'TFS-48251', 'emre.kurt@firma.com', 'Mobil backend yeni API versiyonu', 'User story: v2 uçlarının prod\'a alınması, backlog önceliği 1.', 'normal'],
  ['jira', 'OPS-1123', 'deniz.arslan@firma.com', 'MQ QMGR_PROD2 sertifika yenilemesi', 'TLS sertifikası 14 gün içinde bitiyor; channel kesintisi olmadan yenilenmeli.', 'high'],
  ['jira', 'OPS-1131', 'selin.koc@firma.com', 'OpenShift prod cluster upgrade — worker node drain sorunu', 'Upgrade provasında worker node drain 40 dk sürdü, PDB ayarları gözden geçirilmeli.', 'high'],
  ['jira', 'OPS-1140', 'murat.aydin@firma.com', 'Legacy FTP sunucusunun decom edilmesi', 'Son 90 günde trafik yok; decom öncesi bağımlılık analizi.', 'low'],
  ['jira', 'ITSM-3302', 'elif.sahin@firma.com', 'Problem kaydı: tekrarlayan batch failed hataları', 'Son 30 günde 4 kez failed olan EOD batch\'i için kök neden analizi.', 'normal'],
]

export async function bulkSendMail(body, actor) {
  const createItems = body.create_items !== false
  const runInterpret = body.interpret !== false && DEMO_INTERPRETER && !isGenaiActive()
  let mails = body.mails
  if (mails !== undefined && !Array.isArray(mails)) throw httpError(400, 'invalid', 'mails dizi olmalı', { field: 'mails' })
  if (!mails?.length) {
    const n = Math.min(50, Math.max(1, Number(body.count) || 5))
    const pool = [...DEMO_MAILS].sort(() => Math.random() - 0.5)
    const contacts = Object.fromEntries((await query('SELECT email, full_name FROM contact')).rows.map((r) => [r.email, r.full_name]))
    mails = Array.from({ length: n }, (_, i) => {
      const [from, subject, text, importance] = pool[i % pool.length]
      return { from_address: from, from_name: contacts[from] ?? from.split('@')[0], subject, body: text, importance }
    })
  }
  if (mails.length > 200) throw httpError(400, 'invalid', 'Tek seferde en fazla 200 mail')
  for (const [i, m] of mails.entries()) {
    if (!m || typeof m !== 'object') throw httpError(400, 'invalid', `mails[${i}] nesne olmalı`)
    if (!String(m.from_address ?? m.from ?? '').includes('@')) throw httpError(400, 'invalid', `mails[${i}].from_address geçersiz`)
    if (!String(m.subject ?? '').trim()) throw httpError(400, 'invalid', `mails[${i}].subject zorunlu`)
  }
  const mailbox = (await query(`SELECT value FROM app_setting WHERE category='general' AND key='mailbox'`)).rows[0]?.value || 'takim@firma.com'
  const out = { emails: [], work_items: [] }
  const batch = crypto.randomBytes(4).toString('hex')
  for (const [i, m] of mails.entries()) {
    const from = String(m.from_address ?? m.from).trim().toLowerCase()
    const contact = await findContact(null, from, null)
    const text = String(m.body ?? m.body_text ?? '')
    const imp = ['low', 'normal', 'high'].includes(m.importance) ? m.importance : 'normal'
    const e = await tx(async (c) => {
      const r = await c.query(
        `INSERT INTO email (message_id, thread_id, mailbox, from_address, from_name, to_addresses, cc_addresses, subject, body_preview, body_text,
                            importance, has_attachments, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,'[]',$7,$8,$9,$10,FALSE, coalesce($11::timestamptz, now())) ON CONFLICT (message_id) DO NOTHING
         RETURNING id, subject, from_address, from_name, received_at`,
        [m.message_id ?? `<bulk-${batch}-${i}@yaver.local>`, m.thread_id ?? null, mailbox, from, m.from_name ?? contact?.full_name ?? from,
         JSON.stringify(Array.isArray(m.to) ? m.to : [mailbox]), String(m.subject).slice(0, 1000), text.slice(0, 2000), text, imp, m.received_at ?? null])
      if (!r.rows[0]) return null
      await emit(c, 'email.received', 'email', r.rows[0].id, { subject: r.rows[0].subject, from_address: from, source: 'bulk-send-mail' }, actor)
      return r.rows[0]
    })
    if (!e) continue
    out.emails.push(e)
    if (!createItems) continue
    const item = await createWorkItem({
      title: String(m.subject).replace(/^(acil|ACİL)\s*:\s*/u, '').slice(0, 500), description: text.slice(0, 4000), source_type: 'mail', source_id: e.id,
      requester: e.from_name, requester_email: from, priority: imp === 'high' ? 'high' : 'normal', category: m.category ?? 'Talep',
      tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
    }, actor)
    out.work_items.push(runInterpret ? (await interpret(item.id)) ?? item : item)
  }
  return { count: out.emails.length, interpreted: createItems && runInterpret, ...out }
}

// =====================================================================
// TFS Kanban / Jira kalemleri (bulk-import)
// =====================================================================
export async function bulkImport(body, actor) {
  const runInterpret = body.interpret !== false && DEMO_INTERPRETER && !isGenaiActive()
  let items = body.items
  if (items !== undefined && !Array.isArray(items)) throw httpError(400, 'invalid', 'items dizi olmalı', { field: 'items' })
  if (!items?.length) {
    const n = Math.min(50, Math.max(1, Number(body.count) || 4))
    const pool = [...DEMO_TICKETS].sort(() => Math.random() - 0.5)
    const sfx = crypto.randomBytes(2).toString('hex')
    items = Array.from({ length: n }, (_, i) => {
      const [source_type, ref, from, title, description, priority] = pool[i % pool.length]
      return { source_type, external_ref: `${ref}-${sfx}${i >= pool.length ? i : ''}`, requester_email: from, title, description, priority }
    })
  }
  if (items.length > 200) throw httpError(400, 'invalid', 'Tek seferde en fazla 200 kalem')
  for (const [i, t] of items.entries()) {
    if (!['tfs', 'jira'].includes(t?.source_type)) throw httpError(400, 'invalid', `items[${i}].source_type: tfs | jira`)
    if (!String(t.external_ref ?? '').trim()) throw httpError(400, 'invalid', `items[${i}].external_ref zorunlu (ör. TFS-48213, OPS-1123)`)
    if (!String(t.title ?? '').trim()) throw httpError(400, 'invalid', `items[${i}].title zorunlu`)
    if (t.priority !== undefined && !['low', 'normal', 'high', 'critical'].includes(t.priority)) throw httpError(400, 'invalid', `items[${i}].priority geçersiz`)
  }
  const out = { work_items: [], skipped: [] }
  for (const t of items) {
    const ref = String(t.external_ref).trim().slice(0, 200)
    const dup = (await query('SELECT id FROM work_item WHERE source_type = $1 AND external_ref = $2', [t.source_type, ref])).rows[0]
    if (dup) { out.skipped.push({ external_ref: ref, work_item_id: dup.id }); continue }
    const contact = t.requester_email ? await findContact(null, t.requester_email, null) : null
    const item = await createWorkItem({
      title: String(t.title).slice(0, 500), description: String(t.description ?? '').slice(0, 4000), source_type: t.source_type,
      external_ref: ref, external_url: t.url ?? null, requester: t.requester ?? contact?.full_name ?? t.requester_email ?? SOURCE_LABEL[t.source_type],
      requester_email: t.requester_email ? String(t.requester_email).toLowerCase() : null, priority: t.priority ?? 'normal',
      category: t.category ?? (t.source_type === 'tfs' ? 'Kanban' : 'Jira'), tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
    }, actor)
    out.work_items.push(runInterpret ? (await interpret(item.id)) ?? item : item)
  }
  return { count: out.work_items.length, interpreted: runInterpret, ...out }
}
