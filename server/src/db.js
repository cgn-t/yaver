import fs from 'node:fs/promises'
import path from 'node:path'
import { PGlite, types } from '@electric-sql/pglite'

/**
 * Gömülü veritabanı: PGlite (Node süreci içinde çalışan PostgreSQL).
 * Ayrı bir veritabanı sunucusu/konteyneri YOK — veriler DATA_DIR klasöründe dosya olarak durur
 * (k8s'te bu klasör PVC'ye bağlanır). SQL'in tamamı (şema, örnek veri) aynen geçerlidir.
 * Tek bağlantı: sorgular sırayla çalışır; bu ölçekte (bir takım) fazlasıyla yeterli.
 */
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, '../../data')
const PGDATA = path.join(DATA_DIR, 'pgdata')

export const pglite = new PGlite(PGDATA, {
  parsers: {
    [types.DATE]: (v) => v,           // DATE → 'YYYY-MM-DD' (saat dilimi kayması olmasın)
    [types.INT8]: (v) => Number(v),   // BIGINT id'ler → number (2^53'ün çok altında)
  },
})

const wrap = (r) => ({ rows: r?.rows ?? [], rowCount: r?.affectedRows ?? r?.rows?.length ?? 0, fields: r?.fields })

/**
 * node-postgres ile aynı imza: query(text, params) → { rows, rowCount }.
 * Parametresiz çağrılar (şema/seed dosyaları gibi çok ifadeli SQL) exec ile çalışır; son ifadenin sonucu döner.
 */
async function run(target, text, params) {
  if (params?.length) return wrap(await target.query(text, params))
  const results = await target.exec(text)
  return wrap(results.at(-1))
}

export const query = (text, params) => run(pglite, text, params)

/** Transaction: fn'e { query } verilir; hata olursa geri alınır. */
export function tx(fn) {
  return pglite.transaction((t) => fn({ query: (text, params) => run(t, text, params) }))
}

/** LISTEN/NOTIFY: pg_notify(channel, payload) gelince onMessage(payloadString) çağrılır. Dinlemeyi bırakan fonksiyon döner. */
export function listen(channel, onMessage) {
  return pglite.listen(channel, (payload) => onMessage(payload))
}

/** Gömülü DB'nin açılmasını bekler (ilk açılışta klasörü oluşturur). */
export async function waitForDb() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const started = Date.now()
  await pglite.waitReady
  await query('SELECT 1')
  console.log(`[db] gömülü veritabanı hazır: ${PGDATA} (${Math.round((Date.now() - started) / 1000)} sn)`)
}

/** Kapanırken (SIGTERM) veritabanını düzgün kapat — dosyalar tutarlı kalsın. */
export async function closeDb() {
  try { await pglite.close() } catch { /* zaten kapalı */ }
}
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, async () => {
    console.log(`[db] ${sig}: veritabanı kapatılıyor`)
    await closeDb()
    process.exit(0)
  })
}

const SQL_DIR = process.env.SQL_DIR ?? path.resolve(import.meta.dirname, '../../db/postgres')

/** Şemayı uygular (IF NOT EXISTS) ve tablo boşsa örnek veriyi yükler. */
export async function migrateAndSeed({ seed = true } = {}) {
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
  // Ek şema dosyaları (ör. 03-agent.sql) seed kontrolünden SONRA çalışır: kendi kullanıcılarını eklese de seed atlanmaz
  const extra = (await fs.readdir(SQL_DIR)).filter((f) => /^\d\d-.*\.sql$/.test(f) && !['01-schema.sql', '02-seed.sql'].includes(f)).sort()
  for (const f of extra) {
    await query(await fs.readFile(path.join(SQL_DIR, f), 'utf8'))
    console.log(`[db] ${f} uygulandı`)
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
  const sql = await fs.readFile(path.join(SQL_DIR, '02-seed.sql'), 'utf8')
  // Seed dosyasının BEGIN/COMMIT'i çıkarılıp tek bir BEGIN…COMMIT içinde silme + yükleme yapılır.
  // Kullanıcı ve ayar satırları ON CONFLICT ile atlanır; API servisleri ikilenmesin diye o blok çalıştırılmaz.
  const body = sql
    .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
    .replace(/INSERT INTO api_poll_config[\s\S]*?;\n/, '')
  // Ajan tabloları (03-agent.sql) kuruluysa onlar da temizlenir
  const { rows } = await query(`SELECT string_agg(quote_ident(table_name), ', ') AS t FROM information_schema.tables
                                WHERE table_schema = 'public' AND table_name IN ('agent_event', 'agent_run')`)
  const agentTables = rows[0]?.t ? `, ${rows[0].t}` : ''
  try {
    await pglite.exec(`BEGIN;
      TRUNCATE work_item, work_item_tag, work_item_activity, email, email_attachment,
               meeting, meeting_participant, api_poll_log${agentTables} RESTART IDENTITY CASCADE;
      ${body}
      COMMIT;`)
  } catch (e) {
    await pglite.exec('ROLLBACK').catch(() => {})
    throw e
  }
}
