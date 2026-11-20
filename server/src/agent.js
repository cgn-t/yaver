import { query, tx } from './db.js'
import { emit } from './events.js'
import { ITEM_SQL, activity, addComment, createWorkItem, httpError, toItem, updateWorkItem } from './state.js'

/**
 * Ajan entegrasyonu servis katmanı: okuma sorguları, öneri/onay politikası, çalışma kayıtları.
 * Rotalar (routes.js) yalnız bu fonksiyonları çağırır; arayüz ve ajan aynı kod yolundan geçer.
 */

export const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled']
export const PRIORITIES = ['low', 'normal', 'high', 'critical']
export const TRIAGE = ['pending', 'processing', 'done', 'ignored', 'failed']
export const ACTION_KINDS = ['create', 'status', 'priority', 'assign', 'due_date', 'category', 'tags', 'edit', 'link']

const clampLimit = (v, d = 50, max = 200) => Math.min(max, Math.max(1, Number(v) || d))
const list = (v) => (v === undefined || v === '' ? null : String(v).split(',').map((s) => s.trim()).filter(Boolean))
const isDate = (v) => v === null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(v))

// =====================================================================
// Politika: ajan hangi değişikliği doğrudan yapabilir, hangisini öneri olarak bırakır
// =====================================================================
export const DEFAULT_POLICY = {
  create: 'auto', link: 'auto', category: 'auto', tags: 'auto',
  priority: 'propose', assign: 'propose', due_date: 'propose', status: 'propose', edit: 'propose',
}
const POLICY_VALUES = ['auto', 'propose', 'deny']

export async function getAgentSettings() {
  const { rows } = await query(`SELECT key, value FROM app_setting WHERE category = 'agent'`)
  const o = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const policy = Object.fromEntries(ACTION_KINDS.map((k) => [k, POLICY_VALUES.includes(o[`policy_${k}`]) ? o[`policy_${k}`] : DEFAULT_POLICY[k]]))
  return { policy, chat_direct_apply: o.chat_direct_apply !== 'false' }
}

