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
  const payload = b64(JSON.stringify({ uid: user.id, u: user.username, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC }))
  return `${payload}.${sign(payload)}`
}

function readToken(token) {
  const [payload, sig] = String(token ?? '').split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  return data.exp > Date.now() / 1000 ? data : null
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization ?? ''
  const data = h.startsWith('Bearer ') ? readToken(h.slice(7)) : null
  if (!data) return res.status(401).json({ detail: 'Oturum geçersiz, tekrar giriş yapın' })
  req.user = { id: data.uid, username: data.u }
  next()
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
  return { token: issueToken(user), username: user.username, full_name: user.full_name, role: user.role }
}
