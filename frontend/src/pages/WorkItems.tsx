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
import { isOpen, isOverdue, PRIORITY_LABEL, SOURCE_LABEL, STATUS_HEX, STATUS_LABEL, STATUS_ORDER, updateWorkItem, useDb } from '../data/store'
import type { WorkItem, WorkStatus } from '../data/types'
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
  const [collapsed, setCollapsed] = useState<string[]>(['cancelled'])
  const [selected, setSelected] = useState<WorkItem | null>(null)
  const [dragOver, setDragOver] = useState<WorkStatus | null>(null)

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

  const statuses = STATUS_ORDER.filter((s) => showClosed || (s !== 'done' && s !== 'cancelled'))
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
        <Chip size="small" variant="outlined" label={w.category} sx={{ display: { xs: 'none', md: 'inline-flex' }, height: 22, color: 'text.secondary' }} />
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}><SourceChip source={w.source_type} iconOnly /></Box>
        <Box sx={{ width: 110, textAlign: 'right', display: { xs: 'none', md: 'block' } }}><DueLabel item={w} /></Box>
        <UserAvatar name={w.assignee} size={22} />
      </ButtonBase>
    </motion.div>
  )

  const card = (w: WorkItem) => (
    <motion.div key={w.id} layout layoutId={`card-${w.id}`} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
      <Paper variant="outlined" draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(w.id)); e.dataTransfer.effectAllowed = 'move' }}
             onClick={() => setSelected(w)}
             sx={{ p: 1.5, mb: 1, borderRadius: 2.5, cursor: 'grab', bgcolor: 'background.paper', transition: 'box-shadow .15s ease, border-color .15s ease',
                   '&:hover': { borderColor: 'text.disabled', boxShadow: '0 6px 16px -8px rgba(16,18,24,0.2)' }, '&:active': { cursor: 'grabbing' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, flexGrow: 1 }}>{w.code}</Typography>
          <SourceChip source={w.source_type} iconOnly />
          <UserAvatar name={w.assignee} size={20} />
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 550, lineHeight: 1.4 }}>{w.title}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, height: 22, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
            <PriorityIcon priority={w.priority} /><Typography variant="caption" color="text.secondary">{PRIORITY_LABEL[w.priority]}</Typography>
          </Box>
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

      {rows.length === 0 ? (
        <Paper variant="outlined"><EmptyState icon={<TaskAltIcon />} title="Bu görünümde iş yok" hint="Filtreleri değiştirin ya da yeni bir iş oluşturun." /></Paper>
      ) : layout === 'list' ? (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {statuses.map((s) => {
            const group = rows.filter((w) => w.status === s)
            if (!group.length) return null
            const closed = collapsed.includes(s)
            return (
              <Box key={s}>
                <Box sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1, px: 2, height: 38, bgcolor: alpha(STATUS_HEX[s], t.palette.mode === 'dark' ? 0.08 : 0.04),
                                    borderBottom: 1, borderColor: 'divider' })}>
                  <IconButton size="small" onClick={() => setCollapsed((c) => (closed ? c.filter((x) => x !== s) : [...c, s]))} aria-label={closed ? 'Aç' : 'Kapat'}
                              sx={{ p: 0.25, transform: closed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s ease' }}><ExpandMoreIcon sx={{ fontSize: 18 }} /></IconButton>
                  <StatusIcon status={s} size={14} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{STATUS_LABEL[s]}</Typography>
                  <Typography variant="body2" color="text.disabled">{group.length}</Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  {s === 'new' && <IconButton size="small" onClick={() => openNew()} aria-label="Yeni iş"><AddIcon sx={{ fontSize: 18 }} /></IconButton>}
                </Box>
                <AnimatePresence initial={false}>{!closed && group.map(listRow)}</AnimatePresence>
              </Box>
            )
          })}
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '86%', sm: 'minmax(272px, 1fr)' }, gap: 1.5, overflowX: 'auto', pb: 1, mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 },
                   scrollSnapType: { xs: 'x mandatory', sm: 'none' } }}>
          {statuses.map((s) => {
            const col = rows.filter((w) => w.status === s)
            const over = dragOver === s
            return (
              <Box key={s} onDragOver={(e) => { e.preventDefault(); setDragOver(s) }} onDragLeave={() => setDragOver((d) => (d === s ? null : d))}
                   onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id) updateWorkItem(id, { status: s }) }}
                   sx={(t) => ({ scrollSnapAlign: 'start', borderRadius: 3, p: 1, minHeight: 420, transition: 'background-color .15s ease, box-shadow .15s ease',
                                 bgcolor: over ? alpha(STATUS_HEX[s], 0.08) : t.palette.background.default,
                                 boxShadow: over ? `inset 0 0 0 2px ${alpha(STATUS_HEX[s], 0.5)}` : 'none' })}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.75, py: 0.75, mb: 0.5 }}>
                  <StatusIcon status={s} size={14} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{STATUS_LABEL[s]}</Typography>
                  <Typography variant="body2" color="text.disabled" sx={{ flexGrow: 1 }}>{col.length}</Typography>
                  <IconButton size="small" onClick={() => openNew()} aria-label="Yeni iş"><AddIcon sx={{ fontSize: 17 }} /></IconButton>
                </Box>
                {col.map(card)}
                {col.length === 0 && <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 4 }}>Kartı buraya sürükleyin</Typography>}
              </Box>
            )
          })}
        </Box>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
        İpucu: Pano görünümünde kartları sürükleyerek durum değiştirebilirsiniz · son güncelleme {formatDate(new Date().toISOString())}
      </Typography>
      <WorkItemDrawer item={selected} onClose={closeDrawer} />
    </Box>
  )
}
