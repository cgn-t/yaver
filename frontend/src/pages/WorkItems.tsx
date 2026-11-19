import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import SearchIcon from '@mui/icons-material/Search'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import AddIcon from '@mui/icons-material/Add'
import {
  Box, Button, ButtonBase, Chip, IconButton, InputAdornment, MenuItem, Paper, Select, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { DueLabel, EmptyState, PriorityIcon, SourceChip, StatusIcon, UserAvatar, WorkItemDrawer, formatDate } from '../components/WorkKit'
import { AgeLabel, AgentSnippet, KeywordChips, MgmtChip } from '../components/AgentKit'
import { GROUP_BY_LABEL, groupOf, groupsFor, type GroupBy } from '../data/groups'
import { isOpen, isOverdue, PRIORITY_LABEL, rulesOf, SOURCE_LABEL, STATUS_LABEL, useDb } from '../data/store'
import type { WorkItem } from '../data/types'
import { useAuth } from '../auth/AuthContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUi } from '../layouts/ui'

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 }
const VIEW_TITLE: Record<string, string> = { mine: 'Bana atananlar', overdue: 'Termini geçenler', unassigned: 'Atanmamış işler' }

export default function WorkItems() {
  const db = useDb()
  const { username } = useAuth()
  const { openNew } = useUi()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? ''
  useDocumentTitle(VIEW_TITLE[view] ?? 'İşler')
  const [layout, setLayout] = useState<'list' | 'board'>(() => (localStorage.getItem('yaver.items.layout') as 'list' | 'board') || 'list')
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [priority, setPriority] = useState('')
  const [assignee, setAssignee] = useState(params.get('assignee') ?? '')
  const [showClosed, setShowClosed] = useState(false)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [selected, setSelected] = useState<WorkItem | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const g = (params.get('group') ?? localStorage.getItem('yaver.items.group')) as GroupBy
    return g in GROUP_BY_LABEL ? g : 'mgmt'
  })
  const setGroupSaved = (g: GroupBy) => { setGroupBy(g); try { localStorage.setItem('yaver.items.group', g) } catch { /* yok */ } }
  const rules = rulesOf(db)

  useEffect(() => { setAssignee(params.get('assignee') ?? '') }, [params])
  // ?open=ID → detay panelini aç (arama/bildirimden gelinir)
  useEffect(() => {
    const id = Number(params.get('open'))
    if (id) { const w = db.items.find((x) => x.id === id); if (w) setSelected(w) }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeDrawer = () => { setSelected(null); if (params.get('open')) { params.delete('open'); setParams(params, { replace: true }) } }
  const setLayoutSaved = (l: 'list' | 'board') => { setLayout(l); try { localStorage.setItem('yaver.items.layout', l) } catch { /* yok */ } }

  const rows = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr')
    return db.items
      .filter((w) => view !== 'mine' || w.assignee === username)
      .filter((w) => view !== 'overdue' || isOverdue(w))
      .filter((w) => view !== 'unassigned' || (!w.assignee && isOpen(w)))
      .filter((w) => !source || w.source_type === source)
      .filter((w) => !priority || w.priority === priority)
      .filter((w) => !assignee || (assignee === '-' ? !w.assignee : w.assignee === assignee))
      .filter((w) => !t || `${w.code} ${w.title} ${w.description} ${w.requester ?? ''}`.toLocaleLowerCase('tr').includes(t))
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.created_at.localeCompare(a.created_at))
  }, [db.items, q, source, priority, assignee, view, username])

  const visible = rows.filter((w) => showClosed || isOpen(w))
  const groups = groupsFor(groupBy, rules)
  const inGroup = (key: string) => visible.filter((w) => groupOf(w, groupBy, rules) === key)
  const filterCount = [source, priority, assignee].filter(Boolean).length

  const filterSelect = (value: string, set: (v: string) => void, label: string, opts: [string, string][]) => (
    <Select size="small" displayEmpty value={value} onChange={(e) => set(e.target.value)}
            renderValue={(v) => (v ? <><Box component="span" sx={{ color: 'text.secondary' }}>{label}: </Box>{opts.find((o) => o[0] === v)?.[1]}</> : label)}
            sx={(t) => ({ height: 32, fontSize: 13, '& .MuiSelect-select': { py: 0.5 }, ...(value && { bgcolor: alpha(t.palette.primary.main, 0.06),
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.palette.primary.main, 0.35) } }) })}>
      <MenuItem value="">Tümü</MenuItem>
      {opts.map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
    </Select>
  )

  const listRow = (w: WorkItem) => (
    <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
      <ButtonBase onClick={() => setSelected(w)}
                  sx={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 1.5, px: 2, height: 46, borderBottom: 1, borderColor: 'divider',
                        transition: 'background-color .1s ease', '&:hover': { bgcolor: 'action.hover' } }}>
        <PriorityIcon priority={w.priority} />
        <Typography variant="caption" color="text.disabled" sx={{ width: 64, flexShrink: 0, fontWeight: 600 }}>{w.code}</Typography>
        <StatusIcon status={w.status} size={14} />
        <Typography variant="body2" noWrap sx={{ fontWeight: 500, minWidth: 0, flexShrink: 1, color: w.status === 'done' || w.status === 'cancelled' ? 'text.secondary' : 'text.primary' }}>{w.title}</Typography>
        {groupBy !== 'mgmt' && <MgmtChip item={w} />}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>{groupBy !== 'keyword' ? <KeywordChips item={w} /> : <Chip size="small" variant="outlined" label={w.category} sx={{ height: 22, color: 'text.secondary' }} />}</Box>
        <Box sx={{ flexGrow: 1 }} />
        {w.agent_comment && <Box sx={{ display: { xs: 'none', lg: 'block' }, maxWidth: 320, minWidth: 0 }}><AgentLine item={w} /></Box>}
        <Box sx={{ width: 56, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}><AgeLabel item={w} /></Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}><SourceChip source={w.source_type} iconOnly /></Box>
        <Box sx={{ width: 110, textAlign: 'right', display: { xs: 'none', md: 'block' } }}><DueLabel item={w} /></Box>
        <UserAvatar name={w.assignee} size={22} />
      </ButtonBase>
    </motion.div>
  )

  const card = (w: WorkItem) => (
    <motion.div key={w.id} layout layoutId={`card-${w.id}`} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
      <Paper variant="outlined" onClick={() => setSelected(w)}
             sx={{ p: 1.5, mb: 1, borderRadius: 2.5, cursor: 'pointer', bgcolor: 'background.paper', transition: 'box-shadow .15s ease, border-color .15s ease',
                   '&:hover': { borderColor: 'text.disabled', boxShadow: '0 6px 16px -8px rgba(16,18,24,0.2)' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
          <StatusIcon status={w.status} size={13} />
          <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, flexGrow: 1 }}>{w.code} · {STATUS_LABEL[w.status]}</Typography>
          <SourceChip source={w.source_type} iconOnly />
          <UserAvatar name={w.assignee} size={20} />
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 550, lineHeight: 1.4 }}>{w.title}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
          {groupBy !== 'mgmt' && <MgmtChip item={w} />}
          {groupBy !== 'keyword' && <KeywordChips item={w} />}
        </Box>
        <AgentSnippet item={w} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, height: 22, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
            <PriorityIcon priority={w.priority} /><Typography variant="caption" color="text.secondary">{PRIORITY_LABEL[w.priority]}</Typography>
          </Box>
          <AgeLabel item={w} />
          {w.due_date && <Box sx={{ ml: 'auto', '& span': { fontSize: '12px !important' } }}><DueLabel item={w} /></Box>}
        </Box>
      </Paper>
    </motion.div>
  )

  return (
    <Box>
      <PageHeader title={VIEW_TITLE[view] ?? 'İşler'}
                  subtitle={`${rows.filter(isOpen).length} açık · ${rows.filter((w) => !isOpen(w)).length} kapalı · mail, Zoom, API ve manuel kaynaklardan`}
                  actions={<>
                    <ToggleButtonGroup exclusive size="small" value={groupBy} onChange={(_, v) => v && setGroupSaved(v)} aria-label="Gruplama">
                      {(Object.keys(GROUP_BY_LABEL) as GroupBy[]).map((g) => <ToggleButton key={g} value={g}>{GROUP_BY_LABEL[g]}</ToggleButton>)}
                    </ToggleButtonGroup>
                    <ToggleButtonGroup exclusive size="small" value={layout} onChange={(_, v) => v && setLayoutSaved(v)} aria-label="Görünüm">
                      <ToggleButton value="list" aria-label="Liste"><FormatListBulletedIcon sx={{ fontSize: 17, mr: 0.75 }} />Liste</ToggleButton>
                      <ToggleButton value="board" aria-label="Pano"><ViewKanbanOutlinedIcon sx={{ fontSize: 17, mr: 0.75 }} />Pano</ToggleButton>
                    </ToggleButtonGroup>
                  </>} />

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" placeholder="Filtrele…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 240 }, '& .MuiOutlinedInput-root': { height: 32, fontSize: 13 } }}
                   slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17 }} /></InputAdornment> } }} />
        {filterSelect(source, setSource, 'Kaynak', Object.entries(SOURCE_LABEL))}
        {filterSelect(priority, setPriority, 'Öncelik', Object.entries(PRIORITY_LABEL))}
        {filterSelect(assignee, setAssignee, 'Atanan', [['-', 'Atanmamış'], ...db.general.team_members.map((u) => [u, u] as [string, string])])}
        {filterCount > 0 && <Button size="small" onClick={() => { setSource(''); setPriority(''); setAssignee('') }}>Temizle</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={() => setShowClosed((s) => !s)} sx={{ color: showClosed ? 'primary.main' : undefined }}>
          {showClosed ? 'Kapalıları gizle' : 'Kapalıları göster'}
        </Button>
      </Box>

      {visible.length === 0 ? (
        <Paper variant="outlined"><EmptyState icon={<TaskAltIcon />} title="Bu görünümde iş yok" hint="Filtreleri değiştirin ya da yeni bir iş oluşturun." /></Paper>
      ) : layout === 'list' ? (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {groups.map((g) => {
            const group = inGroup(g.key)
            if (!group.length) return null
            const key = `${groupBy}:${g.key}`
            const closed = collapsed.includes(key)
            return (
              <Box key={key}>
                <Box sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1, px: 2, height: 38, bgcolor: alpha(g.color, t.palette.mode === 'dark' ? 0.08 : 0.04),
                                    borderBottom: 1, borderColor: 'divider' })}>
                  <IconButton size="small" onClick={() => setCollapsed((c) => (closed ? c.filter((x) => x !== key) : [...c, key]))} aria-label={closed ? 'Aç' : 'Kapat'}
                              sx={{ p: 0.25, transform: closed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s ease' }}><ExpandMoreIcon sx={{ fontSize: 18 }} /></IconButton>
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: g.color }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{g.label}</Typography>
                  <Typography variant="body2" color="text.disabled">{group.length}</Typography>
                  {g.hint && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{g.hint}</Typography>}
                  <Box sx={{ flexGrow: 1 }} />
                </Box>
                <AnimatePresence initial={false}>{!closed && group.map(listRow)}</AnimatePresence>
              </Box>
            )
          })}
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '86%', sm: 'minmax(272px, 1fr)' }, gap: 1.5, overflowX: 'auto', pb: 1, mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 },
                   scrollSnapType: { xs: 'x mandatory', sm: 'none' } }}>
          {groups.map((g) => {
            const col = inGroup(g.key)
            if (groupBy === 'keyword' && !col.length) return null
            return (
              <Box key={g.key} sx={(t) => ({ scrollSnapAlign: 'start', borderRadius: 3, p: 1, minHeight: 420, bgcolor: t.palette.background.default,
                                            borderTop: `3px solid ${g.color}` })}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.75, py: 0.75, mb: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: g.color }} />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }} title={g.hint}>{g.label}</Typography>
                  <Typography variant="body2" color="text.disabled" sx={{ flexGrow: 1 }}>{col.length}</Typography>
                  <IconButton size="small" onClick={() => openNew()} aria-label="Yeni iş"><AddIcon sx={{ fontSize: 17 }} /></IconButton>
                </Box>
                {col.map(card)}
                {col.length === 0 && <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 4 }}>Bu grupta iş yok</Typography>}
              </Box>
            )
          })}
        </Box>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
        Gruplama: {GROUP_BY_LABEL[groupBy]} · durum, kartın üstünde ve detay panelinde değiştirilir · son güncelleme {formatDate(new Date().toISOString())}
      </Typography>
      <WorkItemDrawer item={selected} onClose={closeDrawer} onOpenItem={(id) => { const w = db.items.find((x) => x.id === id); if (w) setSelected(w) }} />
    </Box>
  )
}

/** Liste satırında ajan önerisinin tek satırlık özeti */
function AgentLine({ item }: { item: WorkItem }) {
  const line = (item.agent_comment ?? '').split('\n').find((l) => l.includes('Öneri')) ?? ''
  return (
    <Typography variant="caption" color="primary.main" noWrap sx={{ display: 'block', fontWeight: 500 }} title={line.replace(/\*\*/g, '')}>
      ✦ {line.replace(/\*\*/g, '').replace(/^Öneri:\s*/, '')}
    </Typography>
  )
}
