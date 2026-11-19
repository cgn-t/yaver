import express from 'express'
import { query } from './db.js'
import { httpError } from './state.js'

/**
 * Veritabanı görüntüleyici (0.9.10): yalnız yönetici, SALT OKUNUR.
 * Tablo listesi + satır sayısı, sayfalı / aranabilir / sıralanabilir satırlar, CSV / JSON dışa aktarma.
 * Yazma, silme ya da serbest SQL yoktur. Tablo ve kolon adları information_schema'dan doğrulanır.
 *
 * Gizli alanlar her zaman maskelenir ve aramaya katılmaz:
 *   şifre hash'i, token hash'i, API servisi sırrı / auth başlığı / ek başlıklar, "is_secret" ayarların değeri,
 *   adında password / secret / token_hash / cookie geçen kolonlar.
 */

export const MASK = '••••••••'
const SECRET_COLUMNS = new Set(['password_hash', 'token_hash', 'auth_secret', 'auth_header', 'headers_json', 'bind_password', 'client_secret'])
const isSecretColumn = (c) => SECRET_COLUMNS.has(c) || (/(password|secret|token_hash|cookie|api_key)/i.test(c) && c !== 'is_secret')
const SECRET_SETTING_KEY = /(password|secret|token|cookie|api_key)/i
const MAX_LIMIT = 500
const EXPORT_LIMIT = 50_000

async function tableInfo() {
  const cols = (await query(
    `SELECT table_name AS t, column_name AS c, data_type AS type, ordinal_position AS pos
     FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows
  const map = new Map()
  for (const r of cols) {
    if (!map.has(r.t)) map.set(r.t, [])
    map.get(r.t).push({ name: r.c, type: r.type, secret: isSecretColumn(r.c) })
  }
  return map
}

const qi = (name) => `"${String(name).replace(/"/g, '""')}"`

async function resolveTable(name) {
  const info = await tableInfo()
  const cols = info.get(String(name))
  if (!cols) throw httpError(404, 'not_found', `Tablo bulunamadı: ${name}`)
  return { table: String(name), cols }
}

/** Satırlardaki gizli değerleri maskeler. */
function maskRows(table, cols, rows) {
  const secret = cols.filter((c) => c.secret).map((c) => c.name)
  return rows.map((r) => {
    const o = { ...r }
    for (const c of secret) if (o[c] !== null && o[c] !== undefined && o[c] !== '') o[c] = MASK
    if (table === 'app_setting' && o.value && (o.is_secret || SECRET_SETTING_KEY.test(String(o.key ?? '')))) o.value = MASK
    return o
  })
}

/** Tablolar: ad, satır sayısı, kolonlar (gizli olanlar işaretli). */
export async function listTables() {
  const info = await tableInfo()
  const out = []
  for (const [t, cols] of info) {
    const n = (await query(`SELECT count(*)::int AS n FROM ${qi(t)}`)).rows[0].n
    out.push({ name: t, rows: n, columns: cols })
  }
  return { tables: out.sort((a, b) => a.name.localeCompare(b.name)), mask: MASK }
}

function whereSearch(cols, q, vals) {
  const text = String(q ?? '').trim()
  if (!text) return ''
  const searchable = cols.filter((c) => !c.secret).map((c) => `coalesce(${qi(c.name)}::text, '')`)
  if (!searchable.length) return ''
  vals.push(`%${text}%`)
  return `WHERE concat_ws(' ', ${searchable.join(', ')}) ILIKE $${vals.length}`
}

function orderBy(cols, sort, dir) {
  const c = cols.find((x) => x.name === sort && !x.secret)
  const d = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  if (c) return `ORDER BY ${qi(c.name)} ${d} NULLS LAST`
  // Varsayılan: varsa id'ye göre yeniden eskiye
  return cols.some((x) => x.name === 'id') ? 'ORDER BY "id" DESC' : ''
}

/** q: { limit=50, offset=0, q (arama), sort (kolon), dir (asc|desc) } */
export async function tableRows(name, q = {}) {
  const { table, cols } = await resolveTable(name)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 50))
  const offset = Math.max(0, Number(q.offset) || 0)
  const vals = []
  const where = whereSearch(cols, q.q, vals)
  const total = (await query(`SELECT count(*)::int AS n FROM ${qi(table)} ${where}`, vals)).rows[0].n
  const rows = (await query(`SELECT * FROM ${qi(table)} ${where} ${orderBy(cols, q.sort, q.dir)} LIMIT ${limit} OFFSET ${offset}`, vals)).rows
  return { table, columns: cols, total, limit, offset, rows: maskRows(table, cols, rows) }
}

const csvCell = (v) => {
  if (v === null || v === undefined) return ''
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Tüm satırlar (arama/sıralama uygulanır), CSV ya da JSON. */
export async function exportTable(name, q = {}) {
  const { table, cols } = await resolveTable(name)
  const vals = []
  const where = whereSearch(cols, q.q, vals)
  const rows = maskRows(table, cols, (await query(`SELECT * FROM ${qi(table)} ${where} ${orderBy(cols, q.sort, q.dir)} LIMIT ${EXPORT_LIMIT}`, vals)).rows)
  if (String(q.format).toLowerCase() === 'json') return { type: 'application/json', name: `${table}.json`, body: JSON.stringify(rows, null, 2) }
  const head = cols.map((c) => c.name)
  const lines = [head.join(','), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(','))]
  return { type: 'text/csv; charset=utf-8', name: `${table}.csv`, body: '﻿' + lines.join('\r\n') }   // BOM: Excel Türkçe karakterleri doğru açar
}

/**
 * Girişsiz (herkese açık) salt okunur erişim: DB_PUBLIC=true ise /api/public/db/... token istemez.
 * Kapalıyken 403 döner. Gizli alanlar burada da maskelenir; yazma ucu yoktur.
 */
export const isPublic = () => process.env.DB_PUBLIC === 'true'
export function publicDbRouter() {
  const r = express.Router()
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
  r.use((_req, res, next) => isPublic() ? next()
    : res.status(403).json({ detail: 'Herkese açık veritabanı görünümü kapalı. Açmak için ortam değişkeni: DB_PUBLIC=true', code: 'forbidden' }))
  r.get('/tables', h(async (_req, res) => res.json(await listTables())))
  r.get('/tables/:name', h(async (req, res) => res.json(await tableRows(req.params.name, req.query))))
  r.get('/tables/:name/export', h(async (req, res) => {
    const f = await exportTable(req.params.name, req.query)
    res.setHeader('Content-Type', f.type)
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`)
    res.send(f.body)
  }))
  return r
}
