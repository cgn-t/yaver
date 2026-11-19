import crypto from 'node:crypto'
import { listen, query } from './db.js'
import { issueOnBehalfToken } from './auth.js'

/**
 * Olay kutusu (outbox) ve canlı yayın.
 *
 * - emit(): DB'yi değiştiren işlem, AYNI transaction içinde agent_event satırı ekler ve pg_notify atar.
 *   Transaction geri alınırsa olay da yok olur; commit olursa bildirim o anda çıkar.
 * - LISTEN: bildirimi alan her replika (a) arayüzün SSE akışına yayınlar, (b) dağıtıcıyı uyandırır.
 * - Dağıtıcı (webhook modu): bekleyen olayları ajan ucuna HMAC imzalı POST eder, başarısızsa üstel geri çekilmeyle dener.
 * - Çekme modu: ajan GET /api/agent/events ile olayları kiralar, POST …/ack ile kapatır.
 */

const ENABLED = process.env.AGENT_ENABLED !== 'false'
export const DELIVERY = process.env.AGENT_DELIVERY ?? (process.env.AGENT_WEBHOOK_URL ? 'webhook' : 'pull')   // webhook | pull
const WEBHOOK_URL = process.env.AGENT_WEBHOOK_URL ?? ''
const WEBHOOK_FORMAT = process.env.AGENT_WEBHOOK_FORMAT ?? 'plain'           // plain | langgraph
const WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET ?? ''
const ASSISTANT_ID = process.env.AGENT_ASSISTANT_ID ?? 'yaver'
const MAX_ATTEMPTS = Number(process.env.AGENT_MAX_ATTEMPTS ?? 10)
const CONCURRENCY = Number(process.env.AGENT_MAX_CONCURRENCY ?? 4)
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_SEC ?? 15) * 1000
const LEASE_SEC = Number(process.env.AGENT_LEASE_SEC ?? 300)
const INCLUDE_OWN = process.env.AGENT_INCLUDE_OWN_EVENTS === 'true'
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8080}`).replace(/\/$/, '')

/** Ajana gönderilen olay tipleri. Diğerleri (ör. work_item.updated) yalnız arayüze yayınlanır. */
export const AGENT_EVENT_TYPES = new Set((process.env.AGENT_EVENT_TYPES ??
  'email.received,meeting.created,work_item.created,work_item.commented,agent_action.decided,chat.message')
  .split(',').map((s) => s.trim()).filter(Boolean))

export let AGENT_EXTRA_HEADERS = {}
try { AGENT_EXTRA_HEADERS = JSON.parse(process.env.AGENT_WEBHOOK_HEADERS || '{}') } catch { console.warn('[agent] AGENT_WEBHOOK_HEADERS geçerli JSON değil') }

/**
 * @param c   transaction istemcisi (tx içinden) — yoksa havuz kullanılır
 * @param actor req.user benzeri { id, role } veya null (sistem / poller)
 */
export async function emit(c, type, entity, entityId, payload = {}, actor = null) {
  const toAgent = ENABLED && AGENT_EVENT_TYPES.has(type) && (INCLUDE_OWN || actor?.role !== 'agent' || type === 'agent_action.decided')
  const db = c ?? { query }
  const r = await db.query(
    `INSERT INTO agent_event (type, entity, entity_id, payload, actor_id, actor_role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [type, entity, entityId, JSON.stringify(payload), actor?.id ?? null, actor?.role ?? (actor ? null : 'system'), toAgent ? 'pending' : 'skipped'])
  const note = JSON.stringify({ id: r.rows[0].id, type, entity, entity_id: entityId, actor: actor?.username ?? null,
    on_behalf_of: actor?.onBehalfOf?.username ?? null, at: r.rows[0].created_at, agent: toAgent })
  await db.query('SELECT pg_notify($1, $2)', ['yaver_events', note.length < 7900 ? note : JSON.stringify({ id: r.rows[0].id, type })])
  return r.rows[0].id
}

// ---------- Canlı yayın (SSE) ----------
const subscribers = new Set()

