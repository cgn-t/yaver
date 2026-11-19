import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { migrateAndSeed, query, waitForDb } from './db.js'
import { bootstrapAgentToken, login } from './auth.js'
import { startPoller } from './poller.js'
import { apiRouter, errorHandler } from './routes.js'
import { loadDemoHistory } from './demo.js'
import { startDispatcher, startEventCleanup, startEventListener } from './events.js'

const PORT = Number(process.env.PORT ?? 8080)
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../frontend/dist')
const DEMO_FEEDS = process.env.DEMO_FEEDS !== 'false'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

// async route hatalarını tek yerde yakala
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// ---------- Açık uçlar ----------
// DB hazır olana kadar sunucu yine açıktır: /api/health 503 + neden döner, arayüz "veritabanı bekleniyor" gösterir.
let ready = false
let startupError = 'veritabanı bekleniyor'
app.get('/api/health', async (_req, res) => {
  const version = process.env.APP_VERSION ?? 'dev'
  if (!ready) return res.status(503).json({ ok: false, mode: 'db', version, detail: startupError })
  try { await query('SELECT 1'); res.json({ ok: true, mode: 'db', version }) } catch (e) {
    res.status(503).json({ ok: false, mode: 'db', version, detail: `veritabanı erişilemiyor: ${e.message}` })
  }
})
app.use('/api', (req, res, next) =>
  ready ? next() : res.status(503).json({ detail: `Sunucu hazır değil: ${startupError}` }))

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

// ---------- Oturum / ajan token'ı gerektiren uçlar (routes.js) ----------
app.use('/api', apiRouter())
app.use('/api', (_req, res) => res.status(404).json({ detail: 'Bulunamadı', code: 'not_found' }))

// ---------- Arayüz (React build) ----------
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }))
  app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')))   // SPA yönlendirmesi
} else {
  console.warn(`[web] ${STATIC_DIR} yok — yalnız API sunuluyor`)
}

app.use(errorHandler)

app.listen(PORT, () => console.log(`[web] Yaver ${process.env.APP_VERSION ?? 'dev'} http://0.0.0.0:${PORT} adresinde`))
await waitForDb()
startupError = 'tablolar hazırlanıyor'
await migrateAndSeed({ seed: process.env.SEED !== 'false' })
await bootstrapAgentToken()
if (process.env.SEED !== 'false') await loadDemoHistory().catch((e) => console.error('[demo]', e))
await startEventListener()
ready = true
startPoller()
startDispatcher()
startEventCleanup()
