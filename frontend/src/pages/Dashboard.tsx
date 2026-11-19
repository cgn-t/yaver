import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrorred'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined'
import { AvatarGroup, Box, Button, ButtonBase, Grid, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SegmentBar, StackedBars } from '../components/Charts'
import { Stagger, StaggerItem } from '../components/Motion'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { DueLabel, EmptyState, PriorityIcon, SOURCE_HEX, SourceChip, StatusIcon, UserAvatar, formatTime, timeAgo } from '../components/WorkKit'
import { bulkImportTickets, bulkSendMail, isOpen, isOverdue, rulesOf, SOURCE_LABEL, useDb } from '../data/store'
import { AgeLabel, AgentSnippet, KeywordChips, MgmtChip } from '../components/AgentKit'
import { GROUP_BY_LABEL, groupOf, groupsFor, type GroupBy } from '../data/groups'
import type { SourceType } from '../data/types'
import { useAuth } from '../auth/AuthContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { SEMANTIC } from '../theme'

const DAY = 86_400_000
const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const greet = () => { const h = new Date().getHours(); return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar' }

function Card({ title, action, children, pad = 2.5 }: { title: string; action?: React.ReactNode; children: React.ReactNode; pad?: number }) {
  return (
    <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, pt: 2, pb: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1, fontSize: 14.5 }}>{title}</Typography>
        {action}
      </Box>
      <Box sx={{ px: pad, pb: 2.5, flexGrow: 1 }}>{children}</Box>
    </Paper>
  )
}

