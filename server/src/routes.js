import express from 'express'
import * as G from './genai.js'
import * as D from './demoflow.js'
import * as DR from './draftflow.js'
import * as DB from './dbview.js'
import * as GT from './genai-test.js'
import { BOOT_ID, SUGGESTIONS, askYaver } from './ai-ask.js'
import { adminOnly, createApiToken, humanOnly, ldapTest, loadLdapSettings, requireAuth, scope } from './auth.js'
import { resetDemoData, query } from './db.js'
import * as S from './state.js'
import * as A from './agent.js'
import * as C from './chat.js'
import * as I from './intel.js'
import { loadDemoHistory } from './demo.js'
import { DELIVERY, claimEvents, openSse, toEnvelope } from './events.js'
import { runNow } from './poller.js'

/** async rota hatalarını tek yerde yakala */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const id = (req) => {
  const n = Number(req.params.id)
  if (!Number.isInteger(n) || n <= 0) throw S.httpError(400, 'invalid', 'Geçersiz id')
  return n
}
const notFound = (res, what) => res.status(404).json({ detail: `${what} bulunamadı`, code: 'not_found' })

/**
 * Idempotency-Key: aynı anahtarla tekrar gelen istek (ajanın yeniden denemesi) işlemi tekrarlamaz,
 * ilk cevabı aynen döner. Anahtar aktör başına tekildir, 24 saat saklanır. 5xx cevaplar saklanmaz.
 */
function idempotency(req, res, next) {
  const key = req.headers['idempotency-key']
  if (!key || req.method === 'GET') return next()
  if (String(key).length > 200) return res.status(400).json({ detail: 'Idempotency-Key en fazla 200 karakter', code: 'invalid' })
  const actor = req.user.id
  ;(async () => {
    const ins = await query(
      `INSERT INTO idempotency_key (actor_id, key, method, path) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING key`,
      [actor, key, req.method, req.originalUrl])
    if (!ins.rows[0]) {
      const old = (await query('SELECT * FROM idempotency_key WHERE actor_id = $1 AND key = $2', [actor, key])).rows[0]
      if (!old) return next()
      if (old.method !== req.method || old.path !== req.originalUrl)
        return res.status(422).json({ detail: 'Bu Idempotency-Key başka bir istek için kullanılmış', code: 'invalid' })
      if (old.response_status === null) return res.status(409).json({ detail: 'Aynı anahtarlı istek hâlâ işleniyor', code: 'in_progress' })
      res.setHeader('Idempotent-Replayed', 'true')
      return old.response_status === 204 ? res.status(204).end() : res.status(old.response_status).json(old.response_json)
    }
    let body = null
    const json = res.json.bind(res)
    res.json = (b) => { body = b; return json(b) }
    res.on('finish', () => {
      const p = res.statusCode >= 500
        ? query('DELETE FROM idempotency_key WHERE actor_id = $1 AND key = $2', [actor, key])
        : query('UPDATE idempotency_key SET response_status = $3, response_json = $4 WHERE actor_id = $1 AND key = $2',
          [actor, key, res.statusCode, body === null ? null : JSON.stringify(body)])
      p.catch((e) => console.warn('[idempotency]', e.message))
    })
    next()
  })().catch(next)
}

