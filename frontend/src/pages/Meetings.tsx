import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  Box, Button, Chip, Drawer, IconButton, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import { useSnackbar } from 'notistack'
import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { NewWorkItemDialog, StatusChip, WorkItemDrawer, formatDateTime } from '../components/WorkKit'
import { updateMeeting, useDb, type NewWorkItem } from '../data/store'
import type { Meeting, WorkItem } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const M_STATUS: Record<Meeting['status'], { label: string; color: 'info' | 'success' | 'default' | 'error' }> = {
  scheduled: { label: 'Planlandı', color: 'info' }, live: { label: 'Devam ediyor', color: 'success' },
  ended: { label: 'Bitti', color: 'default' }, cancelled: { label: 'İptal', color: 'error' },
}

export default function Meetings() {
  useDocumentTitle('Zoom Toplantıları')
  const db = useDb()
  const { enqueueSnackbar } = useSnackbar()
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [openId, setOpenId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [convert, setConvert] = useState<Partial<NewWorkItem> | undefined>()
  const [item, setItem] = useState<WorkItem | null>(null)

  const rows = useMemo(() => {
    const now = Date.now()
    const end = (m: Meeting) => new Date(m.start_time).getTime() + m.duration_min * 60_000
    return db.meetings
      .filter((m) => tab === 'all' || (tab === 'upcoming' ? end(m) >= now && m.status !== 'ended' : end(m) < now || m.status === 'ended'))
      .sort((a, b) => (tab === 'upcoming' ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time)))
  }, [db.meetings, tab])

  const m = db.meetings.find((x) => x.id === openId) ?? null
  const actions = m ? db.items.filter((w) => w.source_type === 'zoom' && w.source_id === m.id) : []
  const open = (x: Meeting) => { setOpenId(x.id); setNotes(x.notes) }

  return (
    <Box>
      <PageHeader title="Zoom Toplantıları" subtitle="Takımın planlanan ve yapılan toplantıları; toplantıdan çıkan aksiyonlar işe dönüşür" />
      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="upcoming" label="Yaklaşan" /><Tab value="past" label="Geçmiş" /><Tab value="all" label="Tümü" />
        </Tabs>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Konu</TableCell><TableCell>Başlangıç</TableCell><TableCell>Süre</TableCell><TableCell>Sahibi</TableCell>
              <TableCell>Katılımcı</TableCell><TableCell>Durum</TableCell><TableCell>Aksiyon</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.id} hover sx={{ cursor: 'pointer' }} onClick={() => open(x)}>
                  <TableCell sx={{ maxWidth: 380 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{x.topic}</Typography>
                    <Typography variant="caption" color="text.secondary">ID: {x.zoom_meeting_id}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(x.start_time)}</TableCell>
                  <TableCell>{x.duration_min} dk</TableCell>
                  <TableCell>{x.host_name}</TableCell>
                  <TableCell>{x.participants.length}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={M_STATUS[x.status].color} label={M_STATUS[x.status].label} /></TableCell>
                  <TableCell>{db.items.filter((w) => w.source_type === 'zoom' && w.source_id === x.id).length || '—'}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>Toplantı yok.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Drawer anchor="right" open={!!m} onClose={() => setOpenId(null)} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 540 } } } }}>
        {m && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Typography variant="h6" sx={{ flexGrow: 1, lineHeight: 1.3 }}>{m.topic}</Typography>
              <IconButton onClick={() => setOpenId(null)} aria-label="Kapat"><CloseIcon /></IconButton>
            </Box>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              <Chip size="small" variant="outlined" color={M_STATUS[m.status].color} label={M_STATUS[m.status].label} />
              <Chip size="small" variant="outlined" label={`${m.duration_min} dk`} />
            </Stack>
            <Typography variant="body2">{formatDateTime(m.start_time)} · {m.timezone}</Typography>
            <Typography variant="body2" color="text.secondary">Sahibi: {m.host_name} ({m.host_email})</Typography>
            {m.agenda && <Typography variant="body2" sx={{ mt: 1.5 }}><b>Gündem:</b> {m.agenda}</Typography>}
            <Stack direction="row" spacing={1} sx={{ my: 2 }}>
              {m.join_url && <Button variant="outlined" size="small" endIcon={<OpenInNewIcon />} href={m.join_url} target="_blank" rel="noreferrer">Toplantıya katıl</Button>}
              {m.recording_url && <Button variant="outlined" size="small" endIcon={<OpenInNewIcon />} href={m.recording_url} target="_blank" rel="noreferrer">Kayıt</Button>}
            </Stack>
            <Typography variant="overline" color="text.secondary">Katılımcılar ({m.participants.length})</Typography>
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              {m.participants.map((p) => (
                <Box key={p.email} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">{p.name} <Typography component="span" variant="caption" color="text.secondary">{p.email}</Typography></Typography>
                  {m.status === 'ended' && <Chip size="small" label={p.attended ? 'Katıldı' : 'Katılmadı'} color={p.attended ? 'success' : 'default'} variant="outlined" />}
                </Box>
              ))}
            </Stack>
            <Typography variant="overline" color="text.secondary">Toplantı notları</Typography>
            <TextField fullWidth multiline rows={4} size="small" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="small" sx={{ mt: 1 }} disabled={notes === m.notes}
                    onClick={() => { updateMeeting(m.id, { notes }); enqueueSnackbar('Notlar kaydedildi', { variant: 'success' }) }}>Notları kaydet</Button>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1 }}>Aksiyon maddeleri ({actions.length})</Typography>
              <Button size="small" variant="contained" disableElevation
                      onClick={() => setConvert({ title: '', description: `"${m.topic}" toplantısından aksiyon.`, source_type: 'zoom', source_id: m.id,
                                                  requester: m.host_name, category: 'Aksiyon' })}>Aksiyon ekle</Button>
            </Box>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {actions.map((w) => (
                <Paper key={w.id} variant="outlined" sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setItem(w)}>
                  <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 600 }} noWrap>{w.code} · {w.title}</Typography>
                  <StatusChip status={w.status} />
                </Paper>
              ))}
            </Stack>
          </Box>
        )}
      </Drawer>
      <NewWorkItemDialog open={!!convert} initial={convert} onClose={() => setConvert(undefined)} />
      <WorkItemDrawer item={item} onClose={() => setItem(null)} />
    </Box>
  )
}
