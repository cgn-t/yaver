import crypto from 'node:crypto'
import { Client } from 'ldapts'
import { query } from './db.js'

// Oturum anahtarı: üretimde Secret'tan gelir. Verilmezse pod her açıldığında yenisi üretilir
// (bu durumda pod yeniden başlayınca kullanıcılar tekrar giriş yapar).
const TOKEN_KEY = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex')
const TOKEN_TTL_SEC = Number(process.env.TOKEN_TTL_HOURS ?? 12) * 3600

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}

export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored ?? '').split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const a = crypto.scryptSync(pw, salt, 32)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const b64 = (s) => Buffer.from(s).toString('base64url')
const sign = (s) => crypto.createHmac('sha256', TOKEN_KEY).update(s).digest('base64url')

export function issueToken(user) {
  const payload = b64(JSON.stringify({ uid: user.id, u: user.username, r: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC }))
  return `${payload}.${sign(payload)}`
}

function readToken(token) {
  const [payload, sig] = String(token ?? '').split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.exp > Date.now() / 1000 ? data : null
  } catch { return null }
}

// ---------- Ajan kimliği ----------
/** Ajan token'larının alabileceği kapsamlar. Ayarlar / LDAP / API servisleri / token yönetimi hiçbir kapsamla açılmaz. */
export const AGENT_SCOPES = ['items:read', 'items:write', 'emails:read', 'emails:write', 'meetings:read', 'meetings:write',
  'users:read', 'events:read', 'runs:write', 'actions:write', 'chat:write']
const READ_SCOPES = AGENT_SCOPES.filter((s) => s.endsWith(':read'))
const API_TOKEN_PREFIX = 'yvr_'
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

/** Yeni ajan token'ı üretir. Düz metin yalnız bu cevapta döner, DB'de hash'i durur. */
export async function createApiToken({ username = 'yaver-ajan', name, scopes = AGENT_SCOPES, expiresDays = null, createdBy = null, plain = null }) {
  const bad = scopes.filter((s) => !AGENT_SCOPES.includes(s))
  if (bad.length) throw Object.assign(new Error(`Geçersiz kapsam: ${bad.join(', ')}`), { status: 400, code: 'invalid' })
  const u = (await query(`SELECT id, role FROM app_user WHERE username = $1`, [username])).rows[0]
  if (!u) throw Object.assign(new Error('Kullanıcı bulunamadı'), { status: 400, code: 'invalid' })
  if (u.role !== 'agent') throw Object.assign(new Error('Token yalnız ajan rolündeki kullanıcıya verilebilir'), { status: 400, code: 'invalid' })
  const token = plain ?? API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url')
  const r = await query(
    `INSERT INTO api_token (user_id, name, token_hash, prefix, scopes, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END, $7)
     ON CONFLICT (token_hash) DO UPDATE SET scopes = EXCLUDED.scopes, revoked_at = NULL
     RETURNING id, name, prefix, scopes, expires_at, created_at`,
    [u.id, name || 'ajan', sha256(token), token.slice(0, 10), scopes, expiresDays, createdBy])
  return { ...r.rows[0], username, token }
}

/** AGENT_TOKEN ortam değişkeni verilmişse (k8s Secret) o token'ı yaver-ajan için tanımlar. */
export async function bootstrapAgentToken() {
  const t = process.env.AGENT_TOKEN
  if (!t) return
  if (t.length < 24) { console.warn('[auth] AGENT_TOKEN en az 24 karakter olmalı — yok sayıldı'); return }
  await createApiToken({ name: 'env:AGENT_TOKEN', plain: t })
  console.log('[auth] AGENT_TOKEN ile ajan token\'ı tanımlı')
}

/**
 * Chat'te ajanın kullanıcı adına çalışması için kısa ömürlü token.
 * Kimlik = ajan, yetki = ajan kapsamları ∩ kullanıcının rolü; tarihçeye on_behalf_of olarak kullanıcı yazılır.
 */
export async function issueOnBehalfToken(userId, ttlSec = 900) {
  const { rows } = await query(`SELECT id, username, role FROM app_user WHERE id = $1 OR username = 'yaver-ajan' ORDER BY (role = 'agent')`, [userId])
  const user = rows.find((r) => r.id === userId)
  const agent = rows.find((r) => r.role === 'agent' && r.username === 'yaver-ajan')
  if (!user || !agent) throw new Error('Kullanıcı veya ajan hesabı yok')
  const scopes = user.role === 'viewer' ? READ_SCOPES : AGENT_SCOPES
  const payload = b64(JSON.stringify({ uid: agent.id, u: agent.username, r: 'agent', obo: user.id, ou: user.username, sc: scopes,
    exp: Math.floor(Date.now() / 1000) + ttlSec }))
  return `${payload}.${sign(payload)}`
}

