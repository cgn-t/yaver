import { query, tx } from './db.js'
import { emit } from './events.js'
import { enrichItem, keywordRules } from './intel.js'

// Arayüzdeki tiplerle (frontend/src/data/types.ts) birebir şekil üretir.

export const MASK = '********'
/** Durum kodlu hata: rotalar bunu {detail, code} olarak döndürür. */
export const httpError = (status, code, detail, extra = {}) => Object.assign(new Error(detail), { status, code, ...extra })
const STATUS_LABEL = { new: 'Yeni', in_progress: 'Devam Ediyor', waiting: 'Beklemede', done: 'Tamamlandı', cancelled: 'İptal' }
const PRIORITY_LABEL = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' }
const LOG_LIMIT = 300
const FIELD_LABEL = { title: 'başlık', description: 'açıklama', category: 'kategori', requester: 'talep eden', due_date: 'son tarih', tags: 'etiketler' }

export const ITEM_SQL = `
  SELECT w.id, w.code, w.title, coalesce(w.description, '') AS description, w.source_type, w.source_id,
         w.status, w.priority, coalesce(w.category, '') AS category, u.username AS assignee, w.requester,
         w.due_date, w.created_at, w.updated_at, w.closed_at, w.external_ref, w.external_url, w.version,
         w.requester_email, w.mgmt_level, w.keywords, w.agent_comment, w.agent_sources, w.agent_confidence, w.agent_suggestion,
         w.agent_comment_by, w.agent_comment_at,
         coalesce((SELECT array_agg(t.tag ORDER BY t.tag) FROM work_item_tag t WHERE t.work_item_id = w.id), '{}') AS tags
  FROM work_item w LEFT JOIN app_user u ON u.id = w.assignee_id`

export const toItem = (r) => {
  const { external_ref, ...rest } = r
  if (rest.agent_confidence !== undefined && rest.agent_confidence !== null) rest.agent_confidence = Number(rest.agent_confidence)
  return { ...rest, external_ref: external_ref ?? null, tags: external_ref && !r.tags.includes(`ext:${external_ref}`) ? [...r.tags, `ext:${external_ref}`] : r.tags }
}

export function toApiConfig(r, { mask = true } = {}) {
  const secret = mask && r.auth_secret ? MASK : (r.auth_secret ?? '')
  return {
    id: r.id, name: r.name, enabled: r.enabled, target: r.target, url: r.url, method: r.method,
    interval_sec: r.interval_sec, timeout_sec: r.timeout_sec, auth_type: r.auth_type,
    auth_token: r.auth_type === 'basic' ? '' : secret, auth_header: r.auth_header ?? 'X-API-Key',
    username: r.auth_username ?? '', password: r.auth_type === 'basic' ? secret : '',
    headers: r.headers_json ?? '', body: r.body_json ?? '',
    last_run_at: r.last_run_at, last_status: r.last_status,
  }
}

async function settings(category) {
  const { rows } = await query('SELECT key, value, is_secret FROM app_setting WHERE category = $1', [category])
  return Object.fromEntries(rows.map((r) => [r.key, r.is_secret && r.value ? MASK : r.value]))
}

const bool = (v) => v === 'true'
export async function getLdap() {
  const o = await settings('ldap')
  return {
    enabled: bool(o.enabled), server: o.server ?? '', port: Number(o.port ?? 636), use_ssl: bool(o.use_ssl),
    start_tls: bool(o.start_tls), skip_cert_verify: bool(o.skip_cert_verify), ca_cert: o.ca_cert ?? '',
    bind_dn: o.bind_dn ?? '', bind_password: o.bind_password ?? '', base_dn: o.base_dn ?? '',
    user_filter: o.user_filter ?? '', user_attr: o.user_attr ?? '', email_attr: o.email_attr ?? '',
    display_attr: o.display_attr ?? '', group_base: o.group_base ?? '', group_filter: o.group_filter ?? '',
    team_group_ou: o.team_group_ou ?? '', timeout_sec: Number(o.timeout_sec ?? 10),
  }
}

export async function getGeneral() {
  const o = await settings('general')
  const { rows } = await query(`SELECT username FROM app_user WHERE is_active AND role <> 'agent' ORDER BY (role = 'admin') DESC, id`)
  return {
    app_title: o.app_title ?? 'Yaver', default_assignee: o.default_assignee ?? '', sla_hours: Number(o.sla_hours ?? 24),
    mailbox: o.mailbox ?? '', team_members: rows.map((r) => r.username),
  }
}

