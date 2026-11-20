import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import ApiIcon from '@mui/icons-material/Api'
import CloseIcon from '@mui/icons-material/Close'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import EditNoteIcon from '@mui/icons-material/EditNote'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import {
  Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, IconButton,
  MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import { useEffect, useState, type ReactNode } from 'react'
import {
  addComment, createWorkItem, isOverdue, onResolutionRequest, PRIORITY_COLOR, PRIORITY_LABEL, SOURCE_LABEL, STATUS_HEX, STATUS_LABEL, STATUS_ORDER,
  updateWorkItem, useDb, type NewWorkItem,
} from '../data/store'
import type { Priority, SourceType, WorkItem, WorkStatus } from '../data/types'
import { avatarColor, initials } from '../theme'
import { AgentCommentBox, AgeLabel, KeywordChips, MgmtChip } from './AgentKit'

export const CATEGORIES = ['Talep', 'Olay', 'Aksiyon', 'Planlama', 'Entegrasyon', 'Diğer']

// ---------- Biçimlendirme ----------
const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
const fmtTime = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })
export const formatDateTime = (s: string | null | undefined) => (s ? fmt.format(new Date(s)) : '—')
export const formatDate = (s: string | null | undefined) => (s ? fmtDate.format(new Date(s)) : '—')
export const formatTime = (s: string) => fmtTime.format(new Date(s))
export function timeAgo(s: string) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  const fut = diff < 0
  const a = Math.abs(diff)
  if (a < 60) return fut ? 'birazdan' : 'az önce'
  const v = a < 3600 ? `${Math.round(a / 60)} dk` : a < 86400 ? `${Math.round(a / 3600)} sa` : `${Math.round(a / 86400)} g`
  return fut ? `${v} sonra` : `${v} önce`
}

// ---------- Rozetler ----------
export function StatusChip({ status, size = 'sm' }: { status: WorkStatus; size?: 'sm' | 'md' }) {
  const c = STATUS_HEX[status]
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, height: size === 'sm' ? 24 : 28, borderRadius: '7px',
                                 bgcolor: alpha(c, 0.1), color: c, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <StatusIcon status={status} />{STATUS_LABEL[status]}
    </Box>
  )
}

/** Durum simgesi: halka ilerlemesi (Yeni boş, Devam yarım, Tamam dolu) */
export function StatusIcon({ status, size = 12 }: { status: WorkStatus; size?: number }) {
  const c = STATUS_HEX[status]
  const pct = { new: 0, in_progress: 0.5, waiting: 0.25, done: 1, cancelled: 0 }[status]
  const r = 4.5, circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="6" cy="6" r="5" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={status === 'cancelled' ? '2 2' : undefined} />
      {pct > 0 && <circle cx="6" cy="6" r={r / 2} fill="none" stroke={c} strokeWidth={r} strokeDasharray={`${(circ / 2) * pct} ${circ}`}
                          transform="rotate(-90 6 6)" />}
    </svg>
  )
}

/** Öncelik: sinyal çubukları (Kritik → ünlemli kırmızı kare) */
export function PriorityIcon({ priority }: { priority: Priority }) {
  const c = PRIORITY_COLOR[priority]
  if (priority === 'critical')
    return <Box component="span" sx={{ width: 14, height: 14, borderRadius: '4px', bgcolor: c, color: '#fff', fontSize: 10, fontWeight: 800,
                                       display: 'inline-grid', placeItems: 'center', lineHeight: 1 }}>!</Box>
  const n = { low: 1, normal: 2, high: 3 }[priority]
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      {[0, 1, 2].map((i) => <rect key={i} x={1 + i * 4.5} y={9 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill={i < n ? c : alpha(c, 0.22)} />)}
    </svg>
  )
}
export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 12.5, color: 'text.secondary', fontWeight: 550, whiteSpace: 'nowrap' }}>
      <PriorityIcon priority={priority} />{PRIORITY_LABEL[priority]}
    </Box>
  )
}

const SOURCE_ICON: Record<SourceType, ReactNode> = {
  mail: <AlternateEmailIcon sx={{ fontSize: 14 }} />, zoom: <VideocamOutlinedIcon sx={{ fontSize: 14 }} />,
  tfs: <ViewKanbanOutlinedIcon sx={{ fontSize: 14 }} />, jira: <ConfirmationNumberOutlinedIcon sx={{ fontSize: 14 }} />,
  manual: <EditNoteIcon sx={{ fontSize: 15 }} />, api: <ApiIcon sx={{ fontSize: 14 }} />,
}
export const SOURCE_HEX: Record<SourceType, string> = { mail: '#2E90FA', zoom: '#9E1B32', tfs: '#F79009', jira: '#0C66E4', manual: '#5B5F6B', api: '#15B79E' }
export function SourceChip({ source, iconOnly }: { source: SourceType; iconOnly?: boolean }) {
  const c = SOURCE_HEX[source]
  const el = (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 24, px: iconOnly ? 0 : 0.9, width: iconOnly ? 24 : 'auto',
                                 justifyContent: 'center', borderRadius: '7px', border: 1, borderColor: 'divider', bgcolor: 'background.paper',
                                 color: 'text.secondary', fontSize: 12, fontWeight: 550, whiteSpace: 'nowrap', '& svg': { color: c } }}>
      {SOURCE_ICON[source]}{!iconOnly && SOURCE_LABEL[source]}
    </Box>
  )
  return iconOnly ? <Tooltip title={SOURCE_LABEL[source]}>{el}</Tooltip> : el
}