/** If-Match: "3" veya 3 → 3 */
const ifMatch = (req) => {
  const v = req.headers['if-match']
  if (v === undefined) return null
  const n = Number(String(v).replace(/^W\//, '').replaceAll('"', ''))
  if (!Number.isInteger(n)) throw S.httpError(400, 'invalid', 'If-Match sayısal sürüm olmalı (work_item.version)')
  return n
}

export function apiRouter() {
  const api = express.Router()
  api.use(requireAuth)
  api.use(idempotency)

  api.get('/me', (req, res) => res.json({ id: req.user.id, username: req.user.username, role: req.user.role, kind: req.user.kind,
    scopes: req.user.scopes ? [...req.user.scopes] : null, on_behalf_of: req.user.onBehalfOf?.username ?? null }))

  // Arayüzün tek seferde tüm ekranları beslediği çağrı (ajan kullanmaz: ayarlar da içinde)
  api.get('/state', humanOnly, h(async (_req, res) => res.json(await S.getState())))

  // =================== İşler ===================
  api.get('/work-items', scope('items:read'), h(async (req, res) => res.json(await A.listWorkItems(req.query))))
  api.get('/work-items/:id', scope('items:read'), h(async (req, res) => {
    const r = await A.getWorkItem(id(req))
    if (!r) return notFound(res, 'İş')
    res.setHeader('ETag', `"${r.version}"`)
    res.json(r)
  }))
  api.post('/work-items', scope('items:write'), h(async (req, res) => {
    const b = req.body ?? {}
    await A.validateItemPatch(b, { create: true })
    await A.assertDirect(req.user, ['create'])
    const item = await S.createWorkItem({ ...b, title: String(b.title).trim() }, req.user)
    // Örnek yorumlayıcı (gerçek ajan bağlıysa kapalı): arka planda geçmişe bakıp yorum yazar
    if (I.DEMO_INTERPRETER && !G.isActive() && req.user.role !== 'agent') I.interpret(item.id).catch((e) => console.warn('[intel]', e.message))
    res.status(201).json(item)
  }))
  api.patch('/work-items/:id', scope('items:write'), h(async (req, res) => {
    const b = req.body ?? {}
    await A.validateItemPatch(b)
    await A.assertDirect(req.user, A.patchKinds(b))
    const r = await S.updateWorkItem(id(req), b, req.user, ifMatch(req))
    if (!r) return notFound(res, 'İş')
    res.setHeader('ETag', `"${r.version}"`)
    res.json(r)
  }))
  api.post('/work-items/:id/comments', scope('items:write'), h(async (req, res) => {
    const text = String(req.body?.text ?? '').trim()
    if (!text) return res.status(400).json({ detail: 'Yorum boş olamaz', code: 'invalid', field: 'text' })
    const r = await S.addComment(id(req), text.slice(0, 20000), req.user)
    r ? res.status(201).json({ ok: true, ...r }) : notFound(res, 'İş')
  }))
  api.post('/work-items/:id/links', scope('items:write'), h(async (req, res) => {
    await A.assertDirect(req.user, ['link'])
    res.status(201).json(await A.linkToWorkItem(id(req), { email_id: Number(req.body?.email_id) || null, meeting_id: Number(req.body?.meeting_id) || null }, req.user))
  }))

  // =================== Geçmiş bağlamı ve ajan yorumu ===================
  /** Ajanın yorum yaparken bakacağı geçmiş: benzer işler (DB), wiki, göndericinin mailleri, kişi, ekip yükü */
  api.get('/work-items/:id/context', scope('items:read'), h(async (req, res) => {
    const r = await I.buildContext(id(req))
    r ? res.json(r) : notFound(res, 'İş')
  }))
  api.put('/work-items/:id/agent-comment', scope('items:write'), h(async (req, res) => {
    const r = await I.setAgentComment(id(req), req.body ?? {}, req.user)
    r ? res.json(r) : notFound(res, 'İş')
  }))
  /** İşi yeniden yorumlatır: GenAI Studio etkinse Chat Block'a sorar (senkron), değilse pod içi örnek yorumlayıcı */
  api.post('/work-items/:id/interpret', scope('items:write'), h(async (req, res) => {
    const r = G.isActive() ? await G.interpretWithGenAI(id(req), { trigger: 'manual' }) : await I.interpret(id(req))
    r ? res.json(r) : notFound(res, 'İş')
  }))

  // =================== Toplu mail ===================
  /**
   * Toplu mail girişi: gövde {mails: [{from_address, from_name?, subject, body, importance?, received_at?, message_id?}],
   * create_items?: true, interpret?: true} ya da örnek mail üretmek için {count: 5}. Her mail → email + iş + ajan yorumu.
   */
  api.post('/bulk-send-mail', scope('emails:write'), h(async (req, res) => {
    if ((req.body ?? {}).create_items !== false) await A.assertDirect(req.user, ['create'])
    res.status(201).json(await I.bulkSendMail(req.body ?? {}, req.user))
  }))
  /**
   * TFS Kanban / Jira kalemleri: {items: [{source_type: 'tfs'|'jira', external_ref, title, description?, requester_email?, url?, priority?}]}
   * ya da örnek üretmek için {count: 4}. Aynı source_type + external_ref ikinci kez eklenmez (skipped).
   */
  api.post('/bulk-import', scope('items:write'), h(async (req, res) => {
    await A.assertDirect(req.user, ['create'])
    res.status(201).json(await I.bulkImport(req.body ?? {}, req.user))
  }))

  // =================== Demo iş akışı (0.9) ===================
  /**
   * Jira / TFS / Mail / Zoom'dan gelmiş gibi demo işler oluşturur, AI'a yorumlatır, DB'ye yazar.
   * Gövde: {keys?: [...], reset?: true, interpret?: true, wait?: false, timeout_sec?: 180}. Tekrar çalıştırılınca önceki demo işleri silinir.
   */
  api.get('/demo/scenarios', scope('items:read'), h(async (_req, res) => res.json({ scenarios: D.listScenarios() })))
  api.post('/demo/run', scope('items:write'), h(async (req, res) => {
    await A.assertDirect(req.user, ['create'])
    const b = req.body ?? {}
    if (b.scenario === 'taslak') return res.status(201).json(await DR.runDrafts(b, req.user))   // demo akışı 2
    res.status(201).json(await D.runDemo(b, req.user))
  }))
  api.get('/demo/status', scope('items:read'), h(async (_req, res) => res.json(await D.demoStatus())))
  api.post('/demo/clear', scope('items:write'), h(async (_req, res) => res.json({ ...(await D.clearDemo()), taslak: await DR.clearDrafts() })))

  /**
   * Demo akışı 2: mail taslağını AI doldurur (konu, metin, kategori, konu anahtarı, öncelik, atanan, süre, durum, yorum) → mail + iş.
   * Gövde: {keys?: [...]} örnek taslaklar ya da {drafts: [{from, text}]} kendi taslağınız; reset?: true (önceki taslak işleri silinir).
   */
  api.get('/demo/drafts', scope('items:read'), h(async (_req, res) => res.json({ drafts: DR.listDrafts(), fields: DR.DRAFT_FIELDS })))
  api.post('/demo/draft', scope('items:write'), h(async (req, res) => {
    await A.assertDirect(req.user, ['create'])
    res.status(201).json(await DR.runDrafts(req.body ?? {}, req.user))
  }))
  api.get('/demo/draft/status', scope('items:read'), h(async (_req, res) => res.json(await DR.draftStatus())))
  api.post('/demo/draft/clear', scope('items:write'), h(async (_req, res) => res.json(await DR.clearDrafts())))
  // =================== Veritabanı görüntüleyici (0.9.10): yalnız yönetici, salt okunur ===================
  api.get('/admin/db/tables', adminOnly, h(async (_req, res) => res.json(await DB.listTables())))
  api.get('/admin/db/tables/:name', adminOnly, h(async (req, res) => res.json(await DB.tableRows(req.params.name, req.query))))
  api.get('/admin/db/tables/:name/export', adminOnly, h(async (req, res) => {
    const f = await DB.exportTable(req.params.name, req.query)
    res.setHeader('Content-Type', f.type)
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`)
    res.send(f.body)
  }))

  api.post('/demo/reset-all', adminOnly, h(async (_req, res) => res.json(await D.resetAll())))

  // =================== Yaver AI sohbet (0.9) ===================
  api.get('/ai/suggestions', humanOnly, h(async (_req, res) => res.json({ suggestions: SUGGESTIONS, mode: G.isActive() ? 'genai' : 'yerel', boot_id: BOOT_ID })))
  api.post('/ai/ask', humanOnly, h(async (req, res) => res.json(await askYaver(req.body ?? {}, req.user))))

  // =================== Wiki ve kişiler ===================
  api.get('/wiki', scope('items:read'), h(async (req, res) => res.json(await I.listWiki(req.query))))
  api.get('/wiki/:slug', scope('items:read'), h(async (req, res) => {
    const r = await I.getWiki(req.params.slug)
    r ? res.json(r) : notFound(res, 'Wiki sayfası')
  }))
  api.put('/wiki/:slug', humanOnly, h(async (req, res) => res.json(await I.upsertWiki({ ...req.body, slug: req.params.slug, updated_by: req.user.username }))))
  api.get('/contacts', scope('users:read'), h(async (_req, res) => res.json(await I.listContacts())))
  api.put('/contacts', humanOnly, h(async (req, res) => res.json(await I.upsertContact(req.body ?? {}))))
  api.get('/settings/keywords', scope('items:read'), h(async (_req, res) => res.json({ rules: await I.keywordRules() })))
  api.put('/settings/keywords', adminOnly, h(async (req, res) => res.json({ rules: await I.saveKeywordRules(req.body?.rules) })))

  // =================== Mail ===================
  api.get('/emails', scope('emails:read'), h(async (req, res) => res.json(await A.listEmails(req.query))))
  api.get('/emails/:id', scope('emails:read'), h(async (req, res) => {
    const r = await A.getEmail(id(req))
    r ? res.json(r) : notFound(res, 'Mail')
  }))
  api.patch('/emails/:id', scope('emails:write'), h(async (req, res) => {
    const b = req.body ?? {}
    // Eski arayüz gövdesiz çağırıp "okundu" yapıyordu
    const patch = b.is_read === undefined && b.triage_status === undefined && b.work_item_id === undefined ? { is_read: true } : b
    if (patch.work_item_id) await A.assertDirect(req.user, ['link'])
    const r = await A.patchEmail(id(req), patch, req.user)
    r ? res.json({ ok: true, ...r }) : notFound(res, 'Mail')
  }))

  // =================== Toplantı ===================
  api.get('/meetings', scope('meetings:read'), h(async (req, res) => res.json(await A.listMeetings(req.query))))
  api.get('/meetings/:id', scope('meetings:read'), h(async (req, res) => {
    const r = await A.getMeeting(id(req))
    r ? res.json(r) : notFound(res, 'Toplantı')
  }))
  api.patch('/meetings/:id', scope('meetings:write'), h(async (req, res) => {
    if (req.body?.work_item_id) await A.assertDirect(req.user, ['link'])
    const r = await A.patchMeeting(id(req), req.body ?? {}, req.user)
    r ? res.json({ ok: true, ...r }) : notFound(res, 'Toplantı')
  }))

  // =================== Kişiler, arama ===================
  api.get('/users', scope('users:read'), h(async (_req, res) => res.json(await A.listUsers())))
  api.get('/search', scope('items:read'), h(async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) return res.status(400).json({ detail: 'q en az 2 karakter', code: 'invalid', field: 'q' })
    res.json(await A.search(q, req.query.types ? String(req.query.types).split(',') : null, req.query.limit))
  }))

  // =================== Ajan: olaylar ===================
  /** Çekme modu: bekleyen olayları kiralar. wait=N → yoksa N saniyeye kadar bekler (long-poll). */
  api.get('/agent/events', scope('events:read'), h(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
    const wait = Math.min(30, Math.max(0, Number(req.query.wait) || 0))
    const types = req.query.types ? String(req.query.types).split(',') : null
    const until = Date.now() + wait * 1000
    let closed = false
    req.on('close', () => { closed = true })
    let rows = await claimEvents(limit, types)
    while (!rows.length && !closed && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1000))
      rows = await claimEvents(limit, types)
    }
    res.json({ delivery: DELIVERY, events: await Promise.all(rows.map(toEnvelope)) })
  }))
  api.post('/agent/events/:id/ack', scope('events:read'), h(async (req, res) => res.json(await A.ackEvent(id(req), req.body ?? {}))))
  api.get('/agent/events/log', humanOnly, h(async (req, res) => res.json(await A.listEvents(req.query))))
  api.post('/agent/events/:id/retry', adminOnly, h(async (req, res) => {
    (await A.retryEvent(id(req))) ? res.json({ ok: true }) : notFound(res, 'Olay')
  }))

  // =================== Ajan: çalışmalar ===================
  api.post('/agent/runs', scope('runs:write'), h(async (req, res) => res.status(201).json(await A.createRun(req.body ?? {}))))
  api.patch('/agent/runs/:id', scope('runs:write'), h(async (req, res) => {
    const r = await A.updateRun(id(req), req.body ?? {})
    r ? res.json(r) : notFound(res, 'Çalışma')
  }))
  api.get('/agent/runs', scope('items:read'), h(async (req, res) => res.json(await A.listRuns(req.query))))
  api.get('/agent/runs/:id', scope('items:read'), h(async (req, res) => {
    const r = await A.getRun(id(req))
    r ? res.json(r) : notFound(res, 'Çalışma')
  }))

  // =================== Ajan: öneriler ===================
  api.post('/agent/actions', scope('actions:write'), h(async (req, res) => {
    const r = await A.proposeAction(req.body ?? {}, req.user)
    res.status(r.applied ? 200 : 202).json(r)
  }))
  api.get('/agent/actions', scope('items:read'), h(async (req, res) => res.json(await A.listActions(req.query))))
  api.post('/agent/actions/:id/approve', humanOnly, scope('items:write'), h(async (req, res) =>
    res.json(await A.decideAction(id(req), true, req.user, { payload: req.body?.payload, note: req.body?.note }))))
  api.post('/agent/actions/:id/reject', humanOnly, scope('items:write'), h(async (req, res) =>
    res.json(await A.decideAction(id(req), false, req.user, { note: req.body?.note }))))

  // =================== Ajan: chat geri yazma (event modu) ===================
  api.post('/agent/chat/messages/:id/chunks', scope('chat:write'), h(async (req, res) => res.json(await C.pushChunk(id(req), req.body ?? {}, req.user))))
  api.put('/agent/chat/messages/:id', scope('chat:write'), h(async (req, res) => res.json(await C.completeMessage(id(req), req.body ?? {}, req.user))))

  // =================== Chat (kullanıcı) ===================
  api.post('/chat/sessions', humanOnly, h(async (req, res) => res.status(201).json(await C.createSession(req.user, req.body ?? {}))))
  api.get('/chat/sessions', humanOnly, h(async (req, res) => res.json(await C.listSessions(req.user))))
  api.get('/chat/sessions/:id/messages', humanOnly, h(async (req, res) => res.json(await C.getMessages(id(req), req.user))))
  api.delete('/chat/sessions/:id', humanOnly, h(async (req, res) => { await C.deleteSession(id(req), req.user); res.status(204).end() }))
  api.post('/chat/sessions/:id/messages', humanOnly, h(async (req, res) => res.status(202).json(await C.postMessage(id(req), req.user, req.body?.text))))
  api.get('/chat/sessions/:id/stream', humanOnly, h(async (req, res) => {
    const sid = id(req)
    await C.ownSession(sid, req.user)
    openSse(req, res, (event, data) => event === 'chat' && data.session_id === sid)
  }))

  // =================== Arayüz için canlı değişiklik akışı ===================
  api.get('/events/stream', humanOnly, (req, res) => { openSse(req, res, (event) => event === 'change') })

  // =================== Ayarlar (yalnız kullanıcı oturumu) ===================
  api.get('/settings/ldap', humanOnly, h(async (_req, res) => res.json(await S.getLdap())))
  api.put('/settings/ldap', humanOnly, h(async (req, res) => { await S.saveLdap(req.body ?? {}, req.user); res.json(await S.getLdap()) }))
  api.post('/settings/ldap/test', humanOnly, h(async (req, res) => {
    // Formdaki (henüz kaydedilmemiş) değerlerle test; şifre maskeliyse kayıtlı şifre kullanılır
    const saved = await loadLdapSettings()
    const cfg = { ...saved, ...req.body }
    if (!req.body?.bind_password || req.body.bind_password === S.MASK) cfg.bind_password = saved.bind_password
    res.json(await ldapTest(cfg))
  }))
  // GenAI Studio (Chat Block): bağlantı bilgileri yalnız ortam değişkeninden; ekran yalnız davranış ayarlarını değiştirir
  api.get('/settings/genai', humanOnly, h(async (_req, res) => res.json(await G.publicConfig())))
  api.put('/settings/genai', adminOnly, h(async (req, res) => res.json(await G.saveConfig(req.body ?? {}, req.user))))
  api.post('/settings/genai/test', adminOnly, h(async (req, res) => res.json(await G.testConnection(req.body ?? {}))))
  api.get('/genai/jobs', scope('items:read'), h(async (req, res) => res.json({ jobs: await G.listJobs(req.query), queue: await G.queueStatus() })))
  api.get('/genai/jobs/:id', humanOnly, h(async (req, res) => {
    const j = (await G.listJobs({ id: id(req), full: true, limit: 1 }))[0]
    j ? res.json(j) : notFound(res, 'Çağrı')
  }))
  api.post('/genai/jobs/:id/retry', humanOnly, h(async (req, res) => {
    const r = await G.retryJob(id(req))
    r ? res.json(r) : res.status(409).json({ detail: 'Bu çağrı tekrar kuyruğa alınamaz', code: 'conflict' })
  }))
  // GenAI test seti (0.9.12): akış dalları + hata senaryoları; arka planda çalışır, GET ile ilerleme okunur
  api.get('/genai/test-suite', humanOnly, h(async (_req, res) => res.json({ scenarios: GT.listTests(), run: GT.testStatus() })))
  api.post('/genai/test-suite', humanOnly, h(async (req, res) => res.status(202).json(await GT.startTests(req.body ?? {}, req.user))))
  api.post('/genai/interpret-open', humanOnly, h(async (req, res) => res.json(await G.enqueueOpen({ onlyMissing: req.body?.only_missing !== false, limit: req.body?.limit }))))
  api.get('/settings/general', humanOnly, h(async (_req, res) => res.json(await S.getGeneral())))
  api.put('/settings/general', humanOnly, h(async (req, res) => { await S.saveGeneral(req.body ?? {}, req.user); res.json(await S.getGeneral()) }))
  api.get('/settings/agent', humanOnly, h(async (_req, res) => res.json({ ...(await A.getAgentSettings()), delivery: DELIVERY, chat_mode: C.CHAT_MODE })))
  api.put('/settings/agent', adminOnly, h(async (req, res) => res.json(await A.saveAgentSettings(req.body ?? {}, req.user))))

  api.post('/settings/api-services', humanOnly, h(async (req, res) => res.status(201).json(await S.createApiConfig({ name: 'Yeni servis', method: 'GET', auth_type: 'none', target: 'generic', ...req.body }))))
  api.put('/settings/api-services/:id', humanOnly, h(async (req, res) => {
    const r = await S.updateApiConfig(id(req), req.body ?? {})
    r ? res.json(r) : notFound(res, 'Servis')
  }))
  api.delete('/settings/api-services/:id', humanOnly, h(async (req, res) => { await S.deleteApiConfig(id(req)); res.status(204).end() }))
  api.post('/settings/api-services/:id/run', humanOnly, h(async (req, res) => res.json(await runNow(id(req)))))
  api.delete('/settings/api-logs', humanOnly, h(async (_req, res) => { await S.clearApiLogs(); res.status(204).end() }))

  // =================== Yönetim ===================
  api.get('/admin/tokens', adminOnly, h(async (_req, res) => res.json(await A.listTokens())))
  api.post('/admin/tokens', adminOnly, h(async (req, res) => {
    const b = req.body ?? {}
    res.status(201).json(await createApiToken({ name: b.name, username: b.username, scopes: b.scopes, expiresDays: b.expires_days ?? null, createdBy: req.user.id }))
  }))
  api.delete('/admin/tokens/:id', adminOnly, h(async (req, res) => { (await A.revokeToken(id(req))) ? res.status(204).end() : notFound(res, 'Token') }))
  api.post('/admin/reset-demo', humanOnly, h(async (_req, res) => {
    await resetDemoData()
    await loadDemoHistory({ force: true })
    res.json({ ok: true })
  }))

  return api
}

/** {detail, code, field?} biçiminde hata cevabı */
export function errorHandler(err, _req, res, _next) {
  if (err.status && err.status < 500) {
    const { status, code, message, stack: _s, ...extra } = err
    return res.status(status).json({ detail: message, code: code ?? 'invalid', ...extra })
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ detail: 'Gövde geçerli JSON değil', code: 'invalid' })
  if (err.code === '23505') return res.status(409).json({ detail: 'Kayıt zaten var (ör. aynı external_ref)', code: 'conflict' })
  console.error('[api]', err)
  const pgCheck = err.code === '23514' || err.code === '22P02' || err.code === '23503' || err.code === '22007' || err.code === '22008'
  res.status(pgCheck ? 400 : 500).json({ detail: pgCheck ? 'Geçersiz değer' : 'Sunucu hatası', code: pgCheck ? 'invalid' : 'internal' })
}
