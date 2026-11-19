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

export const MGMT_LABEL = { gm: 'Genel Müdür', gmy: 'Genel Müdür Yrd.', direktor: 'Direktör', mudur: 'Müdür', diger: 'Diğer' }
const MGMT_RANK = { gm: 0, gmy: 1, direktor: 2, mudur: 3, diger: 4 }
export const isSenior = (lvl) => ['gm', 'gmy', 'direktor'].includes(lvl)

const DEMO_ENV = process.env.AGENT_DEMO_INTERPRETER ?? 'auto'
export const DEMO_INTERPRETER = DEMO_ENV === 'true' || (DEMO_ENV === 'auto' && !process.env.AGENT_WEBHOOK_URL)

const lower = (s) => String(s ?? '').toLocaleLowerCase('tr')
const STOP = new Set(['acil', 'ivedi', 'hemen', 'kritik', 'için', 'ile', 'olan', 'olarak', 'merhaba', 'rica', 'ederiz', 'ederim', 'teşekkürler', 'kontrol', 'edebilir',
  'misiniz', 'lütfen', 'yeni', 'talebi', 'talep', 'hakkında', 'gerekiyor', 'bugün', 'yarın', 'olarak', 'ekte', 'ektedir', 'bilgi'])
export const tokens = (s) => [...new Set(lower(s).replace(/[^a-zçğıöşü0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 4 && !STOP.has(t)))]
const stem = (t) => t.slice(0, 5)   // Türkçe ekleri kabaca yutmak için ilk 5 harf

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
    `SELECT w.id, w.title, w.description, w.requester, w.requester_email, w.source_type, w.source_id,
            (SELECT string_agg(coalesce(e.subject, '') || ' ' || coalesce(e.body_text, e.body_preview, ''), ' ')
             FROM email e WHERE e.work_item_id = w.id OR (w.source_type = 'mail' AND e.id = w.source_id)) AS mail_text,
            (SELECT e.from_address FROM email e WHERE w.source_type = 'mail' AND e.id = w.source_id) AS mail_from
     FROM work_item w WHERE w.id = $1`, [id])).rows[0]
  if (!it) return null
  const rules = await keywordRules(c)
  const keywords = matchKeywords(`${it.title} ${it.description ?? ''} ${it.mail_text ?? ''}`, rules)
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
  const myTokens = tokens(`${item.title} ${item.description} ${mail?.subject ?? ''}`)
  const myStems = new Set(myTokens.map(stem))
  const overlap = (text) => tokens(text).filter((t) => myStems.has(stem(t)))

  // ---- DB: benzer geçmiş işler (anahtar kelime + kelime örtüşmesi) ----
  const cands = (await query(
    `SELECT w.id, w.code, w.title, w.description, w.status, w.keywords, w.created_at, w.closed_at, w.priority, u.username AS assignee,
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
    item, mail, contact: contact && { email: contact.email, full_name: contact.full_name, title: contact.title, department: contact.department,
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
  const { item, contact, keywords, similar_items: sim, wiki_pages: wiki, sender_mails: sm, team_load: load } = ctx
  const lines = []
  const sources = []

  // 1) Kim istiyor?
  if (contact) {
    const lvl = contact.mgmt_level
    lines.push(isSenior(lvl)
      ? `**Üst yönetim talebi** — ${contact.full_name} (${contact.title ?? MGMT_LABEL[lvl]}${contact.department ? `, ${contact.department}` : ''}).`
      : `Talep eden: ${contact.full_name}${contact.title ? ` (${contact.title})` : ''}.`)
  } else if (item.requester) {
    lines.push(`Talep eden: ${item.requester} (kişi rehberinde yok).`)
  }
  // 2) Mailde ne geçiyor?
  if (keywords.length) lines.push(`Mailde öne çıkan anahtar kelimeler: ${keywords.map((k) => `«${k.label}»`).join(', ')}.`)

  // 3) DB: benzer geçmiş işler
  const solved = sim.filter((s) => s.status === 'done')
  if (sim.length) {
    const best = sim[0]
    const how = best.status === 'done'
      ? `${best.assignee ?? 'ekip'} ${durTxt(best.resolved_in_days)} çözmüş`
      : `hâlâ açık (${best.assignee ?? 'atanmamış'})`
    lines.push(`Geçmişte ${sim.length} benzer iş var. En yakını **${best.code}** «${best.title}» — ${how}.` +
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
  let priority = 'normal'
  if (kw.has('acil') && (kw.has('prod') || lvl === 'gm')) priority = 'critical'
  else if (kw.has('acil') || kw.has('prod') || lvl === 'gm' || lvl === 'gmy') priority = 'high'
  else if (lvl === 'direktor' && (kw.has('rapor') || kw.has('fatura'))) priority = 'high'
  const loadOf = Object.fromEntries(load.map((l) => [l.username, l.open_items]))
  const resolvers = solved.map((s) => s.assignee).filter((u) => u && u in loadOf)
  const freq = resolvers.reduce((m, u) => ({ ...m, [u]: (m[u] ?? 0) + 1 }), {})
  const expert = Object.entries(freq).sort((a, b) => b[1] - a[1] || loadOf[a[0]] - loadOf[b[0]])[0]?.[0]
  const assignee = expert ?? load[0]?.username ?? null
  const eta = median(solved.map((s) => s.resolved_in_days).filter((d) => d !== null)) ?? (priority === 'critical' ? 0.5 : 2)
  const sla = lvl === 'gm' || lvl === 'gmy' ? '4 saat' : lvl === 'direktor' ? '1 iş günü' : null
  lines.push(`**Öneri:** öncelik ${PRIORITY_TR[priority]}` +
    (assignee ? `, atanan: ${assignee} (${expert ? 'benzer işleri çözmüş' : 'ekipte en az yüklü'}, açık işi ${loadOf[assignee] ?? 0})` : '') +
    `, tahmini çözüm ~${eta < 1 ? `${Math.max(1, Math.round(eta * 24))} saat` : `${round1(eta)} gün`}` + (sla ? `; üst yönetim SLA'sı ${sla}.` : '.'))

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
    array_position(ARRAY['gm','gmy','direktor','mudur','diger']::varchar[], mgmt_level), full_name`)
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
        [String(r.key).slice(0, 50), String(r.label).slice(0, 100), r.terms.map((t) => lower(t)), r.color ?? '#5148E5', r.sort_order ?? (i + 1) * 10, r.enabled !== false])
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
  ['hakan.erdem@firma.com', 'ACİL: Yönetim kurulu raporunda toplamlar tutmuyor', 'Yarınki yönetim kurulu sunumu için aylık rapordaki bölge toplamları ana tabloyla tutmuyor. Bugün içinde kontrol edilip düzeltilmesi gerekiyor.', 'high'],
  ['selin.koc@firma.com', 'Prod ortamında fatura servisi hata veriyor', 'Sabahtan beri fatura servisi 500 hata veriyor, müşteriler fatura göremiyor. Kesinti süresini ve kök nedeni paylaşır mısınız?', 'high'],
  ['burak.cetin@firma.com', 'Ödeme ekranı çok yavaş — müşteri şikayetleri arttı', 'Çağrı merkezine ödeme ekranının yavaş açıldığına dair şikayetler geliyor. Muhasebe kapanışı öncesi çözülmesi önemli.', 'high'],
  ['deniz.arslan@firma.com', 'Kapasite raporu için ek sorgu talebi', 'Çeyrek kapasite raporuna sunucu bazında disk büyüme trendinin eklenmesini rica ederiz.', 'normal'],
  ['murat.aydin@firma.com', 'Gece batch işi yine gecikti', 'Mutabakat batch işi bu gece de 2 saat geç bitti, sabah raporları eksik geldi.', 'normal'],
  ['elif.sahin@firma.com', 'Yeni başlayan 2 kişi için VPN ve hesap açılması', 'Pazartesi başlayacak iki arkadaşımız için VPN ve uygulama hesabı açılmasını rica ederiz.', 'normal'],
  ['gizem.yildiz@firma.com', 'Müşteri portalına giriş yapılamıyor', 'Birkaç kurumsal müşterimiz SSO ile portala giriş yapamadığını bildirdi.', 'high'],
  ['ece.tan@musteri.com', 'KVKK kapsamında veri silme talebi', 'KVKK madde 11 kapsamında şirketinizde bulunan kişisel verilerimin silinmesini talep ediyorum.', 'normal'],
  ['selin.koc@firma.com', 'Denetim öncesi lisans ve sertifika listesi', 'Gelecek hafta iç denetim var; kullandığımız yazılım lisanslarının ve SSL sertifikalarının bitiş tarihleriyle listesini rica ederim.', 'normal'],
  ['hakan.erdem@firma.com', 'Dashboard\'a günlük tahsilat KPI\'ı eklenmesi', 'Yönetim panosunda günlük tahsilat tutarını ve bir önceki günle farkını görmek istiyorum.', 'normal'],
  ['can.ozturk@firma.com', 'Test ortamına erişim', 'Test ortamındaki rapor ekranına erişimim yok, yetki verebilir misiniz?', 'low'],
  ['murat.aydin@firma.com', 'API yanıt süreleri yükseldi', 'Monitoring tarafında sipariş API yanıt süresi 2 sn üzerine çıktı, prod kontrol rica ederim.', 'high'],
]

export async function bulkSendMail(body, actor) {
  const createItems = body.create_items !== false
  const runInterpret = body.interpret !== false && DEMO_INTERPRETER
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
    }, actor)
    out.work_items.push(runInterpret ? (await interpret(item.id)) ?? item : item)
  }
  return { count: out.emails.length, interpreted: createItems && runInterpret, ...out }
}