async function readApiToken(token) {
  const { rows } = await query(
    `UPDATE api_token t SET last_used_at = now()
     FROM app_user u
     WHERE t.token_hash = $1 AND u.id = t.user_id AND u.is_active AND t.revoked_at IS NULL
       AND (t.expires_at IS NULL OR t.expires_at > now())
     RETURNING u.id, u.username, u.role, t.scopes, t.id AS token_id`, [sha256(token)])
  return rows[0] ?? null
}

/**
 * req.user = { id, username, role, kind: 'session' | 'token' | 'obo', scopes: Set | null (null = tümü), onBehalfOf, runId }
 * Ekrandan giriş yapan kullanıcı → session.  Ajan → Bearer yvr_… (token) veya chat'te verilen kısa ömürlü token (obo).
 * EventSource başlık gönderemediği için SSE uçlarında ?access_token= de kabul edilir.
 */
export async function authenticate(req) {
  const h = req.headers.authorization ?? ''
  const raw = h.startsWith('Bearer ') ? h.slice(7).trim() : (req.method === 'GET' ? req.query.access_token : null)
  if (!raw) return null
  const runId = Number(req.headers['x-yaver-run-id']) || null
  if (raw.startsWith(API_TOKEN_PREFIX)) {
    const t = await readApiToken(raw)
    return t && { id: t.id, username: t.username, role: t.role, kind: 'token', scopes: new Set(t.scopes), onBehalfOf: null, runId }
  }
  const d = readToken(raw)
  if (!d) return null
  if (d.obo) return { id: d.uid, username: d.u, role: 'agent', kind: 'obo', scopes: new Set(d.sc ?? []), onBehalfOf: { id: d.obo, username: d.ou }, runId }
  if (d.r === 'agent') return null
  return { id: d.uid, username: d.u, role: d.r ?? 'member', kind: 'session', scopes: null, onBehalfOf: null, runId: null }
}

export function requireAuth(req, res, next) {
  authenticate(req).then((u) => {
    if (!u) return res.status(401).json({ detail: 'Oturum geçersiz, tekrar giriş yapın', code: 'unauthorized' })
    req.user = u
    next()
  }, next)
}

/** Ekrandaki kullanıcıya açık uçlar (ajan token'ı ile çağrılamaz). */
export function humanOnly(req, res, next) {
  if (req.user.kind === 'session') return next()
  res.status(403).json({ detail: 'Bu uç yalnız kullanıcı oturumuyla çağrılabilir', code: 'forbidden' })
}

export function adminOnly(req, res, next) {
  if (req.user.kind === 'session' && req.user.role === 'admin') return next()
  res.status(403).json({ detail: 'Yönetici yetkisi gerekir', code: 'forbidden' })
}

/** Ajan token'ı için kapsam kontrolü. Kullanıcı oturumunda viewer yazamaz, diğerleri serbest. */
export const scope = (s) => (req, res, next) => {
  const u = req.user
  if (u.kind === 'session') {
    if (u.role === 'viewer' && !s.endsWith(':read')) return res.status(403).json({ detail: 'Salt okunur kullanıcı', code: 'forbidden' })
    return next()
  }
  if (u.scopes?.has(s)) return next()
  res.status(403).json({ detail: `Bu işlem için "${s}" kapsamı gerekir`, code: 'forbidden', scope: s })
}

// ---------- LDAP ----------
export async function loadLdapSettings() {
  const { rows } = await query(`SELECT key, value FROM app_setting WHERE category = 'ldap'`)
  const o = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    enabled: o.enabled === 'true', server: o.server ?? '', port: Number(o.port ?? 636),
    use_ssl: o.use_ssl === 'true', start_tls: o.start_tls === 'true', skip_cert_verify: o.skip_cert_verify === 'true',
    ca_cert: o.ca_cert ?? '', bind_dn: o.bind_dn ?? '', bind_password: o.bind_password ?? '', base_dn: o.base_dn ?? '',
    user_filter: o.user_filter || '(sAMAccountName={username})', user_attr: o.user_attr || 'sAMAccountName',
    email_attr: o.email_attr || 'mail', display_attr: o.display_attr || 'displayName',
    team_group_ou: o.team_group_ou ?? '', timeout_sec: Number(o.timeout_sec ?? 10),
  }
}