/** Arayüzün tüm ekranlarını besleyen tek çağrı: GET /api/state */
export async function getState() {
  const [items, emails, meetings, parts, acts, cfgs, logs, ldap, general] = await Promise.all([
    query(`${ITEM_SQL} ORDER BY w.created_at DESC`),
    query(`SELECT id, message_id, thread_id, mailbox, from_address, coalesce(from_name, from_address) AS from_name,
                  to_addresses, cc_addresses, coalesce(subject, '') AS subject, coalesce(body_preview, '') AS body_preview,
                  importance, has_attachments, received_at, is_read, work_item_id
           FROM email ORDER BY received_at DESC LIMIT 2000`),
    query(`SELECT id, zoom_meeting_id, zoom_uuid, topic, coalesce(agenda, '') AS agenda, coalesce(host_email, '') AS host_email,
                  coalesce(host_name, '') AS host_name, start_time, duration_min, coalesce(timezone, '') AS timezone,
                  coalesce(join_url, '') AS join_url, status, recording_url, notes, work_item_id
           FROM meeting ORDER BY start_time`),
    query('SELECT meeting_id, coalesce(name, email) AS name, coalesce(email, \'\') AS email, attended FROM meeting_participant ORDER BY id'),
    query(`SELECT a.id, a.work_item_id, a.created_at AS at, coalesce(u.username, 'sistem') AS actor, a.action, coalesce(a.comment, '') AS text
           FROM work_item_activity a LEFT JOIN app_user u ON u.id = a.actor_id ORDER BY a.id`),
    query('SELECT * FROM api_poll_config ORDER BY id'),
    query(`SELECT l.id, l.config_id, c.name AS config_name, l.started_at, l.duration_ms, l.http_status, l.ok, l.record_count,
                  coalesce(l.message, '') AS message
           FROM api_poll_log l JOIN api_poll_config c ON c.id = l.config_id ORDER BY l.id DESC LIMIT ${LOG_LIMIT}`),
    getLdap(), getGeneral(),
  ])
  const byMeeting = new Map()
  for (const p of parts.rows) {
    const { meeting_id, ...rest } = p
    if (!byMeeting.has(meeting_id)) byMeeting.set(meeting_id, [])
    byMeeting.get(meeting_id).push(rest)
  }
  return {
    items: items.rows.map(toItem),
    emails: emails.rows,
    meetings: meetings.rows.map((m) => ({ ...m, participants: byMeeting.get(m.id) ?? [] })),
    activities: acts.rows,
    apiConfigs: cfgs.rows.map((r) => toApiConfig(r)),
    apiLogs: logs.rows,
    ldap, general,
    keywordRules: await keywordRules(),
  }
}

// ---------- yardımcılar ----------
async function userId(c, username) {
  if (!username) return null
  const r = await c.query(
    `INSERT INTO app_user (username, auth_source) VALUES ($1, 'ldap')
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`, [username])
  return r.rows[0].id
}
/** actor = req.user ({ id, onBehalfOf, runId }) veya null (sistem). */
export const activity = (c, itemId, actor, action, comment, oldV = null, newV = null) =>
  c.query(`INSERT INTO work_item_activity (work_item_id, actor_id, action, old_value, new_value, comment, on_behalf_of, agent_run_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [itemId, actor?.id ?? null, action, oldV, newV, comment, actor?.onBehalfOf?.id ?? null, actor?.runId ?? null])

// ---------- İşler ----------
export async function createWorkItem(input, actor) {
  return tx(async (c) => {
    const r = await c.query(
      `INSERT INTO work_item (title, description, source_type, source_id, priority, category, assignee_id, requester, due_date, created_by, requester_email,
                              external_ref, external_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [input.title, input.description ?? '', input.source_type ?? 'manual', input.source_id ?? null, input.priority ?? 'normal',
       input.category ?? null, await userId(c, input.assignee), input.requester ?? actor.onBehalfOf?.username ?? actor.username, input.due_date || null, actor.id,
       input.requester_email ?? null, input.external_ref ?? null, input.external_url ?? null])
    const id = r.rows[0].id
    for (const t of input.tags ?? []) await c.query('INSERT INTO work_item_tag VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, t])
    if (input.source_type === 'mail' && input.source_id) await c.query('UPDATE email SET work_item_id = $1 WHERE id = $2', [id, input.source_id])
    if (input.source_type === 'zoom' && input.source_id)
      await c.query('UPDATE meeting SET work_item_id = coalesce(work_item_id, $1) WHERE id = $2', [id, input.source_id])
    await enrichItem(c, id)   // anahtar kelimeler + talep edenin üst yönetim seviyesi
    await activity(c, id, actor, 'created', actor?.role === 'agent' ? 'Kayıt ajan tarafından oluşturuldu' : 'Kayıt oluşturuldu')
    const item = (await c.query(`${ITEM_SQL} WHERE w.id = $1`, [id])).rows.map(toItem)[0]
    await emit(c, 'work_item.created', 'work_item', id,
      { code: item.code, title: item.title, source_type: item.source_type, source_id: item.source_id }, actor)
    return item
  })
}

