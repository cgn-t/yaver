import AttachFileIcon from '@mui/icons-material/AttachFile'
import CloseIcon from '@mui/icons-material/Close'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import SearchIcon from '@mui/icons-material/Search'
import {
  Box, Button, Chip, Drawer, IconButton, InputAdornment, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { NewWorkItemDialog, StatusChip, WorkItemDrawer, formatDateTime, timeAgo } from '../components/WorkKit'
import { markEmailRead, useDb, type NewWorkItem } from '../data/store'
import type { Email, WorkItem } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function Emails() {
  useDocumentTitle('E-postalar')
  const db = useDb()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [rpp, setRpp] = useState(25)
  const [openId, setOpenId] = useState<number | null>(null)
  const [convert, setConvert] = useState<Partial<NewWorkItem> | undefined>()
  const [item, setItem] = useState<WorkItem | null>(null)

  const rows = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr')
    return db.emails
      .filter((e) => filter === 'all' || (filter === 'unread' ? !e.is_read : filter === 'untracked' ? !e.work_item_id : !!e.work_item_id))
      .filter((e) => !t || `${e.subject} ${e.from_name} ${e.from_address} ${e.body_preview}`.toLocaleLowerCase('tr').includes(t))
      .sort((a, b) => b.received_at.localeCompare(a.received_at))
  }, [db.emails, q, filter])

  const mail = db.emails.find((e) => e.id === openId) ?? null
  const linked = mail?.work_item_id ? db.items.find((w) => w.id === mail.work_item_id) : undefined

  const openMail = (e: Email) => { setOpenId(e.id); if (!e.is_read) markEmailRead(e.id) }
  const toWork = (e: Email) => setConvert({
    title: e.subject, description: `${e.from_name} <${e.from_address}>\n\n${e.body_preview}`, source_type: 'mail', source_id: e.id,
    requester: e.from_name, priority: e.importance === 'high' ? 'high' : 'normal', category: 'Talep',
  })

  return (
    <Box>
      <PageHeader title="E-postalar" subtitle={`${db.general.mailbox} kutusuna gelen mailler — her mail tek tıkla işe dönüştürülebilir`} />
      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Ara: konu, gönderen, içerik…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }}
                   sx={{ minWidth: 260, flexGrow: 1 }}
                   slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" label="Göster" value={filter} sx={{ width: 200 }} onChange={(e) => { setFilter(e.target.value); setPage(0) }}>
          <MenuItem value="all">Tümü</MenuItem><MenuItem value="unread">Okunmamış</MenuItem>
          <MenuItem value="untracked">İşe dönüşmemiş</MenuItem><MenuItem value="tracked">İşe bağlı</MenuItem>
        </TextField>
      </Paper>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Gönderen</TableCell><TableCell>Konu</TableCell><TableCell>Alındı</TableCell><TableCell>İş</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.slice(page * rpp, page * rpp + rpp).map((e) => {
                const w = e.work_item_id ? db.items.find((x) => x.id === e.work_item_id) : undefined
                return (
                  <TableRow key={e.id} hover sx={{ cursor: 'pointer' }} onClick={() => openMail(e)}>
                    <TableCell sx={{ fontWeight: e.is_read ? 400 : 700, whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: e.is_read ? 'transparent' : 'info.main' }} />
                        {e.from_name}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 520 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {e.importance === 'high' && <PriorityHighIcon fontSize="small" color="error" />}
                        <Typography variant="body2" noWrap sx={{ fontWeight: e.is_read ? 500 : 700 }}>{e.subject}</Typography>
                        {e.has_attachments && <AttachFileIcon fontSize="small" color="action" />}
                      </Box>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">{e.body_preview}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{timeAgo(e.received_at)}</TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {w ? <Chip size="small" label={w.code} onClick={() => setItem(w)} />
                         : <Button size="small" onClick={() => toWork(e)}>İşe dönüştür</Button>}
                    </TableCell>
                  </TableRow>
                )
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={4} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>Mail yok.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={rows.length} page={page} rowsPerPage={rpp} rowsPerPageOptions={[10, 25, 50]}
                         onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRpp(Number(e.target.value)); setPage(0) }}
                         labelRowsPerPage="Sayfa başına" labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`} />
      </Paper>

      <Drawer anchor="right" open={!!mail} onClose={() => setOpenId(null)} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}>
        {mail && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Typography variant="h6" sx={{ flexGrow: 1, lineHeight: 1.3 }}>{mail.subject}</Typography>
              <IconButton onClick={() => setOpenId(null)} aria-label="Kapat"><CloseIcon /></IconButton>
            </Box>
            <Typography variant="body2"><b>{mail.from_name}</b> &lt;{mail.from_address}&gt;</Typography>
            <Typography variant="caption" color="text.secondary" component="div">Kime: {mail.to_addresses.join(', ')}{mail.cc_addresses.length ? ` · Bilgi: ${mail.cc_addresses.join(', ')}` : ''}</Typography>
            <Typography variant="caption" color="text.secondary" component="div">{formatDateTime(mail.received_at)} · Kutu: {mail.mailbox}</Typography>
            <Paper variant="outlined" sx={{ p: 2, my: 2, whiteSpace: 'pre-wrap' }}><Typography variant="body2">{mail.body_preview}</Typography></Paper>
            {linked ? (
              <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">Bağlı iş</Typography>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{linked.code} · {linked.title}</Typography>
                </Box>
                <StatusChip status={linked.status} />
                <Button size="small" onClick={() => setItem(linked)}>Aç</Button>
              </Paper>
            ) : null}
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              {!linked && <Button variant="contained" disableElevation onClick={() => toWork(mail)}>İşe dönüştür</Button>}
              <Button variant="outlined" onClick={() => { markEmailRead(mail.id, false); setOpenId(null) }}>Okunmadı işaretle</Button>
            </Stack>
          </Box>
        )}
      </Drawer>
      <NewWorkItemDialog open={!!convert} initial={convert} onClose={() => setConvert(undefined)} />
      <WorkItemDrawer item={item} onClose={() => setItem(null)} />
    </Box>
  )
}
