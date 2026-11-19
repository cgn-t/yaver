import AddIcon from '@mui/icons-material/Add'
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import SearchIcon from '@mui/icons-material/Search'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import { Box, Dialog, InputBase, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDb } from '../data/store'
import { Kbd } from './Brand'
import { StatusIcon } from './WorkKit'

type Cmd = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

/** ⌘K / Ctrl+K hızlı arama ve komut paleti */
export default function CommandPalette({ open, onClose, onNewItem, onToggleTheme }: {
  open: boolean; onClose: () => void; onNewItem: () => void; onToggleTheme: () => void
}) {
  const db = useDb()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) { setQ(''); setIdx(0) } }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => { onClose(); navigate(to) }
    const base: Cmd[] = [
      { id: 'new', group: 'Eylemler', label: 'Yeni iş oluştur', hint: 'C', icon: <AddIcon fontSize="small" />, run: () => { onClose(); onNewItem() } },
      { id: 'theme', group: 'Eylemler', label: 'Temayı değiştir (açık/koyu)', icon: <DarkModeOutlinedIcon fontSize="small" />, run: () => { onToggleTheme(); onClose() } },
      { id: 'p-home', group: 'Sayfalar', label: 'Genel Bakış', icon: <DashboardOutlinedIcon fontSize="small" />, run: go('/') },
      { id: 'p-items', group: 'Sayfalar', label: 'İşler', icon: <TaskAltIcon fontSize="small" />, run: go('/work-items') },
      { id: 'p-mail', group: 'Sayfalar', label: 'Gelen kutusu', icon: <AlternateEmailIcon fontSize="small" />, run: go('/emails') },
      { id: 'p-meet', group: 'Sayfalar', label: 'Toplantılar', icon: <VideocamOutlinedIcon fontSize="small" />, run: go('/meetings') },
      { id: 'p-api', group: 'Sayfalar', label: 'Ayarlar · API Çağrı Servisi', icon: <SettingsOutlinedIcon fontSize="small" />, run: go('/settings?tab=api') },
      { id: 'p-ldap', group: 'Sayfalar', label: 'Ayarlar · LDAP', icon: <SettingsOutlinedIcon fontSize="small" />, run: go('/settings?tab=ldap') },
    ]
    const t = q.trim().toLocaleLowerCase('tr')
    if (!t) return base
    const has = (s: string) => s.toLocaleLowerCase('tr').includes(t)
    return [
      ...base.filter((c) => has(c.label)),
      ...db.items.filter((w) => has(`${w.code} ${w.title}`)).slice(0, 6).map((w) => ({
        id: `w${w.id}`, group: 'İşler', label: w.title, hint: w.code, icon: <StatusIcon status={w.status} size={14} />, run: go(`/work-items?open=${w.id}`) })),
      ...db.emails.filter((e) => has(`${e.subject} ${e.from_name}`)).slice(0, 4).map((e) => ({
        id: `e${e.id}`, group: 'E-postalar', label: e.subject, hint: e.from_name, icon: <AlternateEmailIcon fontSize="small" />, run: go(`/emails?open=${e.id}`) })),
      ...db.meetings.filter((m) => has(m.topic)).slice(0, 4).map((m) => ({
        id: `m${m.id}`, group: 'Toplantılar', label: m.topic, hint: m.host_name, icon: <VideocamOutlinedIcon fontSize="small" />, run: go(`/meetings?open=${m.id}`) })),
    ]
  }, [q, db, navigate, onClose, onNewItem, onToggleTheme])

  useEffect(() => { setIdx(0) }, [q])
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' }) }, [idx])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, cmds.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); cmds[idx]?.run() }
  }

  let lastGroup = ''
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
            slotProps={{ paper: { sx: { position: 'fixed', top: '12vh', m: 0, width: 'min(640px, calc(100% - 32px))', overflow: 'hidden' } },
                         backdrop: { sx: { backdropFilter: 'blur(4px)', bgcolor: 'rgba(10,11,14,0.35)' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <SearchIcon sx={{ color: 'text.disabled' }} />
        <InputBase autoFocus fullWidth placeholder="İş, mail, toplantı ara veya komut yaz…" value={q}
                   onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} sx={{ fontSize: 16 }}
                   inputProps={{ 'aria-label': 'Ara', role: 'combobox', 'aria-expanded': true }} />
        <Kbd>esc</Kbd>
      </Box>
      <Box ref={listRef} role="listbox" sx={{ maxHeight: 400, overflowY: 'auto', p: 1 }}>
        {cmds.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Sonuç yok</Typography>}
        {cmds.map((c, i) => {
          const header = c.group !== lastGroup ? (lastGroup = c.group) : null
          return (
            <Box key={c.id}>
              {header && <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1.5, pt: 1.25, pb: 0.5, fontWeight: 600 }}>{header}</Typography>}
              <Box data-idx={i} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={c.run}
                   sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, height: 40, borderRadius: 2, cursor: 'pointer',
                                 color: 'text.secondary', bgcolor: i === idx ? alpha(t.palette.primary.main, 0.08) : 'transparent',
                                 '& .lbl': { color: i === idx ? 'text.primary' : 'text.primary' } })}>
                <Box sx={{ display: 'grid', placeItems: 'center', width: 20, color: i === idx ? 'primary.main' : 'text.disabled' }}>{c.icon}</Box>
                <Typography className="lbl" variant="body2" noWrap sx={{ flexGrow: 1, fontWeight: 500 }}>{c.label}</Typography>
                {c.hint && <Typography variant="caption" color="text.disabled" noWrap>{c.hint}</Typography>}
              </Box>
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, px: 2, py: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default', color: 'text.disabled', fontSize: 12 }}>
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> gezin</span><span><Kbd>↵</Kbd> aç</span>
      </Box>
    </Dialog>
  )
}
