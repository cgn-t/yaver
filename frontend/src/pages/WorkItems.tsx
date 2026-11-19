import SearchIcon from '@mui/icons-material/Search'
import {
  Box, Button, FormControlLabel, InputAdornment, MenuItem, Paper, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { NewWorkItemDialog, PriorityChip, SourceChip, StatusChip, WorkItemDrawer, formatDate, timeAgo } from '../components/WorkKit'
import { isOpen, isOverdue, PRIORITY_LABEL, SOURCE_LABEL, STATUS_LABEL, useDb } from '../data/store'
import type { WorkItem } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 }

export default function WorkItems() {
  useDocumentTitle('İşler')
  const db = useDb()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('open')
  const [source, setSource] = useState('')
  const [priority, setPriority] = useState('')
  const [assignee, setAssignee] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(params.get('overdue') === '1')
  const [page, setPage] = useState(0)
  const [rpp, setRpp] = useState(25)
  const [selected, setSelected] = useState<WorkItem | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const rows = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr')
    return db.items
      .filter((w) => (status === 'open' ? isOpen(w) : !status || w.status === status))
      .filter((w) => !source || w.source_type === source)
      .filter((w) => !priority || w.priority === priority)
      .filter((w) => !assignee || (assignee === '-' ? !w.assignee : w.assignee === assignee))
      .filter((w) => !overdueOnly || isOverdue(w))
      .filter((w) => !t || `${w.code} ${w.title} ${w.description} ${w.requester ?? ''}`.toLocaleLowerCase('tr').includes(t))
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.created_at.localeCompare(a.created_at))
  }, [db.items, q, status, source, priority, assignee, overdueOnly])

  const sel = (label: string, value: string, set: (v: string) => void, opts: [string, string][], width = 160) => (
    <TextField select size="small" label={label} value={value} sx={{ width }} onChange={(e) => { set(e.target.value); setPage(0) }}>
      {opts.map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
    </TextField>
  )

  return (
    <Box>
      <PageHeader title="İşler" subtitle="Mail, Zoom, API ve manuel kaynaklardan takıma gelen tüm işler"
                  actions={<Button variant="contained" disableElevation onClick={() => setNewOpen(true)}>Yeni İş</Button>} />
      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" placeholder="Ara: kod, başlık, talep eden…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }}
                   sx={{ minWidth: 260, flexGrow: 1 }}
                   slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        {sel('Durum', status, setStatus, [['open', 'Açık olanlar'], ['', 'Tümü'], ...Object.entries(STATUS_LABEL)])}
        {sel('Kaynak', source, setSource, [['', 'Tümü'], ...Object.entries(SOURCE_LABEL)], 130)}
        {sel('Öncelik', priority, setPriority, [['', 'Tümü'], ...Object.entries(PRIORITY_LABEL)], 130)}
        {sel('Atanan', assignee, setAssignee, [['', 'Herkes'], ['-', 'Atanmamış'], ...db.general.team_members.map((u) => [u, u] as [string, string])])}
        <FormControlLabel control={<Switch checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />} label="Termini geçenler" />
      </Paper>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kod</TableCell><TableCell>Başlık</TableCell><TableCell>Kaynak</TableCell><TableCell>Öncelik</TableCell>
                <TableCell>Durum</TableCell><TableCell>Atanan</TableCell><TableCell>Termin</TableCell><TableCell>Güncelleme</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.slice(page * rpp, page * rpp + rpp).map((w) => (
                <TableRow key={w.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(w)}>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{w.code}</TableCell>
                  <TableCell sx={{ maxWidth: 420 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{w.title}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">{w.category} · {w.requester ?? '—'}</Typography>
                  </TableCell>
                  <TableCell><SourceChip source={w.source_type} /></TableCell>
                  <TableCell><PriorityChip priority={w.priority} /></TableCell>
                  <TableCell><StatusChip status={w.status} /></TableCell>
                  <TableCell>{w.assignee ?? <Typography variant="body2" color="warning.main">Atanmadı</Typography>}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: isOverdue(w) ? 'error.main' : undefined, fontWeight: isOverdue(w) ? 700 : undefined }}>
                    {formatDate(w.due_date)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{timeAgo(w.updated_at)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>Filtreye uyan iş yok.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={rows.length} page={page} rowsPerPage={rpp} rowsPerPageOptions={[10, 25, 50, 100]}
                         onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRpp(Number(e.target.value)); setPage(0) }}
                         labelRowsPerPage="Sayfa başına" labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`} />
      </Paper>
      <WorkItemDrawer item={selected} onClose={() => setSelected(null)} />
      <NewWorkItemDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </Box>
  )
}