export async function saveAgentSettings(body, actor) {
  await tx(async (c) => {
    const put = (k, v) => c.query(
      `INSERT INTO app_setting (category, key, value, updated_by, updated_at) VALUES ('agent', $1, $2, $3, now())
       ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [k, v, actor.id])
    for (const [k, v] of Object.entries(body.policy ?? {})) {
      if (!ACTION_KINDS.includes(k) || !POLICY_VALUES.includes(v)) throw httpError(400, 'invalid', `Geçersiz politika: ${k}=${v}`)
      await put(`policy_${k}`, v)
    }
    if (body.chat_direct_apply !== undefined) await put('chat_direct_apply', String(!!body.chat_direct_apply))
    await c.query(`INSERT INTO audit_log (actor_id, entity, entity_id, action, diff_json) VALUES ($1, 'app_setting', 'agent', 'update', $2)`,
      [actor.id, JSON.stringify(body)])
  })
  return getAgentSettings()
}

/** PATCH alanı → politika türü */
const FIELD_KIND = { status: 'status', priority: 'priority', assignee: 'assign', due_date: 'due_date', category: 'category',
  tags: 'tags', title: 'edit', description: 'edit', requester: 'edit', resolution: 'status' }

/** Bu aktör bu türleri doğrudan uygulayabilir mi? Ekrandaki kullanıcı için her zaman evet. */
export async function directKindsAllowed(actor, kinds) {
  if (actor.role !== 'agent') return { ok: true }
  const s = await getAgentSettings()
  if (actor.kind === 'obo' && s.chat_direct_apply) {
    const denied = kinds.filter((k) => s.policy[k] === 'deny')
    return denied.length ? { ok: false, denied } : { ok: true }
  }
  const blocked = kinds.filter((k) => s.policy[k] !== 'auto')
  return blocked.length ? { ok: false, blocked, denied: blocked.filter((k) => s.policy[k] === 'deny') } : { ok: true }
}

export async function assertDirect(actor, kinds) {
  const r = await directKindsAllowed(actor, kinds)
  if (r.ok) return
  if (r.denied?.length) throw httpError(403, 'forbidden', `Ajan bu değişikliği yapamaz: ${r.denied.join(', ')}`, { kinds: r.denied })
  throw httpError(403, 'proposal_required',
    `Bu değişiklik onay gerektirir; POST /api/agent/actions ile öneri olarak gönderin (${r.blocked.join(', ')})`, { kinds: r.blocked })
}

export const patchKinds = (patch) => [...new Set(Object.keys(patch).filter((k) => FIELD_KIND[k]).map((k) => FIELD_KIND[k]))]

// =====================================================================
// Doğrulama
// =====================================================================
export const SOURCE_TYPES = ['mail', 'zoom', 'tfs', 'jira', 'manual', 'api']
export function validateItemPatch(p, { create = false } = {}) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw httpError(400, 'invalid', 'Gövde nesne olmalı')
  if (create && !String(p.title ?? '').trim()) throw httpError(400, 'invalid', 'Başlık zorunlu', { field: 'title' })
  if (p.title !== undefined && (!String(p.title).trim() || String(p.title).length > 500)) throw httpError(400, 'invalid', 'Başlık 1-500 karakter olmalı', { field: 'title' })
  if (p.status !== undefined && !STATUSES.includes(p.status)) throw httpError(400, 'invalid', `status: ${STATUSES.join(' | ')}`, { field: 'status' })
  if (p.priority !== undefined && !PRIORITIES.includes(p.priority)) throw httpError(400, 'invalid', `priority: ${PRIORITIES.join(' | ')}`, { field: 'priority' })
  if (p.due_date !== undefined && !isDate(p.due_date)) throw httpError(400, 'invalid', 'due_date YYYY-AA-GG olmalı', { field: 'due_date' })
  if (p.tags !== undefined && (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== 'string' || t.length > 100)))
    throw httpError(400, 'invalid', 'tags metin dizisi olmalı', { field: 'tags' })
  if (p.resolution !== undefined && (typeof p.resolution !== 'string' || p.resolution.length > 4000))
    throw httpError(400, 'invalid', 'resolution en fazla 4000 karakterlik metin olmalı', { field: 'resolution' })
  if (p.source_type !== undefined && !SOURCE_TYPES.includes(p.source_type))
    throw httpError(400, 'invalid', `source_type: ${SOURCE_TYPES.join(' | ')}`, { field: 'source_type' })
  if (p.assignee) return assertUser(p.assignee)
}

async function assertUser(username) {
  const { rows } = await query(`SELECT 1 FROM app_user WHERE username = $1 AND is_active AND role <> 'agent'`, [username])
  if (!rows[0]) throw httpError(400, 'invalid', `Atanabilir kullanıcı değil: ${username}`, { field: 'assignee' })
}

// =====================================================================
// Okuma
// =====================================================================
export async function listWorkItems(q) {
  const where = []
  const vals = []
  const add = (sql, v) => { vals.push(v); where.push(sql.replaceAll('$?', `$${vals.length}`)) }
  if (list(q.status)) add('w.status = ANY($?)', list(q.status))
  if (list(q.priority)) add('w.priority = ANY($?)', list(q.priority))
  if (list(q.source_type)) add('w.source_type = ANY($?)', list(q.source_type))
  if (q.assignee === 'none') where.push('w.assignee_id IS NULL')
  else if (q.assignee) add('u.username = $?', q.assignee)
  if (q.category) add('w.category = $?', q.category)
  if (q.tag) add('EXISTS (SELECT 1 FROM work_item_tag t WHERE t.work_item_id = w.id AND t.tag = $?)', q.tag)
  if (q.updated_since) add('w.updated_at > $?::timestamptz', q.updated_since)
  if (q.created_since) add('w.created_at > $?::timestamptz', q.created_since)
  if (q.due_before) add('w.due_date <= $?::date', q.due_before)
  if (q.open === 'true') where.push(`w.status NOT IN ('done','cancelled')`)
  if (q.q) add(`(w.title ILIKE $? OR w.description ILIKE $? OR w.code ILIKE $?)`, `%${q.q}%`)
  const limit = clampLimit(q.limit)
  const offset = Math.max(0, Number(q.offset) || 0)
  const order = { updated: 'w.updated_at DESC', created: 'w.created_at DESC', due: 'w.due_date ASC NULLS LAST', priority:
    `array_position(ARRAY['critical','high','normal','low']::varchar[], w.priority), w.created_at DESC` }[q.sort] ?? 'w.created_at DESC'
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [rows, total] = await Promise.all([
    query(`${ITEM_SQL} ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, vals),
    query(`SELECT count(*)::int AS n FROM work_item w LEFT JOIN app_user u ON u.id = w.assignee_id ${w}`, vals),
  ])
  const n = total.rows[0].n
  return { items: rows.rows.map(toItem), total: n, next_offset: offset + limit < n ? offset + limit : null }
}

