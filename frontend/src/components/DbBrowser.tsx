import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import TableChartIcon from '@mui/icons-material/TableChartOutlined'
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, backend, getToken } from '../data/store'
import { MONO_FONT } from '../theme'

type Col = { name: string; type: string; secret: boolean }
type TableMeta = { name: string; rows: number; columns: Col[] }
type Page = { table: string; columns: Col[]; total: number; limit: number; offset: number; rows: Record<string, unknown>[] }

/** Hücre gösterimi: tarih, JSON, dizi, boolean ve uzun metin okunur kısaltılır. */
function cellText(v: unknown, type: string): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  if (/timestamp/.test(type) && !Number.isNaN(Date.parse(s))) return new Date(s).toLocaleString('tr-TR')
  return s
}

/**
 * Veritabanı (salt okunur, yalnız yönetici): sol tarafta tablolar ve satır sayıları; sağda seçili tablonun satırları.
 * Arama tüm (gizli olmayan) kolonlarda, sıralama kolon başlığına tıklayarak, satıra tıklayınca tüm alanlar.
 * Gizli alanlar (şifre hash'i, token, sır) sunucuda maskelenir.
 */
export default function DbBrowser({ base = '/admin/db' }: { base?: string }) {
  const { enqueueSnackbar } = useSnackbar()
  const [tables, setTables] = useState<TableMeta[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<string>('work_item')
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [pageNo, setPageNo] = useState(0)
  const [size, setSize] = useState(50)
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const loadTables = useCallback(async () => {
    try { setTables((await apiFetch<{ tables: TableMeta[] }>(`${base}/tables`)).tables); setErr(null) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [base])
  useEffect(() => { if (backend === 'api') void loadTables() }, [loadTables])

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: String(size), offset: String(pageNo * size) })
      if (q) p.set('q', q)
      if (sort) { p.set('sort', sort.col); p.set('dir', sort.dir) }
      setPage(await apiFetch<Page>(`${base}/tables/${encodeURIComponent(sel)}?${p}`))
    } catch (e) { enqueueSnackbar(e instanceof Error ? e.message : String(e), { variant: 'error' }) } finally { setLoading(false) }
  }, [base, sel, q, sort, pageNo, size, enqueueSnackbar])
  useEffect(() => { if (backend === 'api' && tables) void loadRows() }, [loadRows, tables])

  // Arama kutusu: yazmayı bıraktıktan 350 ms sonra
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPageNo(0) }, 350); return () => clearTimeout(t) }, [qInput])

  const pick = (name: string) => { setSel(name); setSort(null); setPageNo(0); setQInput(''); setQ('') }
  const shown = useMemo(() => (tables ?? []).filter((t) => t.name.includes(filter.trim().toLowerCase())), [tables, filter])
  const totalRows = useMemo(() => (tables ?? []).reduce((s, t) => s + t.rows, 0), [tables])

  const download = async (format: 'csv' | 'json') => {
    try {
      const p = new URLSearchParams({ format })
      if (q) p.set('q', q)
      if (sort) { p.set('sort', sort.col); p.set('dir', sort.dir) }
      const r = await fetch(`/api${base}/tables/${encodeURIComponent(sel)}/export?${p}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
      if (!r.ok) throw new Error(`Dışa aktarma başarısız (HTTP ${r.status})`)
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url; a.download = `${sel}.${format}`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { enqueueSnackbar(e instanceof Error ? e.message : String(e), { variant: 'error' }) }
  }

  if (backend !== 'api') return <Alert severity="info">Veritabanı görünümü sunucu bağlıyken çalışır.</Alert>
  if (err) return <Alert severity="error">{err}</Alert>
  if (!tables) return <CircularProgress size={22} />

  const cols = page?.columns ?? tables.find((t) => t.name === sel)?.columns ?? []
  const toggleSort = (c: Col) => {
    if (c.secret) return
    setPageNo(0)
    setSort((s) => (s?.col === c.name ? (s.dir === 'desc' ? { col: c.name, dir: 'asc' } : null) : { col: c.name, dir: 'desc' }))
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '240px 1fr' }, gap: 2, alignItems: 'start' }}>
      {/* Tablolar */}
      <Paper variant="outlined" sx={{ p: 1, position: { lg: 'sticky' }, top: { lg: 80 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 0.5, pb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
            {tables.length} tablo · {totalRows.toLocaleString('tr-TR')} satır
          </Typography>
          <Tooltip title="Yenile"><IconButton size="small" onClick={() => { void loadTables() }}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
        <TextField size="small" fullWidth placeholder="Tablo ara" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ mb: 1 }} />
        <Box sx={{ maxHeight: { lg: 'calc(100vh - 260px)' }, overflowY: 'auto' }}>
          {shown.map((t) => {
            const on = t.name === sel
            return (
              <ButtonBase key={t.name} onClick={() => pick(t.name)}
                          sx={(th) => ({ display: 'flex', width: '100%', gap: 1, px: 1, height: 32, borderRadius: 1.5, justifyContent: 'flex-start',
                                         bgcolor: on ? alpha(th.palette.primary.main, 0.08) : 'transparent', color: on ? 'primary.main' : 'text.primary',
                                         '&:hover': { bgcolor: on ? alpha(th.palette.primary.main, 0.1) : 'action.hover' } })}>
                <TableChartIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                <Typography noWrap sx={{ flex: 1, textAlign: 'left', fontSize: 13, fontFamily: MONO_FONT, fontWeight: on ? 600 : 400 }}>{t.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{t.rows.toLocaleString('tr-TR')}</Typography>
              </ButtonBase>
            )
          })}
        </Box>
      </Paper>

      {/* Satırlar */}
      <Paper variant="outlined" sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 650, fontSize: 15 }}>{sel}</Typography>
          <Typography variant="caption" color="text.secondary">
            {page ? `${page.total.toLocaleString('tr-TR')} satır${q ? ' (aramaya uyan)' : ''} · ${cols.length} kolon` : ''}
          </Typography>
          {loading && <CircularProgress size={14} />}
          <Box sx={{ flex: 1 }} />
          <TextField size="small" placeholder="Tüm kolonlarda ara" value={qInput} onChange={(e) => setQInput(e.target.value)} sx={{ width: { xs: '100%', sm: 260 } }}
                     slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <Button size="small" startIcon={<DownloadIcon />} onClick={() => void download('csv')}>CSV</Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={() => void download('json')}>JSON</Button>
        </Box>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {cols.map((c) => (
                  <TableCell key={c.name} onClick={() => toggleSort(c)}
                             sx={{ whiteSpace: 'nowrap', cursor: c.secret ? 'default' : 'pointer', userSelect: 'none', fontFamily: MONO_FONT, fontSize: 12 }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      {c.name}
                      {c.secret && <Tooltip title="Gizli alan: maskelenir, aramaya katılmaz"><LockIcon sx={{ fontSize: 13, color: 'text.disabled' }} /></Tooltip>}
                      {sort?.col === c.name && (sort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: 13 }} /> : <ArrowDownwardIcon sx={{ fontSize: 13 }} />)}
                    </Box>
                    <Typography component="div" sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'inherit' }}>{c.type}</Typography>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {page?.rows.map((r, i) => (
                <TableRow key={i} hover sx={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                  {cols.map((c) => {
                    const t = cellText(r[c.name], c.type)
                    return (
                      <TableCell key={c.name} title={t.length > 60 ? t.slice(0, 1000) : undefined}
                                 sx={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12.5,
                                       color: r[c.name] === null ? 'text.disabled' : c.secret ? 'text.secondary' : 'text.primary' }}>
                        {r[c.name] === null ? 'null' : t}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
              {page && !page.rows.length && (
                <TableRow><TableCell colSpan={cols.length || 1}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Kayıt yok.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={page?.total ?? 0} page={pageNo} rowsPerPage={size} rowsPerPageOptions={[25, 50, 100, 200]}
                         onPageChange={(_e, p) => setPageNo(p)} onRowsPerPageChange={(e) => { setSize(Number(e.target.value)); setPageNo(0) }}
                         labelRowsPerPage="Sayfa başına" labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`} />
      </Paper>

      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontFamily: MONO_FONT, fontSize: 15 }}>{sel}{detail && 'id' in detail ? ` #${String(detail.id)}` : ''}</DialogTitle>
        <DialogContent dividers>
          {detail && cols.map((c) => (
            <Box key={c.name} sx={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontFamily: MONO_FONT, fontSize: 12.5, color: 'text.secondary' }}>{c.name}</Typography>
              <Typography component="pre" sx={{ m: 0, fontFamily: typeof detail[c.name] === 'object' ? MONO_FONT : 'inherit', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {detail[c.name] === null ? 'null' : typeof detail[c.name] === 'object' ? JSON.stringify(detail[c.name], null, 2) : cellText(detail[c.name], c.type)}
              </Typography>
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
