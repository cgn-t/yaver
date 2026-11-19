import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

// DATE kolonları 'YYYY-MM-DD' metni olarak dönsün (saat dilimi kayması olmasın)
pg.types.setTypeParser(1082, (v) => v)
// BIGINT (id'ler) JS number olarak dönsün — değerler 2^53'ün çok altında
pg.types.setTypeParser(20, (v) => Number(v))

// Bağlantı: DATABASE_URL verilirse o, yoksa ayrı PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE değişkenleri.
// Ayrı değişkenler önerilir: şifrede @ : / # gibi karakterler olsa da URL bozulmaz.
const env = process.env
export const pool = new pg.Pool({
  ...(env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : { host: env.PGHOST ?? '127.0.0.1', port: Number(env.PGPORT ?? 5432), user: env.PGUSER ?? 'yaver',
        password: env.PGPASSWORD ?? 'yaver', database: env.PGDATABASE ?? 'yaver' }),
  max: Number(env.DB_POOL_MAX ?? 10),
  connectionTimeoutMillis: 5000,
})

// Postgres konteyneri yeniden başlarsa boştaki bağlantılar düşer; uygulama çökmesin, havuz yeniden bağlansın
pool.on('error', (e) => console.warn('[db] bağlantı koptu, yeniden bağlanılacak:', e.message))

export const query = (text, params) => pool.query(text, params)

/**
 * LISTEN için havuzdan ayrı, kalıcı bağlantı; koparsa 3 sn sonra yeniden bağlanır.
 * pg_notify, transaction commit olduğunda iletilir → geri alınan değişiklik için bildirim gitmez.
 */
export function listen(channel, onMessage) {
  const connect = async () => {
    const c = new pg.Client(pool.options)
    let retried = false
    const retry = (e) => {
      if (retried) return
      retried = true
      console.warn(`[db] LISTEN ${channel} koptu: ${e.message}`)
      c.end().catch(() => {})
      setTimeout(connect, 3000)
    }
    c.on('error', retry)
    c.on('notification', (m) => onMessage(m.payload))
    try { await c.connect(); await c.query(`LISTEN ${channel}`) } catch (e) { retry(e) }
  }
  return connect()
}

export async function tx(fn) {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

// Bekleme sırasında hatanın gerçek nedenini ve çözümünü yaz (loglarda "neden bekliyor" görünsün)
const DB_HINTS = {
  ECONNREFUSED: 'Postgres henüz dinlemiyor ya da çöktü → postgres konteynerinin loguna bakın (kubectl logs ... -c postgres).',
  ENOTFOUND: 'DB adresi çözülemedi → PGHOST / DATABASE_URL değerini kontrol edin (tek pod kurulumunda 127.0.0.1).',
  ETIMEDOUT: 'DB adresine ulaşılamıyor → PGHOST / port değerini kontrol edin.',
  '28P01': 'ŞİFRE HATALI. Secret\'taki POSTGRES_PASSWORD, veritabanı İLK oluşturulurken kullanılan şifreyle aynı değil. '
         + 'Postgres şifreyi yalnız ilk açılışta (boş diskte) ayarlar; sonradan Secret\'ı değiştirmek DB\'yi değiştirmez.',
  '3D000': 'Veritabanı yok → POSTGRES_DB ile PGDATABASE aynı olmalı (yaver).',
  '57P03': 'Postgres açılıyor (startup/recovery), birkaç saniye içinde düzelir.',
}

/** Aynı pod'daki Postgres konteyneri hazır olana kadar bekler (süresiz; her 15 sn'de bir nedeni loglar). */
export async function waitForDb() {
  const started = Date.now()
  let last = ''
  let lastLog = 0
  for (;;) {
    try {
      await query('SELECT 1')
      console.log(`[db] bağlantı tamam (${Math.round((Date.now() - started) / 1000)} sn)`)
      return
    } catch (e) {
      const code = e.code ?? (e.message?.includes('timeout') ? 'ETIMEDOUT' : 'HATA')
      const msg = `[db] veritabanı bekleniyor… ${code}: ${e.message}${DB_HINTS[code] ? `\n     → ${DB_HINTS[code]}` : ''}`
      if (msg !== last || Date.now() - lastLog > 15000) { console.log(msg); last = msg; lastLog = Date.now() }
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

const SQL_DIR = process.env.SQL_DIR ?? path.resolve(import.meta.dirname, '../../db/postgres')

/** Şemayı uygular (IF NOT EXISTS) ve tablo boşsa örnek veriyi yükler. */
export async function migrateAndSeed({ seed = true } = {}) {
  // Birden fazla replika aynı anda başlarsa sırayla çalışsın
  await query('SELECT pg_advisory_lock(424242)')
  try {
    await query(await fs.readFile(path.join(SQL_DIR, '01-schema.sql'), 'utf8'))
    console.log('[db] şema hazır')
    const { rows } = await query('SELECT count(*)::int AS n FROM app_user')
    if (rows[0].n === 0) {
      if (seed) {
        await query(await fs.readFile(path.join(SQL_DIR, '02-seed.sql'), 'utf8'))
        console.log('[db] örnek veri yüklendi (02-seed.sql)')
      } else {
        await ensureAdmin()
      }
    }
    // Ajan tabloları seed kontrolünden SONRA: 03 dosyası yaver-ajan kullanıcısını ekler, app_user boş görünmezdi
    await query(await fs.readFile(path.join(SQL_DIR, '03-agent.sql'), 'utf8'))
    console.log('[db] ajan tabloları hazır')
  } finally {
    await query('SELECT pg_advisory_unlock(424242)')
  }
}

/** SEED=false ile boş kurulumda da admin/admin ile girilebilsin. */
async function ensureAdmin() {
  const { hashPassword } = await import('./auth.js')
  await query(
    `INSERT INTO app_user (username, full_name, email, auth_source, password_hash, role)
     VALUES ('admin', 'Yönetici', 'admin@firma.com', 'local', $1, 'admin') ON CONFLICT (username) DO NOTHING`,
    [hashPassword(process.env.ADMIN_PASSWORD ?? 'admin')],
  )
  console.log('[db] boş kurulum: admin kullanıcısı oluşturuldu')
}

/** Ayarlar > Genel > "Demo verisini sıfırla": iş/mail/toplantı verisini silip örnek veriyi yeniden yükler. */
export async function resetDemoData() {
  await tx(async (c) => {
    await c.query(`TRUNCATE work_item, work_item_tag, work_item_activity, email, email_attachment,
                   meeting, meeting_participant, api_poll_log, agent_event, agent_run RESTART IDENTITY CASCADE`)
    const sql = await fs.readFile(path.join(SQL_DIR, '02-seed.sql'), 'utf8')
    // Seed dosyası kendi BEGIN/COMMIT'ini içerir; burada dış transaction kullanıldığı için çıkarılır.
    // Kullanıcı, API servisi ve ayar satırları ON CONFLICT ile atlanır; API servisleri ikilenmesin diye o blok çalıştırılmaz.
    const body = sql
      .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
      .replace(/INSERT INTO api_poll_config[\s\S]*?;\n/, '')
    await c.query(body)
  })
}
