import { query, tx } from './db.js'
import { emit } from './events.js'
import { enrichItem } from './intel.js'

/**
 * Sunucu tarafı periyodik API çağrı servisi.
 * api_poll_config'teki etkin servisler kendi aralığında (varsayılan 60 sn) çağrılır; arayüz kapalıyken de çalışır.
 * locked_until ile aynı servis aynı anda iki kez çalışmaz (ileride birden çok replika olsa bile).
 * Dönen kayıtlar hedef tabloya yazılır, her çağrı api_poll_log'a kaydedilir.
 */

const TICK_MS = 2000
const LOG_RETENTION_DAYS = Number(process.env.API_LOG_RETENTION_DAYS ?? 30)
const SELF = `http://127.0.0.1:${process.env.PORT ?? 8080}`

function buildHeaders(cfg) {
  let headers = {}
  if (cfg.headers_json?.trim()) {
    try { headers = JSON.parse(cfg.headers_json) } catch { throw new Error('Ek başlıklar geçerli JSON değil') }
  }
  const secret = cfg.auth_secret ?? ''
  if (cfg.auth_type === 'bearer' && secret) headers.Authorization = `Bearer ${secret}`
  if (cfg.auth_type === 'basic') headers.Authorization = `Basic ${Buffer.from(`${cfg.auth_username}:${secret}`).toString('base64')}`
  if (cfg.auth_type === 'api_key' && secret) headers[cfg.auth_header || 'X-API-Key'] = secret
  if (cfg.method !== 'GET' && cfg.body_json?.trim() && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return headers
}

function extractRecords(json) {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object')
    for (const k of ['items', 'data', 'records', 'results', 'value', 'issues', 'workItems']) if (Array.isArray(json[k])) return json[k]
  return []
}

const str = (v, d = '') => (v === undefined || v === null ? d : String(v))
const arr = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [])
const oneOf = (v, list, d) => (list.includes(v) ? v : d)

/** Kayıtları hedef tabloya yazar; dış anahtar (message_id / zoom_uuid / external_ref) ile çift kayıt engellenir. */
async function ingest(cfg, records) {
  return tx(async (c) => {
    let n = 0
    const mailbox = (await c.query(`SELECT value FROM app_setting WHERE category='general' AND key='mailbox'`)).rows[0]?.value ?? ''
    for (const o of records) {
      if (!o || typeof o !== 'object') continue
      if (cfg.target === 'mail') {
        const mid = str(o.message_id ?? o.internetMessageId ?? o.id)
        if (!mid) continue
        const body = o.body_text ?? (typeof o.body === 'object' ? o.body?.content : o.body) ?? o.bodyPreview ?? o.body_preview
        const r = await c.query(
          `INSERT INTO email (message_id, thread_id, mailbox, from_address, from_name, to_addresses, cc_addresses, subject,
                              body_preview, importance, has_attachments, received_at, body_text)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (message_id) DO NOTHING RETURNING id, subject, from_address`,
          [mid, o.thread_id ?? o.conversationId ?? null, str(o.mailbox, mailbox), str(o.from_address ?? o.from), str(o.from_name ?? o.from),
           JSON.stringify(arr(o.to_addresses ?? o.to)), JSON.stringify(arr(o.cc_addresses ?? o.cc)), str(o.subject, '(konu yok)'),
           str(o.body_preview ?? o.bodyPreview ?? body).slice(0, 2000), oneOf(o.importance, ['low', 'normal', 'high'], 'normal'),
           !!(o.has_attachments ?? o.hasAttachments), o.received_at ?? o.receivedDateTime ?? new Date().toISOString(),
           body === undefined || body === null ? null : String(body)])
        n += r.rowCount
        if (r.rowCount) await emit(c, 'email.received', 'email', r.rows[0].id,
          { subject: r.rows[0].subject, from_address: r.rows[0].from_address, source: cfg.name })
      } else if (cfg.target === 'zoom') {
        const zid = str(o.zoom_meeting_id ?? o.id)
        if (!zid) continue
        const r = await c.query(
          `INSERT INTO meeting (zoom_meeting_id, zoom_uuid, topic, agenda, host_email, host_name, start_time, duration_min, timezone, join_url, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (zoom_uuid) DO NOTHING RETURNING id`,
          [zid, str(o.uuid ?? o.zoom_uuid, `${zid}@${o.start_time ?? ''}`), str(o.topic, '(başlıksız)'), str(o.agenda),
           str(o.host_email), str(o.host_name ?? o.host_email), o.start_time ?? new Date().toISOString(),
           Number(o.duration ?? o.duration_min ?? 30), str(o.timezone, 'Europe/Istanbul'), str(o.join_url),
           oneOf(o.status, ['scheduled', 'live', 'ended', 'cancelled'], 'scheduled')])
        if (r.rowCount) {
          n++
          await emit(c, 'meeting.created', 'meeting', r.rows[0].id, { topic: str(o.topic, '(başlıksız)'), start_time: o.start_time ?? null, source: cfg.name })
          for (const p of Array.isArray(o.participants) ? o.participants : [])
            await c.query('INSERT INTO meeting_participant (meeting_id, name, email, attended) VALUES ($1,$2,$3,$4)',
              [r.rows[0].id, str(p.name ?? p.user_name), str(p.email ?? p.user_email), !!p.attended])
        }
      } else {
        // TFS (fields['System.Title']) ve Jira (fields.summary) yanıtları da doğrudan okunur
        const f = o.fields && typeof o.fields === 'object' ? o.fields : {}
        const title = o.title ?? f['System.Title'] ?? f.summary
        if (!title) continue
        const srcType = ['tfs', 'jira'].includes(cfg.target) ? cfg.target : 'api'
        const ext = str(o.code ?? o.key ?? o.id) || null
        const extRef = ext && srcType === 'tfs' && /^\d+$/.test(ext) ? `TFS-${ext}` : ext
        const requesterEmail = str(o.requester_email ?? f['System.CreatedBy']?.uniqueName ?? f.reporter?.emailAddress) || null
        const r = await c.query(
          `INSERT INTO work_item (title, description, source_type, external_ref, external_url, priority, category, requester, requester_email, due_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (source_type, external_ref) WHERE external_ref IS NOT NULL DO NOTHING RETURNING id`,
          [str(title), str(o.description ?? f['System.Description'] ?? f.description), srcType, extRef, str(o.url ?? o._links?.html?.href ?? o.self) || null,
           oneOf(o.priority, ['low', 'normal', 'high', 'critical'], 'normal'),
           str(o.category, srcType === 'tfs' ? 'Kanban' : srcType === 'jira' ? 'Jira' : 'Entegrasyon'),
           str(o.requester ?? f['System.CreatedBy']?.displayName ?? f.reporter?.displayName, cfg.name), requesterEmail, o.due_date ?? null])
        if (r.rowCount) {
          n++
          await c.query(`INSERT INTO work_item_activity (work_item_id, action, comment) VALUES ($1, 'created', $2)`,
            [r.rows[0].id, `${cfg.name} servisinden alındı`])
          await enrichItem(c, r.rows[0].id)
          await emit(c, 'work_item.created', 'work_item', r.rows[0].id, { title: str(title), source_type: srcType, external_ref: extRef, source: cfg.name })
        }
      }
    }
    return n
  })
}

