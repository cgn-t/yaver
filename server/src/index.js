import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { migrateAndSeed, query, resetDemoData, waitForDb } from './db.js'
import { ldapTest, loadLdapSettings, login, requireAuth } from './auth.js'
import * as S from './state.js'
import { runNow, startPoller } from './poller.js'

const PORT = Number(process.env.PORT ?? 8080)
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../frontend/dist')
const DEMO_FEEDS = process.env.DEMO_FEEDS !== 'false'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

// async route hatalarını tek yerde yakala
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const id = (req) => Number(req.params.id)

// ---------- Açık uçlar ----------
app.get('/api/health', h(async (_req, res) => {
  await query('SELECT 1')
  res.json({ ok: true, mode: 'db' })
}))

app.post('/api/auth/login', h(async (req, res) => {
  const r = await login(req.body?.username, req.body?.password)
  if (!r) return res.status(401).json({ detail: 'Kullanıcı adı veya şifre hatalı' })
  res.json(r)
}))

// Örnek entegrasyon kaynakları: hazır gelen "Mail kutusu senkronu" / "Zoom toplantı senkronu" servisleri buraya bakar.
// Gerçek kurulumda servis URL'leri Exchange/Graph veya Zoom API ara katmanınıza yönlendirilir; DEMO_FEEDS=false ile kapatılır.
if (DEMO_FEEDS) {
  const SENDERS = [['Deniz Arslan', 'deniz.arslan'], ['Elif Şahin', 'elif.sahin'], ['Murat Aydın', 'murat.aydin'], ['Gizem Yıldız', 'gizem.yildiz']]
  const SUBJECTS = ['Raporda tutarsızlık var', 'Test ortamına erişim', 'Fatura servisi hata veriyor', 'Yeni alan talebi', 'Toplantı notları ektedir']
  // 5 dakikada bir yeni bir mail "gelir"; aynı pencere içinde tekrar çağrılınca aynı message_id döner → çift kayıt olmaz
  app.get('/api/integrations/mail/sync', (_req, res) => {
    const slot = Math.floor(Date.now() / 300_000)
    const [name, user] = SENDERS[slot % SENDERS.length]
    res.json({ items: [{
      message_id: `<demo-${slot}@yaver.local>`, from_name: name, from_address: `${user}@firma.com`, to_addresses: ['takim@firma.com'],
      subject: SUBJECTS[slot % SUBJECTS.length], body_preview: 'Merhaba ekip, bu mail örnek entegrasyon servisi tarafından üretildi.',
      importance: slot % 3 === 0 ? 'high' : 'normal', received_at: new Date(slot * 300_000).toISOString(),
    }] })
  })
  app.get('/api/integrations/zoom/sync', (_req, res) => {
    const day = Math.floor(Date.now() / 86_400_000)
    const start = new Date((day + 1) * 86_400_000 + 7 * 3600_000).toISOString()   // yarın 10:00 (TR)
    res.json({ meetings: [], items: [{
      id: `9${String(day).slice(-4)} 1100 2200`, uuid: `demo-${day}`, topic: 'Günlük stand-up', agenda: 'Dün / bugün / engeller',
      host_email: 'ayse.yilmaz@firma.com', host_name: 'Ayşe Yılmaz', start_time: start, duration: 15, join_url: 'https://zoom.us/j/000',
      participants: [{ name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@firma.com' }, { name: 'Mehmet Kaya', email: 'mehmet.kaya@firma.com' }],
    }] })
  })
}

// ---------- Oturum gerektiren uçlar ----------
const api = express.Router()
api.use(requireAuth)

api.get('/me', (req, res) => res.json(req.user))
api.get('/state', h(async (_req, res) => res.json(await S.getState())))

api.post('/work-items', h(async (req, res) => {
  if (!req.body?.title?.trim()) return res.status(400).json({ detail: 'Başlık zorunlu' })
  res.status(201).json(await S.createWorkItem(req.body, req.user))
}))
api.patch('/work-items/:id', h(async (req, res) => {
  const r = await S.updateWorkItem(id(req), req.body ?? {}, req.user)
  r ? res.json(r) : res.status(404).json({ detail: 'İş bulunamadı' })
}))
api.post('/work-items/:id/comments', h(async (req, res) => {
  if (!req.body?.text?.trim()) return res.status(400).json({ detail: 'Yorum boş olamaz' })
  await S.addComment(id(req), req.body.text.trim(), req.user)
  res.status(201).json({ ok: true })
}))

api.patch('/emails/:id', h(async (req, res) => { await S.markEmailRead(id(req), req.body?.is_read ?? true); res.json({ ok: true }) }))
api.patch('/meetings/:id', h(async (req, res) => { await S.updateMeeting(id(req), req.body ?? {}); res.json({ ok: true }) }))

api.get('/settings/ldap', h(async (_req, res) => res.json(await S.getLdap())))
api.put('/settings/ldap', h(async (req, res) => { await S.saveLdap(req.body ?? {}, req.user); res.json(await S.getLdap()) }))
api.post('/settings/ldap/test', h(async (req, res) => {
  // Formdaki (henüz kaydedilmemiş) değerlerle test; şifre maskeliyse kayıtlı şifre kullanılır
  const saved = await loadLdapSettings()
  const cfg = { ...saved, ...req.body }
  if (!req.body?.bind_password || req.body.bind_password === S.MASK) cfg.bind_password = saved.bind_password
  res.json(await ldapTest(cfg))
}))
api.get('/settings/general', h(async (_req, res) => res.json(await S.getGeneral())))
api.put('/settings/general', h(async (req, res) => { await S.saveGeneral(req.body ?? {}, req.user); res.json(await S.getGeneral()) }))

api.post('/settings/api-services', h(async (req, res) => res.status(201).json(await S.createApiConfig({ name: 'Yeni servis', method: 'GET', auth_type: 'none', target: 'generic', ...req.body }))))
api.put('/settings/api-services/:id', h(async (req, res) => {
  const r = await S.updateApiConfig(id(req), req.body ?? {})
  r ? res.json(r) : res.status(404).json({ detail: 'Servis bulunamadı' })
}))
api.delete('/settings/api-services/:id', h(async (req, res) => { await S.deleteApiConfig(id(req)); res.status(204).end() }))
api.post('/settings/api-services/:id/run', h(async (req, res) => res.json(await runNow(id(req)))))
api.delete('/settings/api-logs', h(async (_req, res) => { await S.clearApiLogs(); res.status(204).end() }))

api.post('/admin/reset-demo', h(async (_req, res) => { await resetDemoData(); res.json({ ok: true }) }))

app.use('/api', api)
app.use('/api', (_req, res) => res.status(404).json({ detail: 'Bulunamadı' }))

// ---------- Arayüz (React build) ----------
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }))
  app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')))   // SPA yönlendirmesi
} else {
  console.warn(`[web] ${STATIC_DIR} yok — yalnız API sunuluyor`)
}

app.use((err, _req, res, _next) => {
  console.error('[api]', err)
  const pgCheck = err.code === '23514' || err.code === '22P02' || err.code === '23503'
  res.status(pgCheck ? 400 : 500).json({ detail: pgCheck ? 'Geçersiz değer' : 'Sunucu hatası' })
})

await waitForDb()
await migrateAndSeed({ seed: process.env.SEED !== 'false' })
startPoller()
app.listen(PORT, () => console.log(`[web] Yaver http://0.0.0.0:${PORT} adresinde`))
