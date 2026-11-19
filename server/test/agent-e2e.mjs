// Ajan API uçtan uca testi.
// Kullanım: Yaver'i şu ortamla başlatın, sonra bu dosyayı çalıştırın:
//   AGENT_TOKEN=yvr_test_token_123456789012345 AGENT_WEBHOOK_URL=http://127.0.0.1:9099/hook \
//   AGENT_WEBHOOK_SECRET=s3cret AGENT_CHAT_URL=http://127.0.0.1:9099/chat DEMO_FEEDS=false node server/src/index.js
//   node server/test/agent-e2e.mjs
// Test, 9099 portunda sahte bir LangGraph ajanı açar (webhook alır, SSE ile chat cevabı akıtır).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'

const BASE = process.env.YAVER_URL ?? 'http://127.0.0.1:8080'
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? 'yvr_test_token_123456789012345'
const SECRET = process.env.AGENT_WEBHOOK_SECRET ?? 's3cret'

const hooks = []
const chatCalls = []
const mock = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    if (req.url === '/hook') {
      const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${req.headers['x-yaver-timestamp']}.${raw}`).digest('hex')
      hooks.push({ headers: req.headers, body: JSON.parse(raw), sigOk: sig === req.headers['x-yaver-signature'] })
      res.writeHead(202).end('{}')
    } else if (req.url === '/chat') {
      const body = JSON.parse(raw)
      chatCalls.push(body)
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      // Ajan, kullanıcı adına token ile Yaver'den okur, sonra cevabı akıtır
      fetch(`${body.yaver.base_url}/api/work-items?limit=1`, { headers: { Authorization: `Bearer ${body.yaver.token}` } })
        .then((r) => r.json())
        .then((j) => {
          res.write(`event: tool_call\ndata: ${JSON.stringify({ name: 'list_work_items', args: { limit: 1 } })}\n\n`)
          res.write(`event: tool_result\ndata: ${JSON.stringify({ name: 'list_work_items', total: j.total })}\n\n`)
          for (const t of ['Toplam ', String(j.total), ' iş var.']) res.write(`event: token\ndata: ${JSON.stringify({ text: t })}\n\n`)
          res.end('event: done\ndata: {}\n\n')
        })
    } else res.writeHead(404).end()
  })
})
await new Promise((r) => mock.listen(9099, '127.0.0.1', r))

const call = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json, headers: res.headers }
}
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error('zaman aşımı')
    await new Promise((r) => setTimeout(r, 200))
  }
}
let n = 0
const ok = (name) => console.log(`  ✓ ${++n}. ${name}`)

// ---------- kimlik ----------
const login = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin' } })
assert.equal(login.status, 200)
const ADMIN = login.json.token
const A = AGENT_TOKEN

assert.equal((await call('GET', '/api/me', { token: A })).json.kind, 'token'); ok('ajan token\'ı ile kimlik')
assert.equal((await call('GET', '/api/state', { token: A })).status, 403); ok('ajan /state ve ayarları göremez')
assert.equal((await call('GET', '/api/settings/ldap', { token: A })).status, 403)
assert.equal((await call('GET', '/api/me', { token: 'yvr_yanlis' })).status, 401); ok('yanlış token 401')

const tok = await call('POST', '/api/admin/tokens', { token: ADMIN, body: { name: 'salt-okur', scopes: ['items:read'] } })
assert.equal(tok.status, 201)
assert.ok(tok.json.token.startsWith('yvr_'))
assert.equal((await call('GET', '/api/work-items?limit=1', { token: tok.json.token })).status, 200)
assert.equal((await call('POST', '/api/work-items', { token: tok.json.token, body: { title: 'x' } })).json.code, 'forbidden'); ok('kapsam kontrolü')
assert.equal((await call('DELETE', `/api/admin/tokens/${tok.json.id}`, { token: ADMIN })).status, 204)
assert.equal((await call('GET', '/api/work-items', { token: tok.json.token })).status, 401); ok('token iptali')

// ---------- okuma ----------
const items = await call('GET', '/api/work-items?status=new,in_progress&sort=priority&limit=5', { token: A })
assert.equal(items.status, 200)
assert.ok(items.json.items.length > 0 && items.json.total >= items.json.items.length); ok('iş listesi + filtre')
const first = items.json.items[0]
const detail = await call('GET', `/api/work-items/${first.id}`, { token: A })
assert.ok(Array.isArray(detail.json.activities) && detail.json.version >= 1)
assert.equal(detail.headers.get('etag'), `"${detail.json.version}"`); ok('iş detayı + ETag')
const emails = await call('GET', '/api/emails?linked=false&limit=3', { token: A })
assert.equal(emails.status, 200)
const em = await call('GET', `/api/emails/${emails.json.emails[0]?.id ?? 1}`, { token: A })
assert.equal(em.status, 200)
assert.ok('body_text' in em.json); ok('mail listesi + tam gövde')
assert.ok((await call('GET', '/api/users', { token: A })).json.users.every((u) => u.role !== 'agent')); ok('kullanıcılar (ajan hariç)')
assert.equal((await call('GET', '/api/meetings?limit=3', { token: A })).status, 200)
assert.ok((await call('GET', '/api/search?q=rapor', { token: A })).json.work_items.length > 0); ok('toplantılar + arama')

// ---------- olay: iş oluşturma webhook'a gider ----------
const before = hooks.length
const created = await call('POST', '/api/work-items', { token: ADMIN, body: { title: 'E2E test işi', priority: 'normal', tags: ['e2e'] } })
assert.equal(created.status, 201)
const hook = await until(() => hooks.slice(before).find((x) => x.body.type === 'work_item.created' && x.body.entity_id === created.json.id))
assert.ok(hook.sigOk, 'HMAC imzası doğru olmalı')
assert.equal(hook.headers['x-yaver-event'], 'work_item.created'); ok('olay → webhook (HMAC imzalı)')

// ---------- ajan yazmaları: politika ----------
const RUN = (await call('POST', '/api/agent/runs', { token: A, body: { graph: 'triage', event_id: hook.body.id } })).json
assert.ok(RUN.id)
const H = { 'X-Yaver-Run-Id': String(RUN.id) }
const cat = await call('PATCH', `/api/work-items/${created.json.id}`, { token: A, headers: H, body: { category: 'Destek', tags: ['e2e', 'ajan'] } })
assert.equal(cat.status, 200)
assert.equal(cat.json.category, 'Destek'); ok('auto politika: kategori/etiket doğrudan')
const pr = await call('PATCH', `/api/work-items/${created.json.id}`, { token: A, body: { priority: 'high' } })
assert.equal(pr.status, 403)
assert.equal(pr.json.code, 'proposal_required'); ok('propose politika: öncelik doğrudan değişemez')

const prop = await call('POST', '/api/agent/actions', { token: A, headers: H,
  body: { work_item_id: created.json.id, kind: 'priority', payload: { priority: 'high' }, confidence: 0.82, reasoning: 'Müşteri prod hatası bildiriyor' } })
assert.equal(prop.status, 202)
assert.equal(prop.json.action.status, 'pending'); ok('öneri oluşturuldu (pending)')
assert.equal((await call('POST', `/api/agent/actions/${prop.json.action.id}/approve`, { token: A })).status, 403); ok('ajan kendi önerisini onaylayamaz')
const hb = hooks.length
const appr = await call('POST', `/api/agent/actions/${prop.json.action.id}/approve`, { token: ADMIN })
assert.equal(appr.status, 200)
assert.equal(appr.json.result.work_item.priority, 'high'); ok('insan onayı → uygulandı')
await until(() => hooks.slice(hb).find((x) => x.body.type === 'agent_action.decided'))
ok('karar olayı ajana gitti')
assert.equal((await call('POST', `/api/agent/actions/${prop.json.action.id}/reject`, { token: ADMIN })).status, 409)

const auto = await call('POST', '/api/agent/actions', { token: A, body: { work_item_id: created.json.id, kind: 'tags', payload: { tags: ['e2e', 'oto'] } } })
assert.equal(auto.status, 200)
assert.equal(auto.json.applied, true); ok('auto türdeki öneri hemen uygulanır')

// ---------- idempotency + sürüm ----------
const key = `e2e-${Date.now()}`
const c1 = await call('POST', `/api/work-items/${created.json.id}/comments`, { token: A, headers: { 'Idempotency-Key': key }, body: { text: 'Ajan özeti' } })
const c2 = await call('POST', `/api/work-items/${created.json.id}/comments`, { token: A, headers: { 'Idempotency-Key': key }, body: { text: 'Ajan özeti' } })
assert.equal(c1.status, 201)
assert.deepEqual(c2.json, c1.json)
assert.equal(c2.headers.get('idempotent-replayed'), 'true'); ok('Idempotency-Key tekrar etmez')
const d2 = (await call('GET', `/api/work-items/${created.json.id}`, { token: A })).json
assert.equal(d2.activities.filter((a) => a.text === 'Ajan özeti').length, 1)
assert.ok(d2.activities.some((a) => a.action === 'agent_note' && a.actor === 'yaver-ajan'))
assert.ok(d2.activities.some((a) => a.agent_run_id === RUN.id)); ok('tarihçe: agent_note + run bağlantısı')
const stale = await call('PATCH', `/api/work-items/${created.json.id}`, { token: A, headers: { 'If-Match': String(d2.version - 1) }, body: { category: 'X' } })
assert.equal(stale.status, 409)
assert.equal(stale.json.code, 'conflict')
assert.equal((await call('PATCH', `/api/work-items/${created.json.id}`, { token: A, headers: { 'If-Match': `"${d2.version}"` }, body: { category: 'Y' } })).status, 200)
ok('If-Match sürüm çakışması 409')

// ---------- bağlama + mail triyaj ----------
const mailId = emails.json.emails[0]?.id
if (mailId) {
  const tri = await call('PATCH', `/api/emails/${mailId}`, { token: A, body: { triage_status: 'done', work_item_id: created.json.id } })
  assert.equal(tri.json.triage_status, 'done')
  assert.equal(tri.json.work_item_id, created.json.id); ok('mail triyaj + işe bağlama')
}
const fromMail = await call('POST', '/api/agent/actions', { token: A, body: { kind: 'create', email_id: mailId, payload: { title: 'Mailden iş', priority: 'normal' } } })
assert.equal(fromMail.json.applied, true)
assert.equal(fromMail.json.result.work_item.source_type, mailId ? 'mail' : 'manual'); ok('öneri ile mailden iş açma')

await call('PATCH', `/api/agent/runs/${RUN.id}`, { token: A, body: { status: 'succeeded', summary: 'test', tokens_in: 10, tokens_out: 5 } })
const run = (await call('GET', `/api/agent/runs/${RUN.id}`, { token: ADMIN })).json
assert.equal(run.status, 'succeeded')
assert.ok(run.finished_at && run.actions.length >= 1); ok('çalışma kaydı')

// ---------- çekme modu ack ----------
const evs = (await call('GET', '/api/agent/events/log?limit=5', { token: ADMIN })).json.events
assert.ok(evs.length > 0)
assert.equal((await call('POST', `/api/agent/events/${hook.body.id}/ack`, { token: A, body: { result: 'done' } })).json.result, 'done'); ok('olay ack')

// ---------- chat (stream modu) ----------
const sess = (await call('POST', '/api/chat/sessions', { token: ADMIN, body: { context: { work_item_id: created.json.id } } })).json
const streamed = []
const ctrl = new AbortController()
const sse = fetch(`${BASE}/api/chat/sessions/${sess.id}/stream?access_token=${ADMIN}`, { signal: ctrl.signal }).then(async (r) => {
  const dec = new TextDecoder()
  for await (const ch of r.body) streamed.push(dec.decode(ch))
}).catch(() => {})
await new Promise((r) => setTimeout(r, 300))
const post = await call('POST', `/api/chat/sessions/${sess.id}/messages`, { token: ADMIN, body: { text: 'Kaç iş var?' } })
assert.equal(post.status, 202)
const done = await until(async () => {
  const m = (await call('GET', `/api/chat/sessions/${sess.id}/messages`, { token: ADMIN })).json.messages
  return m.find((x) => x.role === 'assistant' && x.status === 'done')
})
assert.match(done.content, /^Toplam \d+ iş var\.$/)
assert.equal(done.tool_calls_json.length, 2)
assert.equal(chatCalls.at(-1).thread_id, `yaver-chat-${sess.id}`)
ok('chat: ajan kullanıcı adına okudu, cevap akıp kaydedildi')
await new Promise((r) => setTimeout(r, 200))
ctrl.abort()
await sse
const sseText = streamed.join('')
assert.match(sseText, /event: chat/)
assert.match(sseText, /"type":"token"/)
assert.match(sseText, /"type":"done"/); ok('chat SSE akışı')

// obo token ile tarihçe "kullanıcı adına"
const obo = chatCalls.at(-1).yaver.token
const oc = await call('POST', `/api/work-items/${created.json.id}/comments`, { token: obo, body: { text: 'chatten not' } })
assert.equal(oc.status, 201)
const d3 = (await call('GET', `/api/work-items/${created.json.id}`, { token: A })).json
assert.ok(d3.activities.some((a) => a.text === 'chatten not' && a.on_behalf_of === 'admin'))
const oboPr = await call('PATCH', `/api/work-items/${created.json.id}`, { token: obo, body: { priority: 'low' } })
assert.equal(oboPr.status, 200); ok('kullanıcı adına token: on_behalf_of + chat_direct_apply')
assert.equal((await call('GET', '/api/settings/agent', { token: obo })).status, 403)

// ---------- v0.6: geçmiş bağlamı, ajan yorumu, toplu mail ----------
const wiki = (await call('GET', '/api/wiki', { token: A })).json.pages
assert.ok(wiki.length >= 10)
assert.ok((await call('GET', `/api/wiki/${wiki[0].slug}`, { token: A })).json.body.length > 0); ok('wiki okuma')
assert.ok((await call('GET', '/api/contacts', { token: A })).json.contacts.some((c) => c.mgmt_level === 'gm')); ok('kişi rehberi (unvan/seviye)')
const bulk = await call('POST', '/api/bulk-send-mail', { token: ADMIN, body: { mails: [
  { from_address: 'hakan.erdem@firma.com', subject: 'ACİL: Bütçe raporunda toplamlar tutmuyor', body: 'Bugün içinde düzeltilmeli, rapordaki toplamlar hatalı.' },
  { from_address: 'yeni.kisi@dis.com', from_name: 'Yeni Kişi', subject: 'Portala giriş yapamıyorum', body: 'Şifre sıfırlama çalışmıyor.' },
] } })
assert.equal(bulk.status, 201)
assert.equal(bulk.json.count, 2)
const [gm, other] = bulk.json.work_items
assert.equal(gm.mgmt_level, 'gm')
assert.ok(gm.keywords.includes('acil') && gm.keywords.includes('rapor'))
assert.equal(other.mgmt_level, 'diger')
assert.ok(other.keywords.includes('erisim')); ok('bulk-send-mail: mail + iş + üst yönetim + anahtar kelime')
const ctx = (await call('GET', `/api/work-items/${gm.id}/context`, { token: A })).json
assert.equal(ctx.contact.mgmt_level, 'gm')
assert.ok(ctx.similar_items.length > 0 && ctx.wiki_pages.length > 0)
assert.ok(ctx.similar_items.some((s) => s.status === 'done' && s.resolved_in_days !== null)); ok('bağlam: benzer geçmiş işler + wiki')
const intr = (await call('POST', `/api/work-items/${gm.id}/interpret`, { token: ADMIN })).json
assert.match(intr.agent_comment, /Üst yönetim talebi/)
assert.ok(intr.agent_sources.some((s) => s.type === 'wiki') && intr.agent_sources.some((s) => s.type === 'db'))
assert.equal(intr.agent_suggestion.priority, 'critical'); ok('örnek yorumlayıcı: geçmişe dayalı yorum + kaynaklar')
const ac = await call('PUT', `/api/work-items/${other.id}/agent-comment`, { token: A,
  body: { comment: 'LLM yorumu', sources: [{ type: 'wiki', id: 1, ref: 'x', title: 'x' }], confidence: 0.7, suggestion: { priority: 'normal' } } })
assert.equal(ac.status, 200)
assert.equal(ac.json.agent_comment, 'LLM yorumu')
assert.equal(ac.json.agent_comment_by, 'yaver-ajan'); ok('ajan yorumunu API ile yazar')
const gen = await call('POST', '/api/bulk-send-mail', { token: A, body: { count: 3 } })
assert.equal(gen.json.count, 3); ok('bulk-send-mail örnek üretim (ajan token\'ı ile)')
const st = (await call('GET', '/api/state', { token: ADMIN })).json
assert.ok(st.keywordRules.length >= 6 && st.items.some((w) => w.mgmt_level === 'gmy')); ok('/state: anahtar kelime kuralları + seviyeler')

console.log(`\nTüm testler geçti (${n}).`)
mock.close()
process.exit(0)