export async function getWorkItem(id) {
  const item = (await query(`${ITEM_SQL} WHERE w.id = $1`, [id])).rows.map(toItem)[0]
  if (!item) return null
  const [acts, emails, meetings, actions] = await Promise.all([
    query(`SELECT a.id, a.created_at AS at, coalesce(u.username, 'sistem') AS actor, ob.username AS on_behalf_of, a.action,
                  a.old_value, a.new_value, coalesce(a.comment, '') AS text, a.agent_run_id
           FROM work_item_activity a LEFT JOIN app_user u ON u.id = a.actor_id LEFT JOIN app_user ob ON ob.id = a.on_behalf_of
           WHERE a.work_item_id = $1 ORDER BY a.id`, [id]),
    query(`SELECT id, from_address, from_name, subject, body_preview, received_at, triage_status FROM email
           WHERE work_item_id = $1 OR ($2 = 'mail' AND id = $3) ORDER BY received_at`, [id, item.source_type, item.source_id]),
    query(`SELECT id, topic, start_time, duration_min, status FROM meeting
           WHERE work_item_id = $1 OR ($2 = 'zoom' AND id = $3) ORDER BY start_time`, [id, item.source_type, item.source_id]),
    query(`SELECT * FROM agent_action WHERE work_item_id = $1 ORDER BY id DESC LIMIT 50`, [id]),
  ])
  return { ...item, activities: acts.rows, emails: emails.rows, meetings: meetings.rows, agent_actions: actions.rows.map(toAction) }
}

export async function listEmails(q) {
  const where = []
  const vals = []
  const add = (sql, v) => { vals.push(v); where.push(sql.replaceAll('$?', `$${vals.length}`)) }
  if (list(q.triage_status)) add('triage_status = ANY($?)', list(q.triage_status))
  if (q.linked === 'false') where.push('work_item_id IS NULL')
  if (q.linked === 'true') where.push('work_item_id IS NOT NULL')
  if (q.is_read !== undefined) add('is_read = $?', q.is_read === 'true')
  if (q.since) add('received_at > $?::timestamptz', q.since)
  if (q.thread_id) add('thread_id = $?', q.thread_id)
  if (q.from) add('from_address ILIKE $?', `%${q.from}%`)
  if (q.q) add('(subject ILIKE $? OR body_preview ILIKE $? OR from_name ILIKE $?)', `%${q.q}%`)
  const limit = clampLimit(q.limit)
  const offset = Math.max(0, Number(q.offset) || 0)
  const { rows } = await query(
    `SELECT id, message_id, thread_id, mailbox, from_address, coalesce(from_name, from_address) AS from_name, subject, body_preview,
            importance, has_attachments, received_at, is_read, work_item_id, triage_status
     FROM email ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY received_at DESC LIMIT ${limit + 1} OFFSET ${offset}`, vals)
  return { emails: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null }
}

