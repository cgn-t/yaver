import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

/**
 * GenAI Studio HTTP yardımcıları (DB'ye bağımlı değil; server/scripts/genai-ping.mjs de kullanır).
 *  - Adres birleştirme: ENV'e kök adres de tam adres de yazılsa yol iki kez eklenmez.
 *  - TLS: kurum içi CA için GENAI_CA_CERT (PEM metni) ya da NODE_EXTRA_CA_CERTS (dosya yolu);
 *    yalnız demo için GENAI_TLS_INSECURE=true (sertifika doğrulaması YALNIZ GenAI çağrılarında kapanır).
 */

const OIDC_SUFFIX = '/protocol/openid-connect/token'

/** base + path; base zaten path ile bitiyorsa (ya da tam token adresiyse) olduğu gibi döner. */
export function joinUrl(base, path) {
  const b = String(base ?? '').trim().replace(/\/+$/, '')
  const p = String(path ?? '').trim()
  if (!p) return b
  const pp = p.startsWith('/') ? p : `/${p}`
  if (b.endsWith(pp)) return b
  return b + pp
}

/** SSO token adresi: kök, realm adresi ya da tam token adresi verilebilir. */
export function tokenUrl(ssoUrl, tokenPath) {
  const b = String(ssoUrl ?? '').trim().replace(/\/+$/, '')
  if (b.endsWith(OIDC_SUFFIX) || b.endsWith(String(tokenPath ?? '').replace(/\/+$/, ''))) return b
  if (/\/auth\/realms\/[^/]+$/.test(b) || /\/realms\/[^/]+$/.test(b)) return b + OIDC_SUFFIX
  return joinUrl(b, tokenPath)
}

/** Chat Block adresi: kök ya da /chat/block ile biten tam adres verilebilir. */
export const chatUrl = (backendUrl, chatPath) => joinUrl(backendUrl, chatPath || '/chat/block')

export function tlsOptions(env = process.env) {
  const insecure = String(env.GENAI_TLS_INSECURE ?? '').trim().toLowerCase() === 'true'
  const pem = String(env.GENAI_CA_CERT ?? '').trim().replace(/\\n/g, '\n')
  return { insecure, ca: pem ? [...tls.rootCertificates, pem] : null }
}

export function tlsMode(env = process.env) {
  const t = tlsOptions(env)
  return t.insecure ? 'insecure' : t.ca ? 'ca-cert' : env.NODE_EXTRA_CA_CERTS ? 'node-extra-ca' : 'default'
}

const CERT_CODES = ['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_UNTRUSTED', 'UNABLE_TO_GET_ISSUER_CERT']
export const certHint = (code) => CERT_CODES.includes(code)
  ? ' — kurum içi sertifika: GENAI_CA_CERT (CA PEM) ya da NODE_EXTRA_CA_CERTS verin; yalnız demo için GENAI_TLS_INSECURE=true'
  : ''

/**
 * fetch benzeri istek: {ok, status, text()}. Varsayılan TLS ayarında global fetch kullanılır;
 * GENAI_CA_CERT ya da GENAI_TLS_INSECURE verildiyse node:https ile ve yalnız bu istek için uygulanır.
 */
export async function httpRequest(url, { method = 'GET', headers = {}, body } = {}, ms = 30_000, env = process.env) {
  const t = tlsOptions(env)
  const u = new URL(url)
  if (u.protocol !== 'https:' || (!t.insecure && !t.ca)) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal })
      const text = await res.text()
      return { ok: res.ok, status: res.status, text: async () => text }
    } catch (e) {
      const code = e.cause?.code ?? e.code
      throw new Error(e.name === 'AbortError' ? `zaman aşımı (${Math.round(ms / 1000)} sn): ${url}` : `${url}: ${code ?? e.message}${certHint(code)}`)
    } finally { clearTimeout(timer) }
  }
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method, headers: { ...headers, ...(body !== undefined ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
      rejectUnauthorized: !t.insecure, ...(t.ca ? { ca: t.ca } : {}), timeout: ms,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => text })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error(`zaman aşımı (${Math.round(ms / 1000)} sn): ${url}`)))
    req.on('error', (e) => reject(new Error(e.message.startsWith('zaman aşımı') ? e.message : `${url}: ${e.code ?? e.message}${certHint(e.code)}`)))
    if (body !== undefined) req.write(body)
    req.end()
  })
}
