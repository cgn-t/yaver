import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

// DATE kolonları 'YYYY-MM-DD' metni olarak dönsün (saat dilimi kayması olmasın)
pg.types.setTypeParser(1082, (v) => v)
// BIGINT (id'ler) JS number olarak dönsün — değerler 2^53'ün çok altında
pg.types.setTypeParser(20, (v) => Number(v))

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://yaver:yaver@localhost:5432/yaver',
  max: Number(process.env.DB_POOL_MAX ?? 10),
})

// Postgres konteyneri yeniden başlarsa boştaki bağlantılar düşer; uygulama çökmesin, havuz yeniden bağlansın
pool.on('error', (e) => console.warn('[db] bağlantı koptu, yeniden bağlanılacak:', e.message))

export const query = (text, params) => pool.query(text, params)

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

/** Aynı pod'daki Postgres konteyneri hazır olana kadar bekler. */
export async function waitForDb(timeoutSec = 90) {
  const until = Date.now() + timeoutSec * 1000
  for (;;) {
    try { await query('SELECT 1'); return } catch (e) {
      if (Date.now() > until) throw e
      console.log('[db] veritabanı bekleniyor…', e.code ?? e.message)
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
                   meeting, meeting_participant, api_poll_log RESTART IDENTITY CASCADE`)
    const sql = await fs.readFile(path.join(SQL_DIR, '02-seed.sql'), 'utf8')
    // Seed dosyası kendi BEGIN/COMMIT'ini içerir; burada dış transaction kullanıldığı için çıkarılır.
    // Kullanıcı, API servisi ve ayar satırları ON CONFLICT ile atlanır; API servisleri ikilenmesin diye o blok çalıştırılmaz.
    const body = sql
      .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
      .replace(/INSERT INTO api_poll_config[\s\S]*?;\n/, '')
    await c.query(body)
  })
}