function ldapClient(cfg) {
  const host = cfg.server.replace(/^ldaps?:\/\//, '').replace(/:\d+$/, '')
  const scheme = cfg.use_ssl ? 'ldaps' : 'ldap'
  const tlsOptions = { rejectUnauthorized: !cfg.skip_cert_verify, ...(cfg.ca_cert ? { ca: [cfg.ca_cert] } : {}) }
  return new Client({
    url: `${scheme}://${host}:${cfg.port}`,
    timeout: cfg.timeout_sec * 1000, connectTimeout: cfg.timeout_sec * 1000,
    ...(cfg.use_ssl ? { tlsOptions } : {}),
  })
}

const escapeFilter = (s) => s.replace(/[\\*()\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'))

/** Servis hesabıyla bağlanıp kullanıcıyı bulur, ardından kullanıcının şifresiyle bind eder. */
export async function ldapAuthenticate(cfg, username, password) {
  const client = ldapClient(cfg)
  try {
    if (cfg.start_tls && !cfg.use_ssl) await client.startTLS({ rejectUnauthorized: !cfg.skip_cert_verify })
    await client.bind(cfg.bind_dn, cfg.bind_password)
    const filter = cfg.user_filter.replaceAll('{username}', escapeFilter(username))
    const { searchEntries } = await client.search(cfg.base_dn, {
      scope: 'sub', filter, attributes: [cfg.user_attr, cfg.email_attr, cfg.display_attr, 'memberOf'], sizeLimit: 2,
    })
    if (searchEntries.length !== 1) return null
    const entry = searchEntries[0]
    if (cfg.team_group_ou) {
      const groups = [entry.memberOf].flat().filter(Boolean).map(String)
      if (!groups.some((g) => g.toLowerCase().includes(cfg.team_group_ou.toLowerCase()))) return null
    }
    const userClient = ldapClient(cfg)
    try { await userClient.bind(entry.dn, password) } finally { await userClient.unbind().catch(() => {}) }
    return { email: String(entry[cfg.email_attr] ?? ''), full_name: String(entry[cfg.display_attr] ?? username) }
  } catch {
    return null
  } finally {
    await client.unbind().catch(() => {})
  }
}

/** Ayarlar > LDAP > "Bağlantıyı test et" */
export async function ldapTest(cfg) {
  const client = ldapClient(cfg)
  try {
    if (cfg.start_tls && !cfg.use_ssl) await client.startTLS({ rejectUnauthorized: !cfg.skip_cert_verify })
    await client.bind(cfg.bind_dn, cfg.bind_password)
    const { searchEntries } = await client.search(cfg.base_dn, { scope: 'base', filter: '(objectClass=*)', attributes: ['dn'] })
    return { ok: true, success: true, message: `Bağlantı başarılı. Base DN erişilebilir (${searchEntries.length} kayıt).` }
  } catch (e) {
    return { ok: false, success: false, message: `Bağlantı başarısız: ${e.message}` }
  } finally {
    await client.unbind().catch(() => {})
  }
}

/** Giriş: önce lokal hesap (admin), değilse LDAP etkinse LDAP doğrulaması. */
export async function login(username, password) {
  const u = String(username ?? '').trim().toLowerCase()
  if (!u || !password) return null
  const { rows } = await query('SELECT * FROM app_user WHERE lower(username) = $1 AND is_active', [u])
  let user = rows[0]
  if (user?.auth_source === 'local') {
    if (!verifyPassword(password, user.password_hash)) return null
  } else {
    const cfg = await loadLdapSettings()
    if (!cfg.enabled) return null
    const info = await ldapAuthenticate(cfg, u, password)
    if (!info) return null
    const r = await query(
      `INSERT INTO app_user (username, full_name, email, auth_source, team_group) VALUES ($1, $2, $3, 'ldap', $4)
       ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email RETURNING *`,
      [u, info.full_name, info.email, cfg.team_group_ou || null],
    )
    user = r.rows[0]
  }
  await query('UPDATE app_user SET last_login_at = now() WHERE id = $1', [user.id])
  // Tek kullanıcılı kullanım: lokal admin ile girilir ama ekip üyesi olarak görünülür (ADMIN_ACTS_AS, varsayılan mehmet.kaya).
  // Oturum o kullanıcının kimliğini taşır (Bana atananlar, yorumlar, karşılama), yetki admin kalır.
  if (user.auth_source === 'local' && user.role === 'admin' && ADMIN_ACTS_AS && ADMIN_ACTS_AS !== user.username) {
    const as = (await query('SELECT * FROM app_user WHERE lower(username) = $1 AND is_active AND role <> $2', [ADMIN_ACTS_AS, 'agent'])).rows[0]
    if (as) {
      await query('UPDATE app_user SET last_login_at = now() WHERE id = $1', [as.id])
      return { token: issueToken({ ...as, role: 'admin' }), username: as.username, full_name: as.full_name ?? as.username, role: 'admin',
               signed_in_as: user.username }
    }
  }
  return { token: issueToken(user), username: user.username, full_name: user.full_name, role: user.role }
}

/** Boş bırakılırsa (ADMIN_ACTS_AS=) admin kendi adıyla görünür. */
export const ADMIN_ACTS_AS = String(process.env.ADMIN_ACTS_AS ?? 'mehmet.kaya').trim().toLowerCase()
