import { query, tx } from './db.js'
import { issueOnBehalfToken } from './auth.js'
import { AGENT_EXTRA_HEADERS, PUBLIC_URL, emit, publish } from './events.js'
import { httpError } from './state.js'

/**
 * Chat: kullanıcı ↔ LangGraph ajanı.
 *
 * İki çalışma modu (AGENT_CHAT_MODE):
 *   stream — Yaver, AGENT_CHAT_URL'e POST eder; ajan cevabı SSE (text/event-stream) ya da tek JSON olarak döner.
 *            Yaver parçaları arayüze /api/chat/sessions/:id/stream üzerinden aktarır, bitince mesajı kaydeder.
 *   event  — Yaver 'chat.message' olayı üretir (webhook/pull ile ajana gider). Ajan cevabını
 *            /api/agent/chat/messages/:id/chunks ve PUT /api/agent/chat/messages/:id ile geri yazar.
 * Konuşma hafızasını LangGraph tutar (thread_id = chat_session.agent_thread_id); Yaver geçmişi gösterim ve denetim içindir.
 */

const CHAT_URL = process.env.AGENT_CHAT_URL ?? ''
export const CHAT_MODE = process.env.AGENT_CHAT_MODE ?? (CHAT_URL ? 'stream' : 'event')
const CHAT_TIMEOUT_MS = Number(process.env.AGENT_CHAT_TIMEOUT_SEC ?? 180) * 1000
const HISTORY = Number(process.env.AGENT_CHAT_HISTORY ?? 20)

const pub = (session_id, type, data) => publish('chat', { session_id, type, ...data })

async function ownSession(id, user) {
  const s = (await query('SELECT * FROM chat_session WHERE id = $1', [id])).rows[0]
  if (!s) throw httpError(404, 'not_found', 'Sohbet bulunamadı')
  if (s.user_id !== user.id && user.role !== 'admin') throw httpError(404, 'not_found', 'Sohbet bulunamadı')
  return s
}

export async function createSession(user, b = {}) {
  const ctx = b.context && typeof b.context === 'object' ? b.context : {}
  const r = await query(
    `INSERT INTO chat_session (user_id, title, context_json) VALUES ($1, $2, $3) RETURNING *`,
    [user.id, String(b.title || 'Yeni sohbet').slice(0, 200), JSON.stringify(ctx)])
  const s = r.rows[0]
  const thread = `yaver-chat-${s.id}`
  await query('UPDATE chat_session SET agent_thread_id = $2 WHERE id = $1', [s.id, thread])
  return { ...s, agent_thread_id: thread }
}

export async function listSessions(user) {
  const { rows } = await query(
    `SELECT s.*, (SELECT content FROM chat_message m WHERE m.session_id = s.id ORDER BY id DESC LIMIT 1) AS last_message
     FROM chat_session s WHERE s.user_id = $1 ORDER BY s.updated_at DESC LIMIT 100`, [user.id])
  return { sessions: rows }
}

export async function getMessages(id, user) {
  const s = await ownSession(id, user)
  const { rows } = await query('SELECT * FROM chat_message WHERE session_id = $1 ORDER BY id', [id])
  return { session: s, messages: rows }
}

export async function deleteSession(id, user) {
  await ownSession(id, user)
  await query('DELETE FROM chat_session WHERE id = $1', [id])
}

/** Kullanıcı mesajı → asistan mesajı (pending) + agent_run; ajan çağrısı arka planda. */
export async function postMessage(id, user, text) {
  if (!String(text ?? '').trim()) throw httpError(400, 'invalid', 'Mesaj boş olamaz', { field: 'text' })
  const s = await ownSession(id, user)
  const out = await tx(async (c) => {
    const um = (await c.query(`INSERT INTO chat_message (session_id, role, content) VALUES ($1, 'user', $2) RETURNING *`, [id, text])).rows[0]
    const run = (await c.query(`INSERT INTO agent_run (graph, chat_session_id, thread_id) VALUES ('chat', $1, $2) RETURNING id`,
      [id, s.agent_thread_id])).rows[0]
    const am = (await c.query(`INSERT INTO chat_message (session_id, role, content, run_id, status) VALUES ($1, 'assistant', '', $2, 'pending') RETURNING *`,
      [id, run.id])).rows[0]
    await c.query(`UPDATE chat_session SET updated_at = now(), title = CASE WHEN title = 'Yeni sohbet' THEN left($2, 60) ELSE title END WHERE id = $1`, [id, text])
    if (CHAT_MODE === 'event') {
      await emit(c, 'chat.message', 'chat_session', id, {
        session_id: id, user_id: user.id, username: user.username, message_id: um.id, assistant_message_id: am.id,
        run_id: run.id, thread_id: s.agent_thread_id, text, context: s.context_json,
      }, user)
    }
    return { message: um, assistant_message: am, run_id: run.id }
  })
  pub(id, 'message', { message: out.message })
  pub(id, 'message', { message: out.assistant_message })
  if (CHAT_MODE === 'stream') runStream(s, user, out).catch((e) => console.error('[chat]', e.message))
  return { ...out, mode: CHAT_MODE }
}

async function finish(sessionId, messageId, runId, { content, tool_calls = null, status = 'done', error = null }) {
  const m = (await query(
    `UPDATE chat_message SET content = $2, tool_calls_json = $3, status = $4 WHERE id = $1 RETURNING *`,
    [messageId, content ?? '', tool_calls ? JSON.stringify(tool_calls) : null, status])).rows[0]
  if (runId) await query(`UPDATE agent_run SET status = $2, error = $3, finished_at = now() WHERE id = $1 AND status = 'running'`,
    [runId, status === 'error' ? 'failed' : 'succeeded', error])
  await query('UPDATE chat_session SET updated_at = now() WHERE id = $1', [sessionId])
  pub(sessionId, status === 'error' ? 'error' : 'done', { message: m, error })
  return m
}

