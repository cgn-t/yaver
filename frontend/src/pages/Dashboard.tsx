import AssignmentIcon from '@mui/icons-material/Assignment'
import MailIcon from '@mui/icons-material/Mail'
import VideocamIcon from '@mui/icons-material/Videocam'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Box, Button, Chip, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { NewWorkItemDialog, PriorityChip, SourceChip, StatusChip, WorkItemDrawer, formatDateTime, timeAgo } from '../components/WorkKit'
import { isOpen, isOverdue, SOURCE_LABEL, STATUS_LABEL, useDb } from '../data/store'
import type { SourceType, WorkItem, WorkStatus } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Paper>
  )
}

export default function Dashboard() {
  useDocumentTitle('Genel Bakış')
  const db = useDb()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<WorkItem | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const open = db.items.filter(isOpen)
  const overdue = db.items.filter(isOverdue)
  const unread = db.emails.filter((e) => !e.is_read)
  const todayMeetings = db.meetings.filter((m) => m.start_time.slice(0, 10) === today && m.status !== 'cancelled')
  const upcoming = db.meetings.filter((m) => m.status === 'scheduled' && new Date(m.start_time).getTime() > Date.now())
    .sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, 4)
  const recent = [...db.items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)
  const statusCounts = (['new', 'in_progress', 'waiting', 'done'] as WorkStatus[]).map((s) => ({ s, n: db.items.filter((w) => w.status === s).length }))
  const sourceCounts = (['mail', 'zoom', 'manual', 'api'] as SourceType[]).map((s) => ({ s, n: open.filter((w) => w.source_type === s).length }))
  const byAssignee = db.general.team_members.map((u) => ({ u, n: open.filter((w) => w.assignee === u).length })).filter((x) => x.n > 0)
  const unassigned = open.filter((w) => !w.assignee).length
  const max = Math.max(1, ...byAssignee.map((x) => x.n), unassigned)

  return (
    <Box>
      <PageHeader title="Genel Bakış" subtitle="Takıma gelen işler, mailler ve toplantıların anlık özeti"
                  actions={<Button variant="contained" disableElevation onClick={() => setNewOpen(true)}>Yeni İş</Button>} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard icon={<AssignmentIcon />} label="Açık iş" value={open.length} color="#e53946" onClick={() => navigate('/work-items')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard icon={<WarningAmberIcon />} label="Termini geçen" value={overdue.length} color="#ff9800" onClick={() => navigate('/work-items?overdue=1')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard icon={<MailIcon />} label="Okunmamış mail" value={unread.length} color="#42a5f5" onClick={() => navigate('/emails')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard icon={<VideocamIcon />} label="Bugünkü toplantı" value={todayMeetings.length} color="#7c4dff" onClick={() => navigate('/meetings')} /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Section title="Son hareket gören işler" action={<Button size="small" onClick={() => navigate('/work-items')}>Tümü</Button>}>
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {recent.map((w) => (
                <Box key={w.id} onClick={() => setSelected(w)}
                     sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, px: 1, mx: -1, borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 72, flexShrink: 0, fontWeight: 700 }}>{w.code}</Typography>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{w.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{w.assignee ?? 'Atanmadı'} · {timeAgo(w.updated_at)}</Typography>
                  </Box>
                  <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75 }}><SourceChip source={w.source_type} /><PriorityChip priority={w.priority} /></Box>
                  <StatusChip status={w.status} />
                </Box>
              ))}
            </Stack>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Section title="Yaklaşan toplantılar" action={<Button size="small" onClick={() => navigate('/meetings')}>Tümü</Button>}>
            {upcoming.length === 0 && <Typography variant="body2" color="text.secondary">Planlanmış toplantı yok.</Typography>}
            <Stack spacing={1.5}>
              {upcoming.map((m) => (
                <Box key={m.id} sx={{ display: 'flex', gap: 1.5 }}>
                  <Box sx={{ width: 4, borderRadius: 1, bgcolor: 'secondary.main', flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.topic}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDateTime(m.start_time)} · {m.duration_min} dk · {m.host_name}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Section title="Durumlara göre">
            <Stack spacing={1.25}>
              {statusCounts.map(({ s, n }) => (
                <Box key={s} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <StatusChip status={s} /><Typography sx={{ fontWeight: 700 }}>{n}</Typography>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary">Toplam {db.items.length} kayıt · {STATUS_LABEL.cancelled}: {db.items.filter((w) => w.status === 'cancelled').length}</Typography>
            </Stack>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Section title="Açık işler — kaynağa göre">
            <Stack spacing={1.25}>
              {sourceCounts.map(({ s, n }) => (
                <Box key={s} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Chip size="small" variant="outlined" label={SOURCE_LABEL[s]} /><Typography sx={{ fontWeight: 700 }}>{n}</Typography>
                </Box>
              ))}
            </Stack>
          </Section>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Section title="Açık işler — kişiye göre">
            <Stack spacing={1.25}>
              {[...byAssignee, ...(unassigned ? [{ u: 'Atanmadı', n: unassigned }] : [])].map(({ u, n }) => (
                <Box key={u}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">{u}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{n}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(n / max) * 100} sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                                  color={u === 'Atanmadı' ? 'warning' : 'primary'} />
                </Box>
              ))}
            </Stack>
          </Section>
        </Grid>
      </Grid>
      <WorkItemDrawer item={selected} onClose={() => setSelected(null)} />
      <NewWorkItemDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </Box>
  )
}
