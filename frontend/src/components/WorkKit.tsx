import CloseIcon from '@mui/icons-material/Close'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, Grid, IconButton,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useSnackbar } from 'notistack'
import { useState } from 'react'
import {
  addComment, createWorkItem, PRIORITY_COLOR, PRIORITY_LABEL, SOURCE_LABEL, STATUS_COLOR, STATUS_LABEL,
  updateWorkItem, useDb, type NewWorkItem,
} from '../data/store'
import type { Priority, SourceType, WorkItem, WorkStatus } from '../data/types'

export const CATEGORIES = ['Talep', 'Olay', 'Aksiyon', 'Planlama', 'Entegrasyon', 'Diğer']

const fmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
const fmtDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' })
export const formatDateTime = (s: string | null | undefined) => (s ? fmt.format(new Date(s)) : '—')
export const formatDate = (s: string | null | undefined) => (s ? fmtDate.format(new Date(s)) : '—')
export function timeAgo(s: string) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  const fut = diff < 0
  const a = Math.abs(diff)
  const v = a < 60 ? 'az' : a < 3600 ? `${Math.round(a / 60)} dk` : a < 86400 ? `${Math.round(a / 3600)} sa` : `${Math.round(a / 86400)} gün`
  if (v === 'az') return fut ? 'birazdan' : 'az önce'
  return fut ? `${v} sonra` : `${v} önce`
}

export const StatusChip = ({ status }: { status: WorkStatus }) =>
  <Chip size="small" variant="outlined" color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />

export const PriorityChip = ({ priority }: { priority: Priority }) => (
  <Chip size="small" label={PRIORITY_LABEL[priority]}
        sx={{ bgcolor: `${PRIORITY_COLOR[priority]}22`, color: PRIORITY_COLOR[priority], border: `1px solid ${PRIORITY_COLOR[priority]}55` }} />
)

export const SourceChip = ({ source }: { source: SourceType }) =>
  <Chip size="small" variant="outlined" label={SOURCE_LABEL[source]} />