export async function getEmail(id) {
  const e = (await query(
    `SELECT id, message_id, thread_id, mailbox, from_address, coalesce(from_name, from_address) AS from_name, to_addresses, cc_addresses,
            coalesce(subject, '') AS subject, coalesce(body_preview, '') AS body_preview, coalesce(body_text, body_preview, '') AS body_text,
            body_html, importance, has_attachments, received_at, is_read, work_item_id, triage_status, ingested_at
     FROM email WHERE id = $1`, [id])).rows[0]
  if (!e) return null
  const [att, thread, item] = await Promise.all([
    query('SELECT id, file_name, content_type, size_bytes FROM email_attachment WHERE email_id = $1 ORDER BY id', [id]),
    e.thread_id
      ? query(`SELECT id, from_address, subject, received_at, work_item_id FROM email WHERE thread_id = $1 AND id <> $2 ORDER BY received_at`, [e.thread_id, id])
      : { rows: [] },
    e.work_item_id ? query(`SELECT id, code, title, status FROM work_item WHERE id = $1`, [e.work_item_id]) : { rows: [] },
  ])
  return { ...e, attachments: att.rows, thread: thread.rows, work_item: item.rows[0] ?? null }
}

export async function patchEmail(id, p, actor) {
  if (p.triage_status !== undefined && !TRIAGE.includes(p.triage_status))
    throw httpError(400, 'invalid', `triage_status: ${TRIAGE.join(' | ')}`, { field: 'triage_status' })
  const sets = []
  const vals = []
  if (p.is_read !== undefined) { vals.push(!!p.is_read); sets.push(`is_read = $${vals.length}`) }
  if (p.triage_status !== undefined) { vals.push(p.triage_status); sets.push(`triage_status = $${vals.length}`) }
  if (sets.length) {
    vals.push(id)
    const r = await query(`UPDATE email SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
    if (!r.rowCount) return null
  }
  if (p.work_item_id) await linkToWorkItem(Number(p.work_item_id), { email_id: id }, actor)
  return getEmail(id)
}

export async function listMeetings(q) {
  const where = []
  const vals = []
  const add = (sql, v) => { vals.push(v); where.push(sql.replaceAll('$?', `$${vals.length}`)) }
  if (q.from) add('start_time >= $?::timestamptz', q.from)
  if (q.to) add('start_time < $?::timestamptz', q.to)
  if (list(q.status)) add('status = ANY($?)', list(q.status))
  if (q.linked === 'false') where.push('work_item_id IS NULL')
  const limit = clampLimit(q.limit)
  const { rows } = await query(
    `SELECT id, zoom_meeting_id, topic, coalesce(agenda, '') AS agenda, host_email, host_name, start_time, duration_min, status,
            recording_url, notes, work_item_id
     FROM meeting ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY start_time LIMIT ${limit}`, vals)
  return { meetings: rows }
}

export async function getMeeting(id) {
  const m = (await query(`SELECT * FROM meeting WHERE id = $1`, [id])).rows[0]
  if (!m) return null
  const p = await query(`SELECT name, email, join_time, leave_time, attended FROM meeting_participant WHERE meeting_id = $1 ORDER BY id`, [id])
  return { ...m, participants: p.rows }
}

export async function patchMeeting(id, p, actor) {
  if (p.status !== undefined && !['scheduled', 'live', 'ended', 'cancelled'].includes(p.status))
    throw httpError(400, 'invalid', 'status: scheduled | live | ended | cancelled', { field: 'status' })
  const allowed = ['notes', 'status', 'recording_url', 'agenda']
  const keys = allowed.filter((k) => p[k] !== undefined)
  if (keys.length) {
    const r = await query(`UPDATE meeting SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => p[k]), id])
    if (!r.rowCount) return null
    if (p.status === 'ended') await emit(null, 'meeting.ended', 'meeting', id, {}, actor)
  }
  if (p.work_item_id) await linkToWorkItem(Number(p.work_item_id), { meeting_id: id }, actor)
  return getMeeting(id)
}

export async function listUsers() {
  const { rows } = await query(
    `SELECT u.username, coalesce(u.full_name, u.username) AS full_name, coalesce(u.email, '') AS email, u.role, u.team_group,
            (SELECT count(*)::int FROM work_item w WHERE w.assignee_id = u.id AND w.status NOT IN ('done','cancelled')) AS open_items
     FROM app_user u WHERE u.is_active AND u.role <> 'agent' ORDER BY u.username`)
  return { users: rows }
}