/** Tek bir servisi çalıştırır ve sonucu loglar. */
export async function runConfig(cfg) {
  const started = new Date()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, cfg.timeout_sec) * 1000)
  let log
  try {
    if (!cfg.url) throw new Error('URL tanımlı değil')
    const url = new URL(cfg.url, SELF)          // "/api/..." gibi göreli adresler pod'un kendisine gider
    const res = await fetch(url, {
      method: cfg.method, headers: buildHeaders(cfg), signal: ctrl.signal,
      body: cfg.method !== 'GET' && cfg.body_json?.trim() ? cfg.body_json : undefined,
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* JSON değil */ }
    const records = res.ok ? extractRecords(json) : []
    const added = records.length ? await ingest(cfg, records) : 0
    log = { http_status: res.status, ok: res.ok, record_count: added,
            message: res.ok ? (json === null ? 'Cevap JSON değil' : `${records.length} kayıt alındı, ${added} yeni`) : `HTTP ${res.status} ${res.statusText}` }
  } catch (e) {
    const msg = e.name === 'AbortError' ? `Zaman aşımı (${cfg.timeout_sec} sn)` : (e.cause?.code ? `${e.message} (${e.cause.code})` : e.message)
    log = { http_status: null, ok: false, record_count: 0, message: String(msg).slice(0, 1000) }
  } finally {
    clearTimeout(timer)
  }
  await query(
    `INSERT INTO api_poll_log (config_id, started_at, duration_ms, http_status, ok, record_count, message) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [cfg.id, started, Date.now() - started.getTime(), log.http_status, log.ok, log.record_count, log.message])
  await query(`UPDATE api_poll_config SET last_run_at = $1, last_status = $2, locked_until = NULL WHERE id = $3`,
    [started, log.ok ? 'ok' : 'error', cfg.id])
  return log
}

/** Kilidi alınabilirse servisi hemen çalıştırır ("Şimdi çalıştır"). */
export async function runNow(id) {
  const { rows } = await query(
    `UPDATE api_poll_config SET locked_until = now() + make_interval(secs => timeout_sec + 30)
     WHERE id = $1 AND (locked_until IS NULL OR locked_until < now()) RETURNING *`, [id])
  if (!rows[0]) return { busy: true }
  return runConfig(rows[0])
}

async function tick() {
  const { rows } = await query(
    `UPDATE api_poll_config SET locked_until = now() + make_interval(secs => timeout_sec + 30)
     WHERE enabled AND url <> ''
       AND (last_run_at IS NULL OR last_run_at + make_interval(secs => interval_sec) <= now())
       AND (locked_until IS NULL OR locked_until < now())
     RETURNING *`)
  // Beklemeden başlat: yavaş bir servis diğerlerini geciktirmesin (kilit, aynı servisin üst üste binmesini engeller)
  for (const cfg of rows) runConfig(cfg).catch((e) => console.error('[poller]', cfg.name, e.message))
}

export function startPoller() {
  let busy = false
  setInterval(async () => {
    if (busy) return
    busy = true
    try { await tick() } catch (e) { console.error('[poller]', e.message) } finally { busy = false }
  }, TICK_MS)
  // Günlük: eski çağrı loglarını temizle
  const cleanup = () => query(`DELETE FROM api_poll_log WHERE started_at < now() - make_interval(days => $1)`, [LOG_RETENTION_DAYS]).catch(() => {})
  cleanup()
  setInterval(cleanup, 24 * 3600_000)
  console.log('[poller] API çağrı servisi başladı')
}