/** Yeni iş oluşturma — mail/toplantıdan açılırsa alanlar önceden dolu gelir */
export function NewWorkItemDialog({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial?: Partial<NewWorkItem>
}) {
  const db = useDb()
  const { enqueueSnackbar } = useSnackbar()
  const blank: NewWorkItem = { title: '', description: '', priority: 'normal', category: 'Talep', assignee: db.general.default_assignee || null, due_date: null }
  const [form, setForm] = useState<NewWorkItem>({ ...blank, ...initial })
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) { setLastInitial(initial); setForm({ ...blank, ...initial }) }
  const set = <K extends keyof NewWorkItem>(k: K, v: NewWorkItem[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = () => {
    const item = createWorkItem(form)
    enqueueSnackbar(`${item.code} oluşturuldu`, { variant: 'success' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Yeni İş {form.source_type && form.source_type !== 'manual' && <Chip size="small" sx={{ ml: 1 }} label={`Kaynak: ${SOURCE_LABEL[form.source_type]}`} />}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid size={12}><TextField label="Başlık" fullWidth size="small" required value={form.title} onChange={(e) => set('title', e.target.value)} /></Grid>
          <Grid size={12}><TextField label="Açıklama" fullWidth size="small" multiline rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label="Öncelik" fullWidth size="small" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label="Kategori" fullWidth size="small" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label="Atanan" fullWidth size="small" value={form.assignee ?? ''} onChange={(e) => set('assignee', e.target.value || null)}>
              <MenuItem value="">— Atanmadı —</MenuItem>
              {db.general.team_members.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Termin" type="date" fullWidth size="small" value={form.due_date ?? ''}
                       onChange={(e) => set('due_date', e.target.value || null)} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disableElevation onClick={save} disabled={!form.title.trim()}>Oluştur</Button>
      </DialogActions>
    </Dialog>
  )
}

/** İş detayı — durum/öncelik/atama düzenleme, kaynak bilgisi ve tarihçe */
export function WorkItemDrawer({ item, onClose }: { item: WorkItem | null; onClose: () => void }) {
  const db = useDb()
  const [comment, setComment] = useState('')
  const live = item ? db.items.find((w) => w.id === item.id) ?? item : null
  const acts = live ? db.activities.filter((a) => a.work_item_id === live.id).sort((a, b) => b.at.localeCompare(a.at)) : []
  const email = live?.source_type === 'mail' ? db.emails.find((e) => e.id === live.source_id) : undefined
  const meeting = live?.source_type === 'zoom' ? db.meetings.find((m) => m.id === live.source_id) : undefined

  return (
    <Drawer anchor="right" open={!!live} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}>
      {live && (
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{live.code}</Typography>
              <Typography variant="h6" sx={{ lineHeight: 1.3 }}>{live.title}</Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Kapat"><CloseIcon /></IconButton>
          </Box>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <StatusChip status={live.status} /><PriorityChip priority={live.priority} /><SourceChip source={live.source_type} />
            <Chip size="small" variant="outlined" label={live.category} />
          </Stack>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={6}>
              <TextField select label="Durum" fullWidth size="small" value={live.status}
                         onChange={(e) => updateWorkItem(live.id, { status: e.target.value as WorkStatus })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField select label="Öncelik" fullWidth size="small" value={live.priority}
                         onChange={(e) => updateWorkItem(live.id, { priority: e.target.value as Priority })}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField select label="Atanan" fullWidth size="small" value={live.assignee ?? ''}
                         onChange={(e) => updateWorkItem(live.id, { assignee: e.target.value || null })}>
                <MenuItem value="">— Atanmadı —</MenuItem>
                {db.general.team_members.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField label="Termin" type="date" fullWidth size="small" value={live.due_date ?? ''}
                         onChange={(e) => updateWorkItem(live.id, { due_date: e.target.value || null })}
                         slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
          </Grid>
          <Typography variant="overline" color="text.secondary">Açıklama</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{live.description || '—'}</Typography>
          <Typography variant="body2" color="text.secondary">Talep eden: <b>{live.requester ?? '—'}</b> · Oluşturma: {formatDateTime(live.created_at)}</Typography>
          {email && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary">Kaynak e-posta</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{email.subject}</Typography>
              <Typography variant="caption" color="text.secondary">{email.from_name} &lt;{email.from_address}&gt; · {formatDateTime(email.received_at)}</Typography>
            </Box>
          )}
          {meeting && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary">Kaynak toplantı</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{meeting.topic}</Typography>
              <Typography variant="caption" color="text.secondary">{meeting.host_name} · {formatDateTime(meeting.start_time)}</Typography>
            </Box>
          )}
          <Divider sx={{ my: 2.5 }} />
          <Typography variant="overline" color="text.secondary">Tarihçe</Typography>
          <Stack direction="row" spacing={1} sx={{ my: 1 }}>
            <TextField size="small" fullWidth placeholder="Yorum ekle…" value={comment} onChange={(e) => setComment(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter' && comment.trim()) { addComment(live.id, comment.trim()); setComment('') } }} />
            <Button variant="outlined" disabled={!comment.trim()} onClick={() => { addComment(live.id, comment.trim()); setComment('') }}>Ekle</Button>
          </Stack>
          <Stack spacing={1.25} sx={{ mt: 1.5 }}>
            {acts.map((a) => (
              <Box key={a.id} sx={{ display: 'flex', gap: 1.5 }}>
                <Box sx={{ width: 8, height: 8, mt: 0.9, borderRadius: '50%', flexShrink: 0,
                           bgcolor: a.action === 'comment' ? 'secondary.main' : 'primary.main' }} />
                <Box>
                  <Typography variant="body2">{a.text}</Typography>
                  <Typography variant="caption" color="text.secondary">{a.actor} · {formatDateTime(a.at)}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Drawer>
  )
}