export function UserAvatar({ name, size = 24 }: { name: string | null; size?: number }) {
  if (!name) return <Avatar sx={{ width: size, height: size, bgcolor: 'transparent', border: '1.5px dashed', borderColor: 'text.disabled', color: 'text.disabled', fontSize: size * 0.45 }}>?</Avatar>
  return <Tooltip title={name}><Avatar sx={{ width: size, height: size, bgcolor: avatarColor(name), fontSize: size * 0.42 }}>{initials(name)}</Avatar></Tooltip>
}

export function DueLabel({ item }: { item: WorkItem }) {
  if (!item.due_date) return <Typography variant="body2" color="text.disabled">—</Typography>
  const late = isOverdue(item)
  const today = item.due_date === new Date().toISOString().slice(0, 10)
  return (
    <Box component="span" sx={{ fontSize: 13, fontWeight: late || today ? 600 : 450, whiteSpace: 'nowrap',
                                 color: late ? 'error.main' : today ? 'warning.main' : 'text.secondary' }}>
      {late ? 'Gecikti · ' : today ? 'Bugün · ' : ''}{formatDate(item.due_date)}
    </Box>
  )
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <Box sx={{ py: 8, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'text.secondary' }}>
      <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: 'action.hover', display: 'grid', placeItems: 'center', mb: 1.5, color: 'text.disabled' }}>{icon}</Box>
      <Typography variant="subtitle2" color="text.primary">{title}</Typography>
      {hint && <Typography variant="body2" sx={{ mt: 0.5 }}>{hint}</Typography>}
    </Box>
  )
}

