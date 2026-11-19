import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined'
import {
  AvatarGroup, Box, Button, ButtonBase, Chip, Drawer, IconButton, Paper, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Stagger, StaggerItem } from '../components/Motion'
import PageHeader from '../components/PageHeader'
import { EmptyState, StatusChip, UserAvatar, WorkItemDrawer, formatTime } from '../components/WorkKit'
import { updateMeeting, useDb } from '../data/store'
import type { Meeting, WorkItem } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUi } from '../layouts/ui'
import { SEMANTIC } from '../theme'

const dayKey = (s: string) => new Date(s).toLocaleDateString('sv-SE')
function dayLabel(k: string) {
  const d = new Date(`${k}T12:00:00`)
  const today = new Date().toLocaleDateString('sv-SE')
  const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000)
  const rel = diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : diff === -1 ? 'Dün' : d.toLocaleDateString('tr-TR', { weekday: 'long' })
  return { rel: rel.charAt(0).toLocaleUpperCase('tr') + rel.slice(1), date: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }), isToday: diff === 0 }
}
const endOf = (m: Meeting) => new Date(m.start_time).getTime() + m.duration_min * 60_000

export default function Meetings() {
  useDocumentTitle('Toplantılar')
  const db = useDb()
  const { openNew } = useUi()
  const { enqueueSnackbar } = useSnackbar()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [openId, setOpenId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [item, setItem] = useState<WorkItem | null>(null)

  const open = (m: Meeting) => { setOpenId(m.id); setNotes(m.notes) }
  useEffect(() => {
    const id = Number(params.get('open'))
    if (id) { const m = db.meetings.find((x) => x.id === id); if (m) open(m); params.delete('open'); setParams(params, { replace: true }) }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const now = Date.now()
    const list = db.meetings.filter((m) => (tab === 'upcoming' ? endOf(m) >= now && m.status !== 'ended' : endOf(m) < now || m.status === 'ended'))
      .sort((a, b) => (tab === 'upcoming' ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time)))
    const map = new Map<string, Meeting[]>()
    for (const m of list) map.set(dayKey(m.start_time), [...(map.get(dayKey(m.start_time)) ?? []), m])
    return [...map.entries()]
  }, [db.meetings, tab])

  const m = db.meetings.find((x) => x.id === openId) ?? null
  const actions = m ? db.items.filter((w) => w.source_type === 'zoom' && w.source_id === m.id) : []

  return (
    <Box>
      <PageHeader title="Toplantılar" subtitle="Zoom toplantıları, katılımcılar ve toplantılardan çıkan aksiyonlar"
                  actions={<ToggleButtonGroup exclusive size="small" value={tab} onChange={(_, v) => v && setTab(v)}>
                    <ToggleButton value="upcoming">Yaklaşan</ToggleButton><ToggleButton value="past">Geçmiş</ToggleButton>
                  </ToggleButtonGroup>} />

      {groups.length === 0 && <Paper variant="outlined"><EmptyState icon={<EventBusyOutlinedIcon />} title="Toplantı yok" hint={tab === 'upcoming' ? 'Planlanmış toplantı bulunmuyor.' : 'Geçmiş toplantı kaydı yok.'} /></Paper>}
      <Stagger>
        {groups.map(([k, list]) => {
          const d = dayLabel(k)
          return (
            <StaggerItem key={k}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '160px 1fr' }, gap: { xs: 1, md: 3 }, mb: 3.5 }}>
                <Box sx={{ position: { md: 'sticky' }, top: { md: 80 }, alignSelf: 'start' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: d.isToday ? 'primary.main' : 'text.primary' }}>{d.rel}</Typography>
                  <Typography variant="body2" color="text.secondary">{d.date}</Typography>
                </Box>
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {list.map((x) => {
                    const start = new Date(x.start_time).getTime()
                    const live = Date.now() >= start && Date.now() <= endOf(x)
                    const accent = live ? SEMANTIC.success : x.status === 'ended' ? '#9A9EA8' : SEMANTIC.violet
                    const nActions = db.items.filter((w) => w.source_type === 'zoom' && w.source_id === x.id).length
                    return (
                      <ButtonBase key={x.id} onClick={() => open(x)}
                                  sx={(t) => ({ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'stretch', gap: 2, p: 1.75, borderRadius: 3, border: 1, borderColor: 'divider',
                                                bgcolor: 'background.paper', transition: 'border-color .15s ease, box-shadow .15s ease, transform .2s cubic-bezier(.22,1,.36,1)',
                                                '&:hover': { borderColor: alpha(accent, 0.5), boxShadow: `0 10px 24px -14px ${alpha(accent, t.palette.mode === 'dark' ? 0.6 : 0.5)}`, transform: 'translateY(-1px)' } })}>
                        <Box sx={{ width: 56, flexShrink: 0 }}>
                          <Typography sx={{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.01em' }}>{formatTime(x.start_time)}</Typography>
                          <Typography variant="caption" color="text.disabled">{x.duration_min} dk</Typography>
                        </Box>
                        <Box sx={{ width: 3, borderRadius: 2, bgcolor: accent, flexShrink: 0 }} />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: 14.5 }}>{x.topic}</Typography>
                            {live && <Chip size="small" label="Şu an" sx={{ height: 20, bgcolor: alpha(SEMANTIC.success, 0.12), color: 'success.main' }} />}
                          </Box>
                          <Typography variant="caption" color="text.secondary" noWrap component="div">{x.host_name} · ID {x.zoom_meeting_id}{x.agenda ? ` · ${x.agenda}` : ''}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
                            <AvatarGroup max={5} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10, borderWidth: 2 } }}>
                              {x.participants.map((p) => <UserAvatar key={p.email} name={p.name} size={22} />)}
                            </AvatarGroup>
                            {nActions > 0 && <Typography variant="caption" color="text.secondary">{nActions} aksiyon</Typography>}
                            {x.recording_url && <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}><PlayCircleOutlineIcon sx={{ fontSize: 14 }} />Kayıt</Typography>}
                          </Box>
                        </Box>
                        {x.status !== 'ended' && x.join_url && (
                          <Button size="small" variant={live ? 'contained' : 'outlined'} href={x.join_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                  sx={{ alignSelf: 'center', display: { xs: 'none', sm: 'inline-flex' } }}>Katıl</Button>
                        )}
                      </ButtonBase>
                    )
                  })}
                </Box>
              </Box>
            </StaggerItem>
          )
        })}
      </Stagger>

      <Drawer anchor="right" open={!!m} onClose={() => setOpenId(null)} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}>
        {m && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>Zoom · {m.zoom_meeting_id}</Typography>
              <Tooltip title="Katılım linkini kopyala">
                <IconButton size="small" onClick={() => { void navigator.clipboard?.writeText(m.join_url); enqueueSnackbar('Link kopyalandı', { variant: 'success' }) }}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setOpenId(null)} aria-label="Kapat"><CloseIcon fontSize="small" /></IconButton>
            </Box>
            <Box sx={{ overflowY: 'auto', px: 3, py: 2.5, flexGrow: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em' }}>{m.topic}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {new Date(m.start_time).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(m.start_time)}–{formatTime(new Date(endOf(m)).toISOString())}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                {m.status !== 'ended' && m.join_url && <Button variant="contained" endIcon={<OpenInNewIcon />} href={m.join_url} target="_blank" rel="noreferrer">Toplantıya katıl</Button>}
                {m.recording_url && <Button variant="outlined" startIcon={<PlayCircleOutlineIcon />} href={m.recording_url} target="_blank" rel="noreferrer">Kaydı izle</Button>}
              </Box>
              {m.agenda && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Gündem</Typography>
                  <Typography variant="body2" color="text.secondary">{m.agenda}</Typography>
                </Box>
              )}
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Katılımcılar <Box component="span" sx={{ color: 'text.disabled', fontWeight: 500 }}>{m.participants.length}</Box></Typography>
              {m.participants.map((p) => (
                <Box key={p.email} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75 }}>
                  <UserAvatar name={p.name} size={28} />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}{p.email === m.host_email && <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}> · sahibi</Box>}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.email}</Typography>
                  </Box>
                  {m.status === 'ended' && <Typography variant="caption" sx={{ color: p.attended ? 'success.main' : 'text.disabled', fontWeight: 600 }}>{p.attended ? 'Katıldı' : 'Katılmadı'}</Typography>}
                </Box>
              ))}
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Notlar</Typography>
              <TextField fullWidth multiline minRows={4} placeholder="Toplantı notlarını buraya yazın…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              {notes !== m.notes && <Button size="small" variant="contained" sx={{ mt: 1 }} onClick={() => { updateMeeting(m.id, { notes }); enqueueSnackbar('Notlar kaydedildi', { variant: 'success' }) }}>Kaydet</Button>}
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 3, mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Aksiyonlar <Box component="span" sx={{ color: 'text.disabled', fontWeight: 500 }}>{actions.length}</Box></Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => openNew({ description: `"${m.topic}" toplantısından aksiyon.`, source_type: 'zoom', source_id: m.id, requester: m.host_name, category: 'Aksiyon' })}>Aksiyon ekle</Button>
              </Box>
              {actions.length === 0 && <Typography variant="body2" color="text.disabled">Henüz aksiyon yok.</Typography>}
              {actions.map((w) => (
                <ButtonBase key={w.id} onClick={() => setItem(w)}
                            sx={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 1.25, p: 1.25, mb: 0.75, borderRadius: 2, border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                  <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontWeight: 550 }}>{w.title}</Typography>
                  <UserAvatar name={w.assignee} size={20} />
                  <StatusChip status={w.status} />
                </ButtonBase>
              ))}
            </Box>
          </Box>
        )}
      </Drawer>
      <WorkItemDrawer item={item} onClose={() => setItem(null)} />
    </Box>
  )
}
