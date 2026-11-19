// GenAI HTTP yardımcıları: adres birleştirme + kurum içi (self-signed) sertifika seçenekleri.
//   node server/test/genai-http.mjs      (openssl gerekir)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { chatUrl, httpRequest, tokenUrl } from '../src/genai-http.js'

const P = '/auth/realms/genai-studio/protocol/openid-connect/token'
const host = 'https://sso.ornek.local'
let n = 0
const step = (s) => { n++; console.log(`✓ ${s}`) }

// 1) Adres birleştirme: kök, realm ya da tam adres → yol bir kez
assert.equal(tokenUrl(host, P), host + P)
assert.equal(tokenUrl(host + '/', P), host + P)
assert.equal(tokenUrl(host + P, P), host + P)
assert.equal(tokenUrl(host + P + '/', P), host + P)
assert.equal(tokenUrl(host + '/auth/realms/genai-studio', P), host + P)
assert.equal(tokenUrl(host + '/auth/realms/baska/protocol/openid-connect/token', P), host + '/auth/realms/baska/protocol/openid-connect/token')
assert.equal(chatUrl('https://api.ornek.local', '/chat/block'), 'https://api.ornek.local/chat/block')
assert.equal(chatUrl('https://api.ornek.local/chat/block', '/chat/block'), 'https://api.ornek.local/chat/block')
assert.equal(chatUrl('https://api.ornek.local/', ''), 'https://api.ornek.local/chat/block')
step('adres birleştirme: tam adres yazılsa da yol iki kez eklenmez')

// 2) Self-signed sertifikalı sunucu
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-tls-'))
const key = path.join(dir, 'key.pem'), crt = path.join(dir, 'crt.pem')
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' })
const srv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, len: b.length })))
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const url = `https://127.0.0.1:${srv.address().port}${P}`
const body = 'grant_type=client_credentials'
try {
  await assert.rejects(httpRequest(url, { method: 'POST', body }, 5000, {}), /SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY/)
  await assert.rejects(httpRequest(url, { method: 'POST', body }, 5000, {}), /GENAI_CA_CERT/)
  step('varsayılan: self-signed sertifika reddedilir, hata çözüm ipucu verir')

  const r1 = await httpRequest(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 5000, { GENAI_CA_CERT: fs.readFileSync(crt, 'utf8') })
  assert.equal(r1.status, 200); assert.equal(JSON.parse(await r1.text()).len, body.length)
  const r1b = await httpRequest(url, { method: 'POST', body }, 5000, { GENAI_CA_CERT: fs.readFileSync(crt, 'utf8').replace(/\n/g, '\\n') })
  assert.equal(r1b.status, 200)
  step('GENAI_CA_CERT (PEM, gerçek ya da \\n kaçışlı satır sonu) ile doğrulanır')

  const r2 = await httpRequest(url, { method: 'POST', body }, 5000, { GENAI_TLS_INSECURE: 'true' })
  assert.equal(r2.status, 200)
  step('GENAI_TLS_INSECURE=true ile (demo) bağlanır')

  // insecure yalnız o isteğe uygulanır: global fetch hâlâ doğrular
  await assert.rejects(fetch(url), (e) => /SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY/.test(String(e.cause?.code ?? e.message)))
  step('GENAI_TLS_INSECURE diğer HTTPS çağrılarını etkilemez')
} finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }) }
console.log(`\n${n} adım geçti`)