// ---------- Yeni iş ----------
export function NewWorkItemDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<NewWorkItem> }) {
  const db = useDb()
  const { enqueueSnackbar } = useSnackbar()
  const blank: NewWorkItem = { title: '', description: '', priority: 'normal', category: 'Talep', assignee: db.general.default_assignee || null, due_date: null }
  const [form, setForm] = useState<NewWorkItem>({ ...blank, ...initial })
  const [lastKey, setLastKey] = useState<unknown>(open ? initial : null)
  const key = open ? initial ?? 'blank' : null
  if (key !== lastKey) { setLastKey(key); if (open) setForm({ ...blank, ...initial }) }
  const set = <K extends keyof NewWorkItem>(k: K, v: NewWorkItem[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) return
    onClose()
    const item = await createWorkItem(form)
    enqueueSnackbar(`${item.code} oluşturuldu`, { variant: 'success' })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Yeni iş
        {form.source_type && form.source_type !== 'manual' && <SourceChip source={form.source_type} />}
      </DialogTitle>
      <DialogContent>
        <TextField variant="standard" placeholder="İşin başlığı" fullWidth autoFocus value={form.title} onChange={(e) => set('title', e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
                   slotProps={{ input: { disableUnderline: true, sx: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em' } } }} />
        <TextField variant="standard" placeholder="Açıklama ekle…" fullWidth multiline minRows={3} value={form.description}
                   onChange={(e) => set('description', e.target.value)} sx={{ mt: 1 }}
                   slotProps={{ input: { disableUnderline: true, sx: { fontSize: 14, color: 'text.secondary' } } }} />
        <Stack direction="row" spacing={1} sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Select size="small" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}
                  renderValue={(v) => <PriorityChip priority={v} />} sx={{ minWidth: 130 }}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => <MenuItem key={k} value={k}><PriorityChip priority={k} /></MenuItem>)}
          </Select>
          <Select size="small" value={form.category} onChange={(e) => set('category', e.target.value)} sx={{ minWidth: 120 }}>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={form.assignee ?? ''} onChange={(e) => set('assignee', e.target.value || null)} sx={{ minWidth: 160 }}
                  renderValue={(v) => <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><UserAvatar name={v || null} size={20} />{v || 'Atanmadı'}</Box>}>
            <MenuItem value="">Atanmadı</MenuItem>
            {db.general.team_members.map((u) => <MenuItem key={u} value={u}><UserAvatar name={u} size={20} /><Box sx={{ ml: 1 }}>{u}</Box></MenuItem>)}
          </Select>
          <TextField size="small" type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} sx={{ width: 160 }}
                     slotProps={{ htmlInput: { 'aria-label': 'Termin' } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, borderTop: 1, borderColor: 'divider', mt: 2 }}>
        <Typography variant="caption" color="text.disabled" sx={{ mr: 'auto', mt: 1.5 }}>⌘/Ctrl + Enter ile oluştur</Typography>
        <Button onClick={onClose} sx={{ mt: 1.5 }}>Vazgeç</Button>
        <Button variant="contained" onClick={save} disabled={!form.title.trim()} sx={{ mt: 1.5 }}>İşi oluştur</Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------- Çözüm açıklaması (Tamamlandı'ya geçerken zorunlu) ----------
export function ResolutionDialog() {
  const [req, setReq] = useState<{ item: WorkItem; patch: Partial<WorkItem> } | null>(null)
  const [text, setText] = useState('')
  useEffect(() => onResolutionRequest((r) => { setReq(r); setText('') }), [])
  const ok = text.trim().length >= 10
  const save = () => {
    if (!req || !ok) return
    updateWorkItem(req.item.id, { ...req.patch, resolution: text.trim() })
    setReq(null)
  }
  return (
    <Dialog open={!!req} onClose={() => setReq(null)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>İşi tamamla</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          <b>{req?.item.code}</b> · {req?.item.title}
        </Typography>
        <TextField autoFocus fullWidth multiline minRows={5} label="Çözüm: ne yapıldı?" value={text} onChange={(e) => setText(e.target.value)}
                   placeholder={'Neden: …\nYapılan: …\nKalıcı önlem: …'}
                   helperText={ok ? 'Açıklama işin geçmişine ve Çözüm kutusuna yazılır.' : 'Zorunlu, en az 10 karakter.'}
                   onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={() => setReq(null)}>Vazgeç</Button>
        <Button variant="contained" color="success" onClick={save} disabled={!ok}>Tamamlandı olarak kaydet</Button>
      </DialogActions>
    </Dialog>
  )
}

const boldText = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
  part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part)

function ResolutionBox({ item }: { item: WorkItem }) {
  if (!item.resolution) return null
  return (
    <Box sx={{ mt: 2, p: 1.75, borderRadius: 3, border: 1, borderColor: alpha(STATUS_HEX.done, 0.45), bgcolor: alpha(STATUS_HEX.done, 0.06) }}>
      <Typography variant="caption" sx={{ fontWeight: 650, color: STATUS_HEX.done, letterSpacing: '0.02em' }}>ÇÖZÜM</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5, lineHeight: 1.6 }}>
        {boldText(item.resolution)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {item.resolved_by ?? '—'} · {formatDateTime(item.resolved_at)}
      </Typography>
    </Box>
  )
}

// ---------- İş detayı (Linear tarzı: sol içerik, sağ özellikler) ----------
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', minHeight: 36 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
const bare = { '& .MuiOutlinedInput-notchedOutline': { border: 0 }, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 2, ml: -1.25,
               '& .MuiSelect-select': { py: 0.75, pl: 1.25 } }

export function WorkItemDrawer({ item, onClose, onOpenItem }: { item: WorkItem | null; onClose: () => void; onOpenItem?: (id: number) => void }) {
  const db = useDb()
  const [comment, setComment] = useState('')
  const live = item ? db.items.find((w) => w.id === item.id) ?? item : null
  const acts = live ? db.activities.filter((a) => a.work_item_id === live.id).sort((a, b) => b.at.localeCompare(a.at)) : []
  const email = live?.source_type === 'mail' ? db.emails.find((e) => e.id === live.source_id) : undefined
  const meeting = live?.source_type === 'zoom' ? db.meetings.find((m) => m.id === live.source_id) : undefined
  const send = () => { if (live && comment.trim()) { addComment(live.id, comment.trim()); setComment('') } }

  return (
    <Drawer anchor="right" open={!!live} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}>
      {live && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
            <SourceChip source={live.source_type} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontFamily: 'inherit' }}>{live.code}</Typography>
            {live.external_ref && (
              <Typography variant="body2" component={live.external_url ? 'a' : 'span'} href={live.external_url ?? undefined} target="_blank" rel="noopener"
                          sx={{ fontWeight: 600, color: SOURCE_HEX[live.source_type], textDecoration: 'none', '&:hover': { textDecoration: live.external_url ? 'underline' : 'none' } }}>
                {live.external_ref}
              </Typography>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <IconButton size="small" onClick={onClose} aria-label="Kapat"><CloseIcon fontSize="small" /></IconButton>
          </Box>
          <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{live.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mt: 1.25, lineHeight: 1.6 }}>{live.description || 'Açıklama yok.'}</Typography>

            <Box sx={{ mt: 3, p: 1.5, pl: 2.25, borderRadius: 3, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
              <Prop label="Durum">
                <Select size="small" value={live.status} onChange={(e) => updateWorkItem(live.id, { status: e.target.value as WorkStatus })} sx={bare}
                        renderValue={(v) => <StatusChip status={v} />}>
                  {STATUS_ORDER.map((k) => <MenuItem key={k} value={k}><StatusIcon status={k} /><Box sx={{ ml: 1 }}>{STATUS_LABEL[k]}</Box></MenuItem>)}
                </Select>
              </Prop>
              <Prop label="Öncelik">
                <Select size="small" value={live.priority} onChange={(e) => updateWorkItem(live.id, { priority: e.target.value as Priority })} sx={bare}
                        renderValue={(v) => <PriorityChip priority={v} />}>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => <MenuItem key={k} value={k}><PriorityChip priority={k} /></MenuItem>)}
                </Select>
              </Prop>
              <Prop label="Atanan">
                <Select size="small" displayEmpty value={live.assignee ?? ''} onChange={(e) => updateWorkItem(live.id, { assignee: e.target.value || null })} sx={bare}
                        renderValue={(v) => <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5 }}><UserAvatar name={v || null} size={20} />{v || 'Atanmadı'}</Box>}>
                  <MenuItem value="">Atanmadı</MenuItem>
                  {db.general.team_members.map((u) => <MenuItem key={u} value={u}><UserAvatar name={u} size={20} /><Box sx={{ ml: 1 }}>{u}</Box></MenuItem>)}
                </Select>
              </Prop>
              <Prop label="Termin">
                <TextField type="date" size="small" value={live.due_date ?? ''} onChange={(e) => updateWorkItem(live.id, { due_date: e.target.value || null })}
                           sx={{ ...bare, '& input': { py: 0.75, pl: 1.25, fontSize: 13.5 }, '& .MuiOutlinedInput-root': { bgcolor: 'transparent' } }} />
              </Prop>
              <Prop label="Kategori"><Chip size="small" variant="outlined" label={live.category} /></Prop>
              <Prop label="Talep eden">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">{live.requester ?? '—'}</Typography><MgmtChip item={live} always={!!live.mgmt_level && live.mgmt_level !== 'diger'} />
                </Box>
              </Prop>
              <Prop label="Konu"><Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}><KeywordChips item={live} max={6} /></Box></Prop>
              <Prop label="Süre"><AgeLabel item={live} /></Prop>
              <Prop label="Oluşturma"><Typography variant="body2" color="text.secondary">{formatDateTime(live.created_at)}</Typography></Prop>
            </Box>

            <ResolutionBox item={live} />
            <AgentCommentBox item={live} onOpenItem={onOpenItem} />

            {(email || meeting) && (
              <Box sx={{ mt: 2, p: 1.75, borderRadius: 3, border: 1, borderColor: 'divider', display: 'flex', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', flexShrink: 0,
                           bgcolor: alpha(SOURCE_HEX[live.source_type], 0.1), color: SOURCE_HEX[live.source_type] }}>
                  {email ? <AlternateEmailIcon fontSize="small" /> : <VideocamOutlinedIcon fontSize="small" />}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{email ? 'Kaynak e-posta' : 'Kaynak toplantı'}</Typography>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{email?.subject ?? meeting?.topic}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {email ? `${email.from_name} · ${formatDateTime(email.received_at)}` : `${meeting?.host_name} · ${formatDateTime(meeting!.start_time)}`}
                  </Typography>
                </Box>
              </Box>
            )}

            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Etkinlik</Typography>
            <Box sx={{ position: 'relative', pl: 3.5 }}>
              <Box sx={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: '1px', bgcolor: 'divider' }} />
              {acts.map((a) => (
                <Box key={a.id} sx={{ position: 'relative', mb: 2 }}>
                  <Box sx={{ position: 'absolute', left: -28 }}><UserAvatar name={a.actor} size={22} /></Box>
                  {a.action === 'comment' ? (
                    <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                      <Typography variant="caption" color="text.secondary"><b>{a.actor}</b> · {timeAgo(a.at)}</Typography>
                      <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>{boldText(a.text)}</Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ pt: 0.25 }}>
                      <b style={{ fontWeight: 600 }}>{a.actor}</b> · {a.text} <Box component="span" sx={{ color: 'text.disabled' }}>· {timeAgo(a.at)}</Box>
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
            <TextField size="small" fullWidth placeholder="Yorum yaz…" value={comment} onChange={(e) => setComment(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
            <Button variant="contained" disabled={!comment.trim()} onClick={send}>Gönder</Button>
          </Box>
        </Box>
      )}
    </Drawer>
  )
}