export default function Dashboard() {
  useDocumentTitle('Genel Bakış')
  const db = useDb()
  const { fullName } = useAuth()
  const navigate = useNavigate()
  const open = useMemo(() => db.items.filter(isOpen), [db.items])
  const today = dayKey(new Date())
  const rules = rulesOf(db)
  const [groupBy, setGroupBy] = useState<GroupBy>('mgmt')
  const [sending, setSending] = useState(false)
  // Gelen işler: en yeni açık işler, ajan yorumuyla
  const incoming = useMemo(() => [...open].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6), [open])
  const dist = groupsFor(groupBy, rules).map((g) => ({ ...g, value: open.filter((w) => groupOf(w, groupBy, rules) === g.key).length }))
    .filter((g) => groupBy !== 'keyword' || g.value > 0)

  // Son 14 gün: her gün gelen işler (kaynağa göre), kapananlar, açık iş sayısı
  const stats = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * DAY))
    const created = days.map((d) => db.items.filter((w) => w.created_at.slice(0, 10) === dayKey(d)))
    const closed = days.map((d) => db.items.filter((w) => w.closed_at?.slice(0, 10) === dayKey(d)).length)
    const openAt = days.map((d) => { const end = d.getTime() + DAY; return db.items.filter((w) => new Date(w.created_at).getTime() < end && (!w.closed_at || new Date(w.closed_at).getTime() >= end)).length })
    const mails = days.map((d) => db.emails.filter((e) => e.received_at.slice(0, 10) === dayKey(d)).length)
    const overdueAt = days.map((d) => { const k = dayKey(d); return db.items.filter((w) => w.due_date && w.due_date < k && (!w.closed_at || w.closed_at.slice(0, 10) >= k)).length })
    const sum = (a: number[], f: number, t: number) => a.slice(f, t).reduce((x, y) => x + y, 0)
    return {
      chart: days.map((d, i) => ({
        label: d.toLocaleDateString('tr-TR', { day: 'numeric' }), full: d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
        values: (['mail', 'zoom', 'tfs', 'jira', 'api', 'manual'] as SourceType[]).map((s) => created[i].filter((w) => w.source_type === s).length),
      })),
      openAt, closed, mails, overdueAt,
      closedWeek: sum(closed, 7, 14), closedPrev: sum(closed, 0, 7),
      inWeek: created.slice(7).flat().length,
    }
  }, [db.items, db.emails])

  const overdue = db.items.filter(isOverdue)
  const unread = db.emails.filter((e) => !e.is_read)
  const meetingsToday = db.meetings.filter((m) => m.start_time.slice(0, 10) === today && m.status !== 'cancelled').sort((a, b) => a.start_time.localeCompare(b.start_time))
  const dueToday = open.filter((w) => w.due_date === today)
  const focus = [...open].sort((a, b) => ({ critical: 0, high: 1, normal: 2, low: 3 }[a.priority] - { critical: 0, high: 1, normal: 2, low: 3 }[b.priority])
                                       || Number(isOverdue(b)) - Number(isOverdue(a)) || (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 6)
  const load = db.general.team_members.map((u) => ({ u, n: open.filter((w) => w.assignee === u).length, late: open.filter((w) => w.assignee === u && isOverdue(w)).length }))
    .sort((a, b) => b.n - a.n)
  const maxLoad = Math.max(1, ...load.map((l) => l.n))
  const series = (['mail', 'zoom', 'tfs', 'jira', 'api', 'manual'] as SourceType[]).map((s) => ({ key: s, label: SOURCE_LABEL[s], color: SOURCE_HEX[s] }))
  const dateStr = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Box>
      <PageHeader eyebrow={dateStr.charAt(0).toLocaleUpperCase('tr') + dateStr.slice(1)} title={`${greet()}, ${fullName ?? ''}`}
                  subtitle={<>Bugün <b>{dueToday.length} işin</b> termini var, <b>{meetingsToday.length} toplantı</b> planlı ve <b>{unread.length} okunmamış mail</b> bekliyor.</>} />

      <Stagger>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            { icon: <TaskAltIcon />, label: 'Açık işler', value: open.length, color: '#5148E5', trend: stats.openAt, delta: stats.openAt[13] - stats.openAt[6], goodWhenUp: false, caption: 'geçen haftaya göre', to: '/work-items' },
            { icon: <CheckCircleOutlineIcon />, label: 'Bu hafta kapanan', value: stats.closedWeek, color: SEMANTIC.success, trend: stats.closed, delta: stats.closedWeek - stats.closedPrev, caption: 'önceki 7 güne göre', to: '/work-items' },
            { icon: <ReportGmailerrorredIcon />, label: 'Termini geçen', value: overdue.length, color: SEMANTIC.error, trend: stats.overdueAt, delta: stats.overdueAt[13] - stats.overdueAt[6], goodWhenUp: false, caption: 'geçen haftaya göre', to: '/work-items?view=overdue' },
            { icon: <AlternateEmailIcon />, label: 'Okunmamış mail', value: unread.length, color: SEMANTIC.info, trend: stats.mails, caption: `${db.emails.filter((e) => !e.work_item_id).length} mail işe dönüşmedi`, to: '/emails' },
          ].map((c) => (
            <Grid key={c.label} size={{ xs: 6, lg: 3 }}>
              <StaggerItem style={{ height: '100%' }}>
                <StatCard icon={c.icon} label={c.label} value={c.value} color={c.color} trend={c.trend} delta={c.delta} goodWhenUp={c.goodWhenUp}
                          caption={c.caption} onClick={() => navigate(c.to)} />
              </StaggerItem>
            </Grid>
          ))}
        </Grid>
      </Stagger>

      <Grid container spacing={2}>
        <Grid size={12}>
          <Card title="Gelen işler · ajan yorumu" pad={1.25}
                action={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>Mail, Zoom, TFS Kanban ve Jira'dan gelenler</Typography>
                  <Button size="small" variant="outlined" disabled={sending} startIcon={<ForwardToInboxOutlinedIcon sx={{ fontSize: '16px !important' }} />}
                          onClick={async () => { setSending(true); await bulkSendMail(5); setSending(false) }}>
                    {sending ? 'Gönderiliyor…' : 'Toplu mail gönder (5)'}
                  </Button>
                  <Button size="small" variant="outlined" disabled={sending} startIcon={<ViewKanbanOutlinedIcon sx={{ fontSize: '16px !important' }} />}
                          onClick={async () => { setSending(true); await bulkImportTickets(4); setSending(false) }}>
                    TFS / Jira al (4)
                  </Button>
                </Box>}>
            {incoming.length === 0 && <EmptyState icon={<CheckCircleOutlineIcon />} title="Açık iş yok" />}
            <Grid container spacing={1}>
              {incoming.map((w) => (
                <Grid key={w.id} size={{ xs: 12, md: 6 }}>
                  <ButtonBase onClick={() => navigate(`/work-items?open=${w.id}`)}
                              sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider', height: '100%',
                                    transition: 'background-color .12s ease', '&:hover': { bgcolor: 'action.hover' } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <PriorityIcon priority={w.priority} />
                      <SourceChip source={w.source_type} iconOnly />
                      <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>{w.external_ref ?? w.code}</Typography>
                      <MgmtChip item={w} />
                      <KeywordChips item={w} />
                      <Box sx={{ flexGrow: 1 }} />
                      <AgeLabel item={w} />
                    </Box>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600, mt: 0.5 }}>{w.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{w.requester ?? '—'}</Typography>
                    {w.agent_comment ? <AgentSnippet item={w} lines={3} /> : (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>Ajan yorumu bekleniyor…</Typography>
                    )}
                  </ButtonBase>
                </Grid>
              ))}
            </Grid>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card title="Gelen iş akışı" action={<Typography variant="caption" color="text.secondary">Son 14 gün · bu hafta {stats.inWeek} iş</Typography>}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              {series.map((s) => (
                <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: s.color }} />
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </Box>
              ))}
            </Box>
            <StackedBars days={stats.chart} series={series} height={200} />
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card title="Bugün" action={<Button size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />} onClick={() => navigate('/meetings')}>Ajanda</Button>}>
            {meetingsToday.length === 0 && dueToday.length === 0 && <EmptyState icon={<CheckCircleOutlineIcon />} title="Bugün sakin" hint="Toplantı ya da termini bugün olan iş yok." />}
            <Box sx={{ position: 'relative' }}>
              {meetingsToday.map((m) => {
                const start = new Date(m.start_time).getTime()
                const live = Date.now() >= start && Date.now() <= start + m.duration_min * 60_000
                const past = Date.now() > start + m.duration_min * 60_000
                return (
                  <ButtonBase key={m.id} onClick={() => navigate(`/meetings?open=${m.id}`)}
                              sx={{ display: 'flex', width: '100%', textAlign: 'left', gap: 1.5, p: 1, mx: -1, borderRadius: 2, opacity: past ? 0.55 : 1, '&:hover': { bgcolor: 'action.hover' } }}>
                    <Box sx={{ width: 44, flexShrink: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatTime(m.start_time)}</Typography>
                      <Typography variant="caption" color="text.disabled">{m.duration_min} dk</Typography>
                    </Box>
                    <Box sx={(t) => ({ flexGrow: 1, minWidth: 0, pl: 1.5, py: 0.5, borderLeft: `3px solid ${live ? t.palette.success.main : SEMANTIC.violet}`,
                                       bgcolor: alpha(live ? t.palette.success.main : SEMANTIC.violet, 0.06), borderRadius: '0 8px 8px 0' })}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{m.topic}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <AvatarGroup max={4} sx={(t) => ({ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: 9, border: `2px solid ${t.palette.background.paper}`, ml: '-6px' } })}>
                          {m.participants.map((p) => <UserAvatar key={p.email} name={p.name} size={20} />)}
                        </AvatarGroup>
                        {live && <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>● Şu an</Typography>}
                      </Box>
                    </Box>
                  </ButtonBase>
                )
              })}
            </Box>
            {dueToday.length > 0 && (
              <>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2, mb: 0.5, fontWeight: 600 }}>Termini bugün</Typography>
                {dueToday.map((w) => (
                  <ButtonBase key={w.id} onClick={() => navigate(`/work-items?open=${w.id}`)}
                              sx={{ display: 'flex', width: '100%', gap: 1.25, p: 1, mx: -1, borderRadius: 2, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}>
                    <StatusIcon status={w.status} size={14} />
                    <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontWeight: 500 }}>{w.title}</Typography>
                    <UserAvatar name={w.assignee} size={20} />
                  </ButtonBase>
                ))}
              </>
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card title="Odak listesi" pad={1.25} action={<Button size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />} onClick={() => navigate('/work-items')}>Tüm işler</Button>}>
            <Stagger>
              {focus.map((w) => (
                <StaggerItem key={w.id}>
                  <ButtonBase onClick={() => navigate(`/work-items?open=${w.id}`)}
                              sx={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 1.5, px: 1.25, py: 1.1, borderRadius: 2,
                                    transition: 'background-color .12s ease', '&:hover': { bgcolor: 'action.hover' }, '&:hover .go': { opacity: 1, transform: 'none' } }}>
                    <PriorityIcon priority={w.priority} />
                    <Typography variant="caption" color="text.disabled" sx={{ width: 64, flexShrink: 0, fontWeight: 600 }}>{w.code}</Typography>
                    <StatusIcon status={w.status} size={14} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 550 }}>{w.title}</Typography>
                    </Box>
                    <Box sx={{ display: { xs: 'none', sm: 'block' } }}><DueLabel item={w} /></Box>
                    <UserAvatar name={w.assignee} size={22} />
                    <ArrowForwardIcon className="go" sx={{ fontSize: 16, color: 'text.disabled', opacity: 0, transform: 'translateX(-4px)', transition: 'all .15s ease' }} />
                  </ButtonBase>
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Grid container spacing={2} sx={{ height: '100%' }}>
            <Grid size={12}>
              <Card title="Açık işler" action={
                <ToggleButtonGroup exclusive size="small" value={groupBy} onChange={(_, v) => v && setGroupBy(v)} aria-label="Gruplama"
                                   sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 12 } }}>
                  {(Object.keys(GROUP_BY_LABEL) as GroupBy[]).map((g) => <ToggleButton key={g} value={g}>{GROUP_BY_LABEL[g]}</ToggleButton>)}
                </ToggleButtonGroup>}>
                <SegmentBar parts={dist.map((g) => ({ label: g.label, value: g.value, color: g.color }))} />
                <Button size="small" sx={{ mt: 1 }} endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
                        onClick={() => { try { localStorage.setItem('yaver.items.group', groupBy); localStorage.setItem('yaver.items.layout', 'board') } catch { /* yok */ } navigate(`/work-items?group=${groupBy}`) }}>
                  Panoda aç
                </Button>
              </Card>
            </Grid>
            <Grid size={12}>
              <Card title="Ekip yükü" action={<Typography variant="caption" color="text.secondary">açık iş</Typography>}>
                {load.map((l) => (
                  <ButtonBase key={l.u} onClick={() => navigate(`/work-items?assignee=${l.u}`)}
                              sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1.25, py: 0.75, px: 1, mx: -1, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                    <UserAvatar name={l.u} size={24} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{l.u}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{l.n}{l.late > 0 && <Box component="span" sx={{ color: 'error.main', fontWeight: 600, ml: 0.5 }}>· {l.late} gecikmiş</Box>}</Typography>
                      </Box>
                      <Box sx={{ height: 5, borderRadius: 3, bgcolor: 'action.hover', mt: 0.6, overflow: 'hidden' }}>
                        <Box sx={{ width: `${(l.n / maxLoad) * 100}%`, height: '100%', borderRadius: 3, bgcolor: l.late ? 'error.main' : 'primary.main', transition: 'width .8s cubic-bezier(.22,1,.36,1)' }} />
                      </Box>
                    </Box>
                  </ButtonBase>
                ))}
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
        Son güncelleme {timeAgo(db.items.reduce((m, w) => (w.updated_at > m ? w.updated_at : m), ''))} · <VideocamOutlinedIcon sx={{ fontSize: 12, verticalAlign: '-2px' }} /> {db.meetings.length} toplantı · {db.emails.length} mail · {db.items.length} iş kaydı
      </Typography>
    </Box>
  )
}