export async function search(q, types, limit) {
  const like = `%${q}%`
  const n = clampLimit(limit, 10, 50)
  const want = (t) => !types || types.includes(t)
  const [items, emails, meetings] = await Promise.all([
    want('work_item') ? query(`SELECT id, code, title, status, priority FROM work_item
                               WHERE title ILIKE $1 OR description ILIKE $1 OR code ILIKE $1 ORDER BY updated_at DESC LIMIT ${n}`, [like]) : { rows: [] },
    want('email') ? query(`SELECT id, subject, from_address, received_at, work_item_id FROM email
                           WHERE subject ILIKE $1 OR body_preview ILIKE $1 OR body_text ILIKE $1 OR from_address ILIKE $1 OR from_name ILIKE $1
                           ORDER BY received_at DESC LIMIT ${n}`, [like]) : { rows: [] },
    want('meeting') ? query(`SELECT id, topic, start_time, work_item_id FROM meeting
                             WHERE topic ILIKE $1 OR agenda ILIKE $1 OR notes ILIKE $1 ORDER BY start_time DESC LIMIT ${n}`, [like]) : { rows: [] },
  ])
  return { work_items: items.rows, emails: emails.rows, meetings: meetings.rows }
}

// =====================================================================
// Bağlama: mail / toplantı → iş
// =====================================================================
export async function linkToWorkItem(itemId, { email_id, meeting_id }, actor) {
  if (!email_id && !meeting_id) throw httpError(400, 'invalid', 'email_id veya meeting_id gerekli')
  return tx(async (c) => {
    const item = (await c.query('SELECT code FROM work_item WHERE id = $1 FOR UPDATE', [itemId])).rows[0]
    if (!item) throw httpError(404, 'not_found', 'İş bulunamadı')
    const linked = []
    if (email_id) {
      const r = await c.query('UPDATE email SET work_item_id = $1 WHERE id = $2 RETURNING subject', [itemId, email_id])
      if (!r.rowCount) throw httpError(404, 'not_found', 'Mail bulunamadı')
      linked.push(`mail: ${r.rows[0].subject ?? email_id}`)
    }
    if (meeting_id) {
      const r = await c.query('UPDATE meeting SET work_item_id = $1 WHERE id = $2 RETURNING topic', [itemId, meeting_id])
      if (!r.rowCount) throw httpError(404, 'not_found', 'Toplantı bulunamadı')
      linked.push(`toplantı: ${r.rows[0].topic}`)
    }
    await activity(c, itemId, actor, 'linked', `Bağlandı — ${linked.join(', ')}`)
    await c.query('UPDATE work_item SET updated_at = now(), version = version + 1 WHERE id = $1', [itemId])
    await emit(c, 'work_item.updated', 'work_item', itemId, { code: item.code, changes: { linked: [null, { email_id, meeting_id }] } }, actor)
    return { ok: true, work_item_id: itemId, email_id: email_id ?? null, meeting_id: meeting_id ?? null }
  })
}

// =====================================================================
// Öneriler (agent_action)
// =====================================================================
const toAction = (r) => ({ ...r, confidence: r.confidence === null ? null : Number(r.confidence) })

/** Öneri yükünü doğrular ve updateWorkItem'a gidecek yamaya çevirir. */
async function actionToPatch(kind, payload) {
  const pick = { status: ['status', 'resolution'], priority: ['priority'], assign: ['assignee'], due_date: ['due_date'], category: ['category'],
    tags: ['tags'], edit: ['title', 'description', 'requester'] }[kind]
  const patch = Object.fromEntries(pick.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]))
  if (!Object.keys(patch).length) throw httpError(400, 'invalid', `payload içinde ${pick.join(' / ')} bekleniyor`, { field: 'payload' })
  await validateItemPatch(patch)
  return patch
}

