import { query } from './db.js'
import { MGMT_LABEL, keywordRules, lower, matchKeywords, stem, tokens } from './intel.js'
import { httpError } from './state.js'
import * as G from './genai.js'
import { readableAnswer } from './ai-format.js'
import crypto from 'node:crypto'

/** Pod (süreç) kimliği: her açılışta (rollout) değişir; arayüz farklı görürse sohbet geçmişini siler. */
export const BOOT_ID = crypto.randomBytes(6).toString('hex')

/**
 * Yaver AI sohbeti (0.9): kullanıcı serbest soru sorar; Yaver sorunun konusuna göre DB'deki benzer işleri
 * (kim, nasıl, kaç günde çözdü), wiki sayfalarını ve ekip yükünü bağlam olarak toplar.
 *  - GenAI Studio açıksa: soru + bağlam Chat Block'a gider; thread_id ile konuşma sürer.
 *  - Kapalıysa: aynı bağlamdan kural tabanlı (yerel) bir cevap yazılır; demo GenAI olmadan da çalışır.
 */

export const SUGGESTIONS = [
  'PAYMENT.IN kuyruğu yine doldu, daha önce nasıl çözüldü ve kim çözdü?',
  'Helm deploy pipeline\'ı timeout ile failed oldu, benzer bir kayıt var mı?',
  'Eski rapor sunucularını decom edeceğiz; süreç nasıl ilerledi, ne kadar sürdü?',
  'EOD_MUTABAKAT batch\'i ORA-01555 ile failed oldu, ne yapmalıyız?',
  'OpenShift prod upgrade\'inde worker node drain sorununa karşı neye dikkat etmeliyiz?',
  'Üst yönetimden gelen açık işler hangileri ve SLA durumları ne?',
  'MQ konusunda en deneyimli kim, şu an kaç açık işi var?',
]

const days = (a, b) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
const round1 = (n) => Math.round(n * 10) / 10