/** SSE gövdesini olaylara ayırır: "event: x\ndata: {...}\n\n" */
async function* readSse(body) {
  const dec = new TextDecoder()
  let buf = ''
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      let event = 'message'
      const data = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (!data.length) continue
      let parsed = data.join('\n')
      try { parsed = JSON.parse(parsed) } catch { /* düz metin */ }
      yield { event, data: parsed }
    }
  }
}

async function runStream(s, user, { message, assistant_message: am, run_id }) {
  if (!CHAT_URL) return finish(s.id, am.id, run_id, { content: 'Ajan yapılandırılmamış (AGENT_CHAT_URL boş).', status: 'error', error: 'AGENT_CHAT_URL boş' })
  const hist = (await query(
    `SELECT role, content FROM chat_message WHERE session_id = $1 AND id < $2 AND status = 'done' AND role IN ('user','assistant')
     ORDER BY id DESC LIMIT $3`, [s.id, message.id, HISTORY])).rows.reverse()
  const u = (await query('SELECT username, full_name, email, role FROM app_user WHERE id = $1', [user.id])).rows[0]
  const body = {
    session_id: s.id, thread_id: s.agent_thread_id, run_id, assistant_message_id: am.id,
    message: { id: message.id, text: message.content }, history: hist, context: s.context_json, user: u,
    yaver: { base_url: PUBLIC_URL, token: await issueOnBehalfToken(user.id) },
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS)
  let content = ''
  const tools = []
  try {
    await query(`UPDATE chat_message SET status = 'streaming' WHERE id = $1`, [am.id])
    const res = await fetch(CHAT_URL, {
      method: 'POST', signal: ctrl.signal, body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', ...AGENT_EXTRA_HEADERS },
    })
    if (!res.ok) throw new Error(`Ajan HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
    if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const j = await res.json()
      return finish(s.id, am.id, run_id, { content: j.content ?? j.output ?? '', tool_calls: j.tool_calls ?? null })
    }
    for await (const { event, data } of readSse(res.body)) {
      if (event === 'token') {
        const t = typeof data === 'string' ? data : (data.text ?? '')
        content += t
        pub(s.id, 'token', { message_id: am.id, text: t })
      } else if (event === 'tool_call' || event === 'tool_result') {
        tools.push({ type: event, ...(typeof data === 'object' ? data : { data }) })
        pub(s.id, event, { message_id: am.id, data })
      } else if (event === 'done') {
        if (data && typeof data === 'object' && typeof data.content === 'string') content = data.content
        return finish(s.id, am.id, run_id, { content, tool_calls: tools.length ? tools : null })
      } else if (event === 'error') {
        throw new Error(typeof data === 'string' ? data : (data.message ?? 'Ajan hata döndü'))
      }
    }
    return finish(s.id, am.id, run_id, { content, tool_calls: tools.length ? tools : null })
  } catch (e) {
    const msg = e.name === 'AbortError' ? `Ajan ${CHAT_TIMEOUT_MS / 1000} sn içinde cevap vermedi` : e.message
    return finish(s.id, am.id, run_id, { content: content || `Ajan cevap veremedi: ${msg}`, status: 'error', error: msg, tool_calls: tools.length ? tools : null })
  } finally {
    clearTimeout(timer)
  }
}

// ---------- event modu: ajanın geri yazdığı uçlar ----------
async function agentMessage(id, actor) {
  const m = (await query(
    `SELECT m.*, s.user_id FROM chat_message m JOIN chat_session s ON s.id = m.session_id WHERE m.id = $1`, [id])).rows[0]
  if (!m || m.role !== 'assistant') throw httpError(404, 'not_found', 'Asistan mesajı bulunamadı')
  if (actor.kind === 'obo' && actor.onBehalfOf.id !== m.user_id) throw httpError(403, 'forbidden', 'Bu sohbet başka kullanıcıya ait')
  if (m.status === 'done' || m.status === 'error') throw httpError(409, 'conflict', 'Mesaj zaten tamamlanmış')
  return m
}

/** Akış parçası: {type: 'token', text} | {type: 'tool_call' | 'tool_result', data} */
export async function pushChunk(id, b, actor) {
  const m = await agentMessage(id, actor)
  const type = b.type ?? 'token'
  if (!['token', 'tool_call', 'tool_result'].includes(type)) throw httpError(400, 'invalid', 'type: token | tool_call | tool_result')
  if (m.status === 'pending') await query(`UPDATE chat_message SET status = 'streaming' WHERE id = $1`, [id])
  if (type === 'token') pub(m.session_id, 'token', { message_id: id, text: String(b.text ?? '') })
  else pub(m.session_id, type, { message_id: id, data: b.data ?? null })
  return { ok: true }
}

/** Son cevap: {content, tool_calls?, status?: 'done' | 'error', error?} */
export async function completeMessage(id, b, actor) {
  const m = await agentMessage(id, actor)
  const status = b.status === 'error' ? 'error' : 'done'
  return finish(m.session_id, id, m.run_id, { content: String(b.content ?? ''), tool_calls: b.tool_calls ?? null, status, error: b.error ?? null })
}

export { ownSession }