async function validateAction(a) {
  if (!ACTION_KINDS.includes(a.kind)) throw httpError(400, 'invalid', `kind: ${ACTION_KINDS.join(' | ')}`, { field: 'kind' })
  const p = a.payload ?? {}
  if (typeof p !== 'object' || Array.isArray(p)) throw httpError(400, 'invalid', 'payload nesne olmalı', { field: 'payload' })
  if (a.confidence !== undefined && a.confidence !== null && !(Number(a.confidence) >= 0 && Number(a.confidence) <= 1))
    throw httpError(400, 'invalid', 'confidence 0-1 arası olmalı', { field: 'confidence' })
  if (a.kind === 'create') {
    await validateItemPatch(p, { create: true })
  } else {
    if (!a.work_item_id) throw httpError(400, 'invalid', 'work_item_id zorunlu', { field: 'work_item_id' })
    const ok = await query('SELECT 1 FROM work_item WHERE id = $1', [a.work_item_id])
    if (!ok.rows[0]) throw httpError(404, 'not_found', 'İş bulunamadı')
    if (a.kind === 'link') { if (!p.email_id && !p.meeting_id) throw httpError(400, 'invalid', 'payload.email_id veya payload.meeting_id gerekli') }
    else await actionToPatch(a.kind, p)
  }
}

/** Öneriyi uygular. actor = onaylayan kullanıcı ya da (auto politikada) ajan. */
async function applyAction(a, actor) {
  const p = a.payload ?? {}
  if (a.kind === 'create') {
    const src = a.email_id ? { source_type: 'mail', source_id: a.email_id } : a.meeting_id ? { source_type: 'zoom', source_id: a.meeting_id } : {}
    const item = await createWorkItem({ source_type: 'manual', ...p, ...src }, actor)
    return { work_item: item }
  }
  if (a.kind === 'link') return linkToWorkItem(a.work_item_id, p, actor)
  const patch = await actionToPatch(a.kind, p)
  // Ajanın "Tamamlandı" önerisi onaylanırken çözüm yazılmadıysa ajanın gerekçesi çözüm açıklaması olur
  if (patch.status === 'done' && !String(patch.resolution ?? '').trim())
    patch.resolution = a.reasoning ? `Ajan önerisi (onaylandı): ${a.reasoning}` : 'Ajan önerisi onaylandı.'
  const item = await updateWorkItem(a.work_item_id, patch, actor)
  if (!item) throw httpError(404, 'not_found', 'İş bulunamadı')
  return { work_item: item }
}

const KIND_LABEL = { create: 'iş oluştur', status: 'durum', priority: 'öncelik', assign: 'atama', due_date: 'son tarih',
  category: 'kategori', tags: 'etiketler', edit: 'düzenleme', link: 'bağlama' }
const describe = (kind, p) => `${KIND_LABEL[kind]}: ${kind === 'create' ? p.title : JSON.stringify(p)}`.slice(0, 300)

/**
 * Ajan önerisi. Politika:
 *   auto    → hemen uygulanır (status=applied)
 *   propose → bekler (status=pending), arayüzde onay/ret
 *   deny    → 403
 */
export async function proposeAction(body, actor) {
  const a = {
    kind: body.kind, payload: body.payload ?? {}, work_item_id: body.work_item_id ? Number(body.work_item_id) : null,
    email_id: body.email_id ? Number(body.email_id) : null, meeting_id: body.meeting_id ? Number(body.meeting_id) : null,
    confidence: body.confidence ?? null, reasoning: body.reasoning ?? null,
    run_id: Number(body.run_id) || actor.runId || null,
  }
  await validateAction(a)
  const { policy } = await getAgentSettings()
  const mode = body.force_proposal ? 'propose' : (actor.role === 'agent' ? policy[a.kind] : 'auto')
  if (mode === 'deny') throw httpError(403, 'forbidden', `Ajan bu türde değişiklik yapamaz: ${a.kind}`)

  const row = (await tx(async (c) => {
    const r = await c.query(
      `INSERT INTO agent_action (run_id, work_item_id, email_id, meeting_id, kind, payload, confidence, reasoning, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [a.run_id, a.work_item_id, a.email_id, a.meeting_id, a.kind, JSON.stringify(a.payload), a.confidence, a.reasoning, actor.id])
    if (mode === 'propose') {
      if (a.work_item_id) await activity(c, a.work_item_id, actor, 'agent_proposal', `Ajan önerisi #${r.rows[0].id} — ${describe(a.kind, a.payload)}`)
      await emit(c, 'agent_action.created', 'agent_action', r.rows[0].id, { kind: a.kind, work_item_id: a.work_item_id }, actor)
    }
    return r.rows[0]
  }))
  if (mode === 'propose') return { action: toAction(row), applied: false }
  return finishAction(row, actor, null)
}

