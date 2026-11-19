#!/usr/bin/env node
/**
 * GenAI Studio bağlantı denemesi: önce SSO'dan token alır, sonra Chat Block'a bir mesaj gönderir.
 * Yaver'in kullandığı ortam değişkenlerini okur (bkz. docs/GENAI-STUDIO.md); DB'ye dokunmaz.
 *
 *   oc rsh deploy/yaver node server/scripts/genai-ping.mjs "Merhaba"
 *
 * Token ve secret ekrana yazılmaz; yalnız uzunluk ve geçerlilik süresi gösterilir.
 */
import { chatUrl, httpRequest, tlsMode, tokenUrl } from '../src/genai-http.js'

const env = (n, d = '') => (process.env[n] ?? '').trim() || d
const need = ['GENAI_APPLICATION_BACKEND_URL', 'GENAI_SSO_URL', 'GENAI_CHAT_CLIENT_ID', 'GENAI_CHAT_CLIENT_SECRET', 'GENAI_APP_ID', 'GENAI_APP_IDENTIFIER']
const missing = need.filter((n) => !env(n))
if (missing.length) { console.error(`Eksik ortam değişkeni: ${missing.join(', ')}`); process.exit(2) }

const realm = env('GENAI_SSO_REALM', 'genai-studio')
const tokenPath = env('GENAI_SSO_TOKEN_PATH', '/auth/realms/{realm}/protocol/openid-connect/token').replace('{realm}', encodeURIComponent(realm))
const scope = env('GENAI_SSO_SCOPE', 'openid')
console.log(`TLS: ${tlsMode()}`)

// 1) Token
const fields = { grant_type: 'client_credentials', client_id: env('GENAI_CHAT_CLIENT_ID'), client_secret: env('GENAI_CHAT_CLIENT_SECRET'), ...(scope !== 'none' ? { scope } : {}) }
const asJson = env('GENAI_SSO_TOKEN_FORMAT', 'form') === 'json'
let t0 = Date.now()
const tUrl = tokenUrl(env('GENAI_SSO_URL'), tokenPath)
const tr = await httpRequest(tUrl, {
  method: 'POST',
  headers: { 'Content-Type': asJson ? 'application/json' : 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: asJson ? JSON.stringify(fields) : new URLSearchParams(fields).toString(),
}, 20_000).catch((e) => { console.error(`1) Token: ${e.message}`); process.exit(1) })
const tt = await tr.text()
if (!tr.ok) { console.error(`1) Token: HTTP ${tr.status} — ${tt.slice(0, 300)}`); process.exit(1) }
const tb = JSON.parse(tt)
const token = tb.access_token
if (!token) { console.error('1) Token: yanıtta access_token yok'); process.exit(1) }
console.log(`1) Token alındı (${Date.now() - t0} ms, ${token.length} karakter, expires_in=${tb.expires_in ?? '?'} sn)`)

// 2) Chat Block
t0 = Date.now()
const cr = await httpRequest(chatUrl(env('GENAI_APPLICATION_BACKEND_URL'), env('GENAI_CHAT_PATH', '/chat/block')), {
  method: 'POST',
  headers: { 'app-id': env('GENAI_APP_ID'), 'app-identifier': env('GENAI_APP_IDENTIFIER'), 'content-type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ thread_id: '', msg: process.argv[2] ?? 'Merhaba', request_context: {} }),
}, 90_000).catch((e) => { console.error(`2) Chat Block: ${e.message}`); process.exit(1) })
const ct = await cr.text()
console.log(`2) Chat Block: HTTP ${cr.status} (${Date.now() - t0} ms)`)
console.log(ct.slice(0, 4000))
process.exit(cr.ok ? 0 : 1)