/** expectedVersion verilirse (If-Match) ve kayıt o arada değiştiyse 409 conflict fırlatır. */
export async function updateWorkItem(id, patch, actor, expectedVersion = null) {
  return tx(async (c) => {
    const old = (await c.query(`${ITEM_SQL} WHERE w.id = $1 FOR UPDATE OF w`, [id])).rows[0]
    if (!old) return null
    if (expectedVersion !== null && expectedVersion !== old.version)
      throw httpError(409, 'conflict', 'Kayıt bu arada değişti; yeniden okuyup tekrar deneyin', { current_version: old.version })
    const changes = {}
    const sets = []
    const vals = []
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
    const edited = []
    for (const k of ['title', 'description', 'category', 'requester'])
      if (patch[k] !== undefined && patch[k] !== old[k]) { set(k, patch[k]); changes[k] = [old[k], patch[k]]; edited.push(k) }
    if (patch.due_date !== undefined && (patch.due_date || null) !== old.due_date) {
      set('due_date', patch.due_date || null); changes.due_date = [old.due_date, patch.due_date || null]; edited.push('due_date')
    }
    if (patch.priority && patch.priority !== old.priority) {
      set('priority', patch.priority)
      changes.priority = [old.priority, patch.priority]
      await activity(c, id, actor, 'priority', `Öncelik: ${PRIORITY_LABEL[patch.priority]}`, old.priority, patch.priority)
    }
    if (patch.assignee !== undefined && (patch.assignee || null) !== old.assignee) {
      set('assignee_id', await userId(c, patch.assignee || null))
      changes.assignee = [old.assignee, patch.assignee || null]
      await activity(c, id, actor, 'assign', `Atanan: ${patch.assignee || '—'}`, old.assignee, patch.assignee || null)
    }
    if (patch.status && patch.status !== old.status) {
      set('status', patch.status)
      changes.status = [old.status, patch.status]
      sets.push(['done', 'cancelled'].includes(patch.status) ? 'closed_at = now()' : 'closed_at = NULL')
      await activity(c, id, actor, 'status', `Durum: ${STATUS_LABEL[old.status]} → ${STATUS_LABEL[patch.status]}`, old.status, patch.status)
    }
    if (Array.isArray(patch.tags)) {
      const next = [...new Set(patch.tags.map(String).filter((t) => t && !t.startsWith('ext:')))].sort()
      const prev = old.tags.filter((t) => !t.startsWith('ext:'))
      if (next.join('|') !== prev.join('|')) {
        await c.query('DELETE FROM work_item_tag WHERE work_item_id = $1', [id])
        for (const t of next) await c.query('INSERT INTO work_item_tag VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, t])
        changes.tags = [prev, next]
        edited.push('tags')
      }
    }
    if (edited.length) await activity(c, id, actor, 'edit', `Güncellendi: ${edited.map((k) => FIELD_LABEL[k] ?? k).join(', ')}`)
    sets.push('updated_at = now()', 'version = version + 1')
    vals.push(id)
    await c.query(`UPDATE work_item SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
    if (Object.keys(changes).length) await emit(c, 'work_item.updated', 'work_item', id, { code: old.code, changes }, actor)
    return (await c.query(`${ITEM_SQL} WHERE w.id = $1`, [id])).rows.map(toItem)[0]
  })
}

/** Ajan yazdığında 'agent_note' olarak işaretlenir (arayüzde ajan notu). */
export async function addComment(id, text, actor) {
  return tx(async (c) => {
    const ok = (await c.query('UPDATE work_item SET updated_at = now() WHERE id = $1 RETURNING code', [id])).rows[0]
    if (!ok) return null
    const action = actor?.role === 'agent' ? 'agent_note' : 'comment'
    const r = await c.query(
      `INSERT INTO work_item_activity (work_item_id, actor_id, action, comment, on_behalf_of, agent_run_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [id, actor?.id ?? null, action, text, actor?.onBehalfOf?.id ?? null, actor?.runId ?? null])
    await emit(c, 'work_item.commented', 'work_item', id, { code: ok.code, activity_id: r.rows[0].id, kind: action, text: text.slice(0, 500) }, actor)
    return { id: r.rows[0].id, action, created_at: r.rows[0].created_at }
  })
}

// ---------- Mail / Zoom ----------
export const markEmailRead = (id, isRead) => query('UPDATE email SET is_read = $1 WHERE id = $2', [!!isRead, id])

export async function updateMeeting(id, patch) {
  const allowed = ['notes', 'status', 'recording_url', 'agenda', 'work_item_id']
  const keys = allowed.filter((k) => patch[k] !== undefined)
  if (!keys.length) return
  await query(`UPDATE meeting SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`,
    [...keys.map((k) => patch[k]), id])
}

// ---------- Ayarlar ----------
async function saveSettings(category, obj, secretKeys, actor) {
  await tx(async (c) => {
    for (const [k, v] of Object.entries(obj)) {
      if (secretKeys.includes(k) && v === MASK) continue          // maskeli değer geri geldi → dokunma
      const value = Array.isArray(v) ? JSON.stringify(v) : v === null || v === undefined ? '' : String(v)
      await c.query(
        `INSERT INTO app_setting (category, key, value, is_secret, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [category, k, value, secretKeys.includes(k), actor.id])
    }
    await c.query(`INSERT INTO audit_log (actor_id, entity, entity_id, action) VALUES ($1, 'app_setting', $2, 'update')`, [actor.id, category])
  })
}

export const saveLdap = (ldap, actor) => saveSettings('ldap', ldap, ['bind_password'], actor)

export async function saveGeneral(general, actor) {
  const { team_members = [], ...rest } = general
  await saveSettings('general', rest, [], actor)
  // Ekip üyeleri = app_user. Listeden çıkarılan pasife alınır (geçmiş atamalar bozulmasın diye silinmez).
  await tx(async (c) => {
    for (const u of team_members) await c.query(
      `INSERT INTO app_user (username, auth_source) VALUES ($1, 'ldap') ON CONFLICT (username) DO UPDATE SET is_active = TRUE`, [u])
    await c.query(`UPDATE app_user SET is_active = (username = ANY($1)) WHERE role NOT IN ('admin', 'agent')`, [team_members])
  })
}

const cfgCols = (cfg, old) => {
  const basic = cfg.auth_type === 'basic'
  let secret = basic ? cfg.password : cfg.auth_token
  if (secret === MASK) secret = old?.auth_secret ?? ''
  return [cfg.name, !!cfg.enabled, cfg.target === 'manual' || cfg.target === 'api' ? 'generic' : cfg.target, cfg.url ?? '',
    cfg.method, Math.max(10, Number(cfg.interval_sec) || 60), Math.max(1, Number(cfg.timeout_sec) || 15), cfg.auth_type,
    cfg.auth_header ?? 'X-API-Key', cfg.username ?? '', secret ?? '', cfg.headers ?? '', cfg.body ?? '']
}

export async function createApiConfig(cfg) {
  const r = await query(
    `INSERT INTO api_poll_config (name, enabled, target, url, method, interval_sec, timeout_sec, auth_type, auth_header,
                                  auth_username, auth_secret, headers_json, body_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, cfgCols(cfg))
  return toApiConfig(r.rows[0])
}

export async function updateApiConfig(id, cfg) {
  const old = (await query('SELECT * FROM api_poll_config WHERE id = $1', [id])).rows[0]
  if (!old) return null
  const r = await query(
    `UPDATE api_poll_config SET name=$1, enabled=$2, target=$3, url=$4, method=$5, interval_sec=$6, timeout_sec=$7, auth_type=$8,
            auth_header=$9, auth_username=$10, auth_secret=$11, headers_json=$12, body_json=$13, updated_at=now()
     WHERE id = $14 RETURNING *`, [...cfgCols(cfg, old), id])
  return toApiConfig(r.rows[0])
}

export const deleteApiConfig = (id) => query('DELETE FROM api_poll_config WHERE id = $1', [id])
export const clearApiLogs = () => query('TRUNCATE api_poll_log')