async function finishAction(row, actor, decidedBy) {
  try {
    const result = await applyAction(row, actor)
    const r = await query(
      `UPDATE agent_action SET status = 'applied', result_json = $2, decided_by = $3, decided_at = now(),
              work_item_id = coalesce(work_item_id, $4) WHERE id = $1 RETURNING *`,
      [row.id, JSON.stringify(result), decidedBy, result.work_item?.id ?? null])
    return { action: toAction(r.rows[0]), applied: true, result }
  } catch (e) {
    await query(`UPDATE agent_action SET status = 'failed', error = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
      [row.id, String(e.message).slice(0, 1000), decidedBy])
    throw e
  }
}

export async function listActions(q) {
  const where = []
  const vals = []
  const add = (sql, v) => { vals.push(v); where.push(sql.replaceAll('$?', `$${vals.length}`)) }
  if (list(q.status)) add('a.status = ANY($?)', list(q.status))
  if (q.work_item_id) add('a.work_item_id = $?', Number(q.work_item_id))
  if (q.run_id) add('a.run_id = $?', Number(q.run_id))
  const { rows } = await query(
    `SELECT a.*, w.code AS work_item_code, w.title AS work_item_title, d.username AS decided_by_username
     FROM agent_action a LEFT JOIN work_item w ON w.id = a.work_item_id LEFT JOIN app_user d ON d.id = a.decided_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT ${clampLimit(q.limit)}`, vals)
  return { actions: rows.map(toAction) }
}

/** Kullanıcı kararı. Onayda değişiklik onaylayan kullanıcı adına uygulanır; payload düzeltilerek de onaylanabilir. */
export async function decideAction(id, approve, actor, { payload, note } = {}) {
  if (approve && payload) {
    const cur = (await query('SELECT * FROM agent_action WHERE id = $1', [id])).rows[0]
    if (cur) await validateAction({ ...cur, payload })
  }
  const row = (await query(
    `UPDATE agent_action SET status = CASE WHEN $2::boolean THEN status ELSE 'rejected' END,
            decided_by = $3, decided_at = now(), payload = coalesce($4::jsonb, payload), error = CASE WHEN $2::boolean THEN error ELSE $5 END
     WHERE id = $1 AND status = 'pending' RETURNING *`, [id, approve, actor.id, payload ? JSON.stringify(payload) : null, note ?? null])).rows[0]
  if (!row) {
    const exists = (await query('SELECT status FROM agent_action WHERE id = $1', [id])).rows[0]
    if (!exists) throw httpError(404, 'not_found', 'Öneri bulunamadı')
    throw httpError(409, 'conflict', `Öneri zaten sonuçlanmış (${exists.status})`)
  }
  let out
  if (approve) {
    out = await finishAction(row, actor, actor.id)
  } else {
    if (row.work_item_id) await addComment(row.work_item_id, `Ajan önerisi #${id} reddedildi${note ? `: ${note}` : ''}`, actor)
    out = { action: toAction(row), applied: false }
  }
  await emit(null, 'agent_action.decided', 'agent_action', id,
    { decision: approve ? 'approved' : 'rejected', kind: row.kind, work_item_id: out.action.work_item_id, run_id: row.run_id, note: note ?? null }, actor)
  return out
}

// =====================================================================
// Çalışmalar (agent_run)
// =====================================================================
const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled']

export async function createRun(b) {
  if (!b.graph) throw httpError(400, 'invalid', 'graph zorunlu', { field: 'graph' })
  const r = await query(
    `INSERT INTO agent_run (graph, event_id, chat_session_id, external_run_id, thread_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [String(b.graph).slice(0, 100), b.event_id ?? null, b.chat_session_id ?? null, b.external_run_id ?? null, b.thread_id ?? null])
  return r.rows[0]
}

export async function updateRun(id, b) {
  if (b.status !== undefined && !RUN_STATUSES.includes(b.status)) throw httpError(400, 'invalid', `status: ${RUN_STATUSES.join(' | ')}`)
  const r = await query(
    `UPDATE agent_run SET status = coalesce($2, status), summary = coalesce($3, summary), error = coalesce($4, error),
            tokens_in = coalesce($5, tokens_in), tokens_out = coalesce($6, tokens_out),
            external_run_id = coalesce($7, external_run_id), thread_id = coalesce($8, thread_id),
            finished_at = CASE WHEN coalesce($2, status) <> 'running' THEN coalesce(finished_at, now()) ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [id, b.status ?? null, b.summary ?? null, b.error ?? null, b.tokens_in ?? null, b.tokens_out ?? null, b.external_run_id ?? null, b.thread_id ?? null])
  return r.rows[0] ?? null
}

export async function listRuns(q) {
  const vals = []
  const where = []
  if (list(q.status)) { vals.push(list(q.status)); where.push(`status = ANY($${vals.length})`) }
  if (q.graph) { vals.push(q.graph); where.push(`graph = $${vals.length}`) }
  const { rows } = await query(`SELECT * FROM agent_run ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${clampLimit(q.limit)}`, vals)
  return { runs: rows }
}

export async function getRun(id) {
  const run = (await query('SELECT * FROM agent_run WHERE id = $1', [id])).rows[0]
  if (!run) return null
  const [actions, acts] = await Promise.all([
    query('SELECT * FROM agent_action WHERE run_id = $1 ORDER BY id', [id]),
    query(`SELECT a.work_item_id, a.action, a.comment, a.created_at FROM work_item_activity a WHERE a.agent_run_id = $1 ORDER BY a.id`, [id]),
  ])
  return { ...run, actions: actions.rows.map(toAction), activities: acts.rows }
}

// =====================================================================
// Olaylar (izleme)
// =====================================================================
export async function listEvents(q) {
  const vals = []
  const where = []
  if (list(q.status)) { vals.push(list(q.status)); where.push(`status = ANY($${vals.length})`) }
  if (list(q.type)) { vals.push(list(q.type)); where.push(`type = ANY($${vals.length})`) }
  const { rows } = await query(`SELECT * FROM agent_event ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${clampLimit(q.limit, 100)}`, vals)
  return { events: rows }
}

/** Ajan olayı işledi (çekme modu) — ya da işleyemedi: retry → tekrar kuyruğa, failed → vazgeç. */
export async function ackEvent(id, b) {
  const result = b.result ?? 'done'
  if (!['done', 'retry', 'failed'].includes(result)) throw httpError(400, 'invalid', 'result: done | retry | failed')
  const row = (await query('SELECT id, status, attempts FROM agent_event WHERE id = $1', [id])).rows[0]
  if (!row) throw httpError(404, 'not_found', 'Olay bulunamadı')
  if (result === 'done') await query(`UPDATE agent_event SET status = 'acked', delivered_at = coalesce(delivered_at, now()), last_error = NULL WHERE id = $1`, [id])
  else if (result === 'failed') await query(`UPDATE agent_event SET status = 'failed', last_error = $2 WHERE id = $1`, [id, String(b.error ?? '').slice(0, 1000)])
  else await query(`UPDATE agent_event SET status = 'pending', last_error = $2, next_attempt_at = now() + make_interval(secs => $3) WHERE id = $1`,
    [id, String(b.error ?? '').slice(0, 1000), Math.max(0, Number(b.retry_after_sec) || 30)])
  return { ok: true, id, result }
}

export async function retryEvent(id) {
  const r = await query(`UPDATE agent_event SET status = 'pending', next_attempt_at = now(), attempts = 0 WHERE id = $1 AND status <> 'skipped' RETURNING id`, [id])
  return r.rows[0] ?? null
}

// =====================================================================
// Token yönetimi (yalnız admin)
// =====================================================================
export async function listTokens() {
  const { rows } = await query(
    `SELECT t.id, t.name, t.prefix, t.scopes, t.expires_at, t.last_used_at, t.revoked_at, t.created_at, u.username
     FROM api_token t JOIN app_user u ON u.id = t.user_id ORDER BY t.id DESC`)
  return { tokens: rows }
}

export async function revokeToken(id) {
  const r = await query('UPDATE api_token SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id', [id])
  return r.rowCount > 0
}