/** Sorudan bağlam: konu eşleşmesi + kelime örtüşmesi ile benzer işler, wiki, ekip yükü, (varsa) adı geçen iş. */
export async function askContext(text) {
  const rules = await keywordRules()
  const kws = matchKeywords(text, rules)
  const myStems = new Set(tokens(text).map(stem))
  const overlap = (t) => tokens(t).filter((x) => myStems.has(stem(x)))
  const codes = [...String(text).toUpperCase().matchAll(/YVR-(\d+)/g)].map((m) => Number(m[1]))
  const senior = /üst yönetim|ust yonetim|yönetici|gmy|direktör|sla/i.test(text)

  const rows = (await query(
    `SELECT w.id, w.code, w.title, w.description, w.status, w.priority, w.keywords, w.mgmt_level, w.requester, w.created_at, w.closed_at,
            w.source_type, w.external_ref, w.agent_comment, u.username AS assignee,
            (SELECT a.comment FROM work_item_activity a WHERE a.work_item_id = w.id AND a.action = 'comment' ORDER BY a.id DESC LIMIT 1) AS last_note
     FROM work_item w LEFT JOIN app_user u ON u.id = w.assignee_id WHERE w.status <> 'cancelled' ORDER BY w.created_at DESC LIMIT 800`)).rows
  const scored = rows.map((w) => {
    const kw = w.keywords.filter((k) => kws.includes(k)).length
    const words = overlap(`${w.title} ${w.description ?? ''}`).length
    const named = codes.includes(Number(String(w.code).replace(/\D/g, ''))) ? 20 : 0
    const sen = senior && w.mgmt_level === 'ust' && !['done', 'cancelled'].includes(w.status) ? 4 : 0
    return { w, score: kw * 2 + words * 3 + named + sen }
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score || (b.w.status === 'done') - (a.w.status === 'done')).slice(0, 8)
  const items = scored.map(({ w, score }) => ({
    id: w.id, code: w.code, title: w.title, status: w.status, priority: w.priority, source: w.source_type, external_ref: w.external_ref,
    requester: w.requester, requester_level: MGMT_LABEL[w.mgmt_level] ?? w.mgmt_level, assignee: w.assignee,
    opened: String(w.created_at.toISOString?.() ?? w.created_at).slice(0, 10),
    resolved_in_days: w.closed_at ? round1(days(w.created_at, w.closed_at)) : null,
    resolution_note: w.status === 'done' ? w.last_note : null, description: String(w.description ?? '').slice(0, 300),
    ai_comment: w.status !== 'done' && w.agent_comment ? String(w.agent_comment).slice(0, 300) : null, score,
  }))

  const terms = kws.flatMap((k) => rules.find((r) => r.key === k)?.terms ?? [])
  const pages = (await query('SELECT id, slug, title, space, body, tags, url FROM wiki_page')).rows
  const wiki = pages.map((p) => {
    const t = lower(`${p.title} ${p.body} ${p.tags.join(' ')}`)
    return { p, score: terms.filter((x) => t.includes(lower(x))).length + overlap(`${p.title} ${p.tags.join(' ')} ${p.body}`).length * 2 + (senior && p.tags.includes('üst-yönetim') ? 4 : 0) }
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3)
    .map(({ p }) => ({ id: p.id, slug: p.slug, title: p.title, url: p.url, body: p.body.slice(0, 700) }))

  const team = (await query(
    `SELECT u.username, u.full_name, count(w.id) FILTER (WHERE w.status NOT IN ('done','cancelled'))::int AS open_items,
            count(w.id) FILTER (WHERE w.status = 'done')::int AS solved
     FROM app_user u LEFT JOIN work_item w ON w.assignee_id = u.id
     WHERE u.is_active AND u.role NOT IN ('agent','admin') GROUP BY u.username, u.full_name ORDER BY 1`)).rows
  return { topics: kws.map((k) => rules.find((r) => r.key === k)?.label ?? k), items, wiki, team }
}

function buildAskPrompt(text, ctx, history) {
  const hist = (history ?? []).slice(-6).map((m) => `${m.role === 'user' ? 'Kullanıcı' : 'Yaver AI'}: ${String(m.content ?? '').slice(0, 600)}`).join('\n')
  return [
    'Sen "Yaver AI"sın: kullanıcının takımının iş takip asistanısın. Türkçe, kısa ve net cevap ver.',
    'Kendini tanıtman gerekirse (selam, merhaba, sen kimsin…) "Merhaba, ben Yaver AI; takımınızın iş takip asistanıyım." de; ekip adı ya da "IT operasyon ekibi" gibi bir tanım kullanma.',
    'Yalnız <baglam> içindeki kayıtlara dayan; bilmediğini uydurma. Geçmiş işleri kodlarıyla (YVR-xxxx) ve çözen kişiyle an,',
    'çözüm süresini ve çözüm notunu kullan, ilgili wiki sayfasını slug ile belirt. Gerekirse kime atanmasını önerdiğini ve',
    'talep edenin seviyesine göre SLA\'yı (Üst Yönetim 4 saat, Birim Yöneticisi 1 iş günü, PO 2 iş günü) söyle.',
    'Cevabı JSON OLARAK DEĞİL, okunur Türkçe metin olarak yaz: önce 1-2 cümlelik doğrudan cevap, sonra gerekirse "### Başlık" ve "- madde" satırları; önemli kodları **kalın** yaz; en fazla 8 madde.',
    hist ? `\nÖnceki konuşma:\n${hist}` : '',
    `\nSoru: ${text}`,
    `<baglam>${JSON.stringify(ctx)}</baglam>`,
  ].join('\n')
}

/** GenAI kapalıyken bağlamdan yerel cevap. */
const GREETING = /^\s*(selam(lar)?|merhaba(lar)?|mrb|slm|hey|hi|hello|günaydın|iyi (günler|akşamlar)|sen kimsin|kimsin)\b[\s!.,?]*$/i
const INTRO = 'Merhaba, ben Yaver AI; takımınızın iş takip asistanıyım. Geçmiş işlere, çözen kişilere, wiki sayfalarına ve ekibin iş yüküne bakarak sorularınızı cevaplayabilirim.'

function localAnswer(text, ctx) {
  if (GREETING.test(text)) return INTRO
  const L = []
  const done = ctx.items.filter((i) => i.status === 'done')
  const open = ctx.items.filter((i) => i.status !== 'done')
  if (ctx.topics.length) L.push(`**Konu:** ${ctx.topics.join(', ')}.`)
  if (done.length) {
    L.push('', '### Benzer geçmiş işler')
    for (const i of done.slice(0, 4))
      L.push(`- **${i.code}** ${i.title} — ${i.assignee ?? 'atanmamış'} ${i.resolved_in_days ?? '?'} günde çözdü.${i.resolution_note ? ` Çözüm: ${i.resolution_note}` : ''}`)
    const who = Object.entries(done.reduce((m, i) => ((m[i.assignee] = (m[i.assignee] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0]
    if (who) {
      const load = ctx.team.find((t) => t.username === who[0])
      L.push('', `**Öneri:** bu konuyu en çok ${who[0]} çözmüş (${who[1]} iş)${load ? `, şu an ${load.open_items} açık işi var` : ''}; atama için ilk aday.`)
      const avg = round1(done.reduce((s, i) => s + (i.resolved_in_days ?? 0), 0) / done.length)
      L.push(`Benzer işlerin ortalama çözüm süresi ${avg} gün.`)
    }
  }
  if (open.length) {
    L.push('', '### İlgili açık işler')
    for (const i of open.slice(0, 4)) L.push(`- **${i.code}** ${i.title} — ${i.requester} (${i.requester_level}), ${i.assignee ? `atanan ${i.assignee}` : 'atanmamış'}`)
  }
  if (ctx.wiki.length) L.push('', `**İlgili wiki:** ${ctx.wiki.map((w) => `${w.title} (${w.slug})`).join(', ')}`)
  if (!L.length) L.push('Bu soruyla eşleşen geçmiş iş ya da wiki sayfası bulamadım. Konuyu (ör. MQ, decom, pipeline failed) ya da iş kodunu (YVR-1033) yazarak tekrar dener misiniz?')
  return L.join('\n')
}

/** body: {message, thread_id?, history?: [{role, content}]} */
export async function askYaver(body = {}, user) {
  const text = String(body.message ?? '').trim()
  if (!text) throw httpError(400, 'invalid', 'Soru boş olamaz', { field: 'message' })
  if (text.length > 2000) throw httpError(400, 'invalid', 'Soru en fazla 2000 karakter', { field: 'message' })
  const started = Date.now()
  const ctx = await askContext(text)
  const sources = [
    ...ctx.items.slice(0, 5).map((i) => ({ type: 'db', id: i.id, ref: i.code, title: i.title, status: i.status })),
    ...ctx.wiki.map((w) => ({ type: 'wiki', id: w.id, ref: w.slug, title: w.title, url: w.url })),
  ]
  const cfg = await G.loadConfig()
  if (!cfg.enabled) {
    return { mode: 'yerel', answer: localAnswer(text, ctx), thread_id: null, sources, duration_ms: Date.now() - started, boot_id: BOOT_ID }
  }
  const msg = buildAskPrompt(text, ctx, body.history)
  let r
  try {
    r = await G.chatBlock(cfg, { msg, thread_id: String(body.thread_id ?? ''), request_context: { source: 'yaver-ai-sohbet', user: user?.username ?? null } })
  } catch (e) {
    throw httpError(502, 'genai_error', `GenAI Studio'ya ulaşılamadı: ${e.message}`)
  }
  if (!r.ok) throw httpError(502, 'genai_error', `GenAI Studio HTTP ${r.status}: ${r.text.slice(0, 300)}`)
  const ans = G.extractAnswer(r.text)
  // Model JSON döndürdüyse (Studio talimatı şemaya zorluyorsa) okunur metne çevrilir
  const answer = readableAnswer(ans.direct ? JSON.stringify(ans.direct) : ans.text)
  return { mode: 'genai', answer, thread_id: ans.thread_id ?? (body.thread_id || null), sources, duration_ms: Date.now() - started, boot_id: BOOT_ID }
}