/** SSE bağlantısı açar; filter(evt) true dönen olaylar yazılır. Kapatma fonksiyonu döner. */
export function openSse(req, res, filter = () => true) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.write('retry: 3000\n\n')
  const sub = { filter, send: (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
  subscribers.add(sub)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  const close = () => { clearInterval(ping); subscribers.delete(sub) }
  req.on('close', close)
  return sub
}

/** Pod içi yayın (DB'ye yazılmayan anlık veriler: chat token akışı gibi). */
export function publish(event, data) {
  for (const s of subscribers) if (s.filter(event, data)) s.send(event, data)
}

let wake = () => {}
export function startEventListener() {
  return listen('yaver_events', (payload) => {
    let evt
    try { evt = JSON.parse(payload) } catch { return }
    publish('change', evt)
    if (evt.agent !== false) wake()
  })
}

// ---------- Olayın ajana giden hâli ----------
/** Olayı ajana gidecek şekle getirir. chat.message için kullanıcı adına kısa ömürlü token eklenir (DB'de saklanmaz). */
export async function toEnvelope(row) {
  const env = {
    id: row.id, type: row.type, entity: row.entity, entity_id: row.entity_id, payload: row.payload,
    actor_id: row.actor_id, actor_role: row.actor_role, attempts: row.attempts, occurred_at: row.created_at,
    yaver: { base_url: PUBLIC_URL },
  }
  if (row.type === 'chat.message' && row.payload?.user_id) {
    env.yaver.on_behalf_token = await issueOnBehalfToken(row.payload.user_id)
  }
  return env
}

const backoffSec = (attempts) => Math.min(3600, 5 * 2 ** Math.max(0, attempts - 1))

/** Teslim başarısız: tekrar planla ya da vazgeç. */
export async function failEvent(id, attempts, error) {
  const failed = attempts >= MAX_ATTEMPTS
  await query(
    `UPDATE agent_event SET status = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4) WHERE id = $1`,
    [id, failed ? 'failed' : 'pending', String(error).slice(0, 1000), backoffSec(attempts)])
}

/** Bekleyen olayları kiralar (aynı olayı iki işçi almaz). attempts burada artar. */
export async function claimEvents(limit, types = null) {
  const { rows } = await query(
    `UPDATE agent_event SET attempts = attempts + 1, next_attempt_at = now() + make_interval(secs => $2)
     WHERE id IN (SELECT id FROM agent_event
                  WHERE status = 'pending' AND next_attempt_at <= now() AND ($3::text[] IS NULL OR type = ANY($3))
                  ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`, [limit, LEASE_SEC, types])
  return rows.sort((a, b) => a.id - b.id)
}

// ---------- Webhook dağıtıcı ----------
function signBody(body, ts) {
  return 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex')
}

async function deliver(row) {
  const env = await toEnvelope(row)
  const url = WEBHOOK_FORMAT === 'langgraph' ? `${WEBHOOK_URL.replace(/\/$/, '')}/runs` : WEBHOOK_URL
  // LangGraph Server (Agent Server) arka plan run'ı: POST /runs {assistant_id, input}
  const body = JSON.stringify(WEBHOOK_FORMAT === 'langgraph'
    ? { assistant_id: ASSISTANT_ID, input: { event: env }, metadata: { yaver_event_id: row.id }, multitask_strategy: 'enqueue' }
    : env)
  const ts = Math.floor(Date.now() / 1000).toString()
  const headers = { 'Content-Type': 'application/json', 'X-Yaver-Event': row.type, 'X-Yaver-Delivery': String(row.id),
    'X-Yaver-Timestamp': ts, ...AGENT_EXTRA_HEADERS }
  if (WEBHOOK_SECRET) headers['X-Yaver-Signature'] = signBody(body, ts)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal })
    const text = await res.text().catch(() => '')
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`)
    await query(`UPDATE agent_event SET status = 'sent', delivered_at = now(), last_error = NULL WHERE id = $1 AND status = 'pending'`, [row.id])
  } catch (e) {
    await failEvent(row.id, row.attempts, e.name === 'AbortError' ? `Zaman aşımı (${TIMEOUT_MS / 1000} sn)` : e.message)
  } finally {
    clearTimeout(timer)
  }
}

export function startDispatcher() {
  if (!ENABLED) { console.log('[agent] AGENT_ENABLED=false — olaylar ajana gönderilmez'); return }
  if (DELIVERY !== 'webhook') { console.log('[agent] teslim modu: pull (ajan GET /api/agent/events ile çeker)'); return }
  if (!WEBHOOK_URL) { console.warn('[agent] AGENT_DELIVERY=webhook ama AGENT_WEBHOOK_URL boş'); return }
  let running = false
  let again = false
  const run = async () => {
    if (running) { again = true; return }
    running = true
    try {
      do {
        again = false
        const rows = await claimEvents(CONCURRENCY)
        await Promise.all(rows.map((r) => deliver(r).catch((e) => console.error('[agent] teslim', r.id, e.message))))
        if (rows.length === CONCURRENCY) again = true
      } while (again)
    } catch (e) {
      console.error('[agent] dağıtıcı', e.message)
    } finally {
      running = false
    }
  }
  wake = () => { run() }
  setInterval(run, 5000)          // tekrar denemeler ve kaçan bildirimler için
  run()
  console.log(`[agent] webhook dağıtıcı başladı → ${WEBHOOK_URL} (${WEBHOOK_FORMAT})`)
}

/** Günlük temizlik: teslim edilmiş eski olaylar ve eski idempotency anahtarları. */
export function startEventCleanup() {
  const days = Number(process.env.AGENT_EVENT_RETENTION_DAYS ?? 30)
  const run = () => Promise.all([
    query(`DELETE FROM agent_event WHERE status IN ('sent','acked','skipped') AND created_at < now() - make_interval(days => $1)`, [days]),
    query(`DELETE FROM idempotency_key WHERE created_at < now() - interval '24 hours'`),
  ]).catch(() => {})
  run()
  setInterval(run, 6 * 3600_000)
}
