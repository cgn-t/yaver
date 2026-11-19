import AddIcon from '@mui/icons-material/Add'
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import ReportGmailerrorredIcon from '@mui/icons-material/ReportGmailerrorred'
import SearchIcon from '@mui/icons-material/Search'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import {
  Badge, Box, Button, ButtonBase, Divider, Drawer, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Popover,
  Tooltip, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useThemeMode } from '../App'
import { useAuth } from '../auth/AuthContext'
import { BrandMark, Kbd } from '../components/Brand'
import CommandPalette from '../components/CommandPalette'
import YaverAi from '../components/YaverAi'
import { LiveDot, PageTransition } from '../components/Motion'
import { NewWorkItemDialog, StatusIcon, UserAvatar, timeAgo } from '../components/WorkKit'
import { isOpen, isOverdue, useDb, type NewWorkItem } from '../data/store'
import { useApiPoller } from '../services/apiPoller'
import { UiContext } from './ui'

type NavLink = { to: string; label: string; icon: ComponentType<{ sx?: object }>; count?: number; tone?: 'accent' | 'warn' }
const NAV_W = 248

export default function AppLayout() {
  const { username, fullName, logout } = useAuth()
  const { mode, toggle } = useThemeMode()
  const db = useDb()
  const { running } = useApiPoller()
  const location = useLocation()
  const navigate = useNavigate()
  const [userMenu, setUserMenu] = useState<HTMLElement | null>(null)
  const [bell, setBell] = useState<HTMLElement | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const [newInit, setNewInit] = useState<Partial<NewWorkItem> | undefined>()
  const [newOpen, setNewOpen] = useState(false)

  const openNew = useCallback((initial?: Partial<NewWorkItem>) => { setNewInit(initial); setNewOpen(true) }, [])
  const openPalette = useCallback(() => setPalette(true), [])

  // Klavye kısayolları: ⌘K / Ctrl+K arama, "c" yeni iş (yazı alanında değilken)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) }
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !(e.target as HTMLElement)?.isContentEditable
          && !document.querySelector('.MuiDialog-root, .MuiDrawer-modal')) { e.preventDefault(); openNew() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [openNew])

  const me = username ?? ''
  const unread = db.emails.filter((e) => !e.is_read)
  const overdue = db.items.filter(isOverdue)
  const mine = db.items.filter((w) => isOpen(w) && w.assignee === me).length
  const unassigned = db.items.filter((w) => isOpen(w) && !w.assignee).length
  const enabled = db.apiConfigs.filter((c) => c.enabled)
  const lastError = enabled.some((c) => c.last_status === 'error')
  const notifCount = unread.length + overdue.length

  const MAIN: NavLink[] = [
    { to: '/', label: 'Genel Bakış', icon: DashboardOutlinedIcon },
    { to: '/work-items', label: 'İşler', icon: TaskAltIcon, count: db.items.filter((w) => w.status === 'new').length },
    { to: '/emails', label: 'Gelen kutusu', icon: AlternateEmailIcon, count: unread.length, tone: 'accent' },
    { to: '/meetings', label: 'Toplantılar', icon: VideocamOutlinedIcon },
  ]
  const VIEWS: NavLink[] = [
    { to: '/work-items?view=mine', label: 'Bana atananlar', icon: PersonOutlineIcon, count: mine },
    { to: '/work-items?view=overdue', label: 'Termini geçenler', icon: ReportGmailerrorredIcon, count: overdue.length, tone: 'warn' },
    { to: '/work-items?view=unassigned', label: 'Atanmamış', icon: TaskAltIcon, count: unassigned },
  ]
  const here = location.pathname + location.search
  const crumb = [...VIEWS, ...MAIN, { to: '/settings', label: 'Ayarlar' }].find((n) => (n.to.includes('?') ? here.startsWith(n.to) : n.to === location.pathname))?.label ?? ''
  const isActive = (to: string) => (to.includes('?') ? here === to : to === '/' ? location.pathname === '/' : location.pathname === to && !location.search.includes('view='))

  const item = (n: NavLink) => {
    const active = isActive(n.to)
    const Icon = n.icon
    return (
      <ButtonBase key={n.to} component={Link} to={n.to} onClick={() => setMobileOpen(false)}
                  sx={(t) => ({ width: '100%', justifyContent: 'flex-start', gap: 1.25, px: 1.25, height: 34, borderRadius: 2, mb: 0.25,
                                color: active ? 'text.primary' : 'text.secondary', fontSize: 14, fontWeight: active ? 600 : 500,
                                bgcolor: active ? 'background.paper' : 'transparent',
                                boxShadow: active ? (t.palette.mode === 'dark' ? '0 0 0 1px #25272F' : '0 1px 2px rgba(16,18,24,0.06), 0 0 0 1px rgba(16,18,24,0.05)') : 'none',
                                transition: 'background-color .12s ease, color .12s ease',
                                '&:hover': { bgcolor: active ? 'background.paper' : 'action.hover', color: 'text.primary' } })}>
        <Icon sx={{ fontSize: 18, color: active ? 'primary.main' : 'inherit' }} />
        <Box component="span" sx={{ flexGrow: 1, textAlign: 'left' }}>{n.label}</Box>
        {!!n.count && (
          <Box component="span" sx={(t) => ({ minWidth: 20, height: 20, px: 0.6, borderRadius: 1.5, fontSize: 11.5, fontWeight: 600, display: 'grid', placeItems: 'center',
                                                bgcolor: n.tone === 'warn' ? alpha(t.palette.warning.main, 0.14) : n.tone === 'accent' ? 'primary.main' : 'action.hover',
                                                color: n.tone === 'warn' ? 'warning.main' : n.tone === 'accent' ? '#fff' : 'text.secondary' })}>{n.count}</Box>
        )}
      </ButtonBase>
    )
  }

  const sidebar = (
    <Box sx={{ width: NAV_W, height: '100%', display: 'flex', flexDirection: 'column', px: 1.5, py: 1.5, bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 0.75, height: 40, mb: 1 }}>
        <BrandMark size={28} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{db.general.app_title || 'Yaver'}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>Takım iş takibi</Typography>
        </Box>
        <IconButton size="small" sx={{ display: { md: 'none' } }} onClick={() => setMobileOpen(false)} aria-label="Menüyü kapat"><KeyboardDoubleArrowLeftIcon fontSize="small" /></IconButton>
      </Box>

      <ButtonBase onClick={() => { setMobileOpen(false); setPalette(true) }}
                  sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 1.25, height: 34, borderRadius: 2, mb: 2, border: 1, borderColor: 'divider',
                        bgcolor: 'background.paper', color: 'text.disabled', fontSize: 13.5, '&:hover': { borderColor: 'text.disabled' } }}>
        <SearchIcon sx={{ fontSize: 17 }} /><Box component="span" sx={{ flexGrow: 1, textAlign: 'left' }}>Ara…</Box><Kbd>⌘K</Kbd>
      </ButtonBase>

      <Box component="nav" aria-label="Ana menü">{MAIN.map(item)}</Box>
      <Typography variant="caption" color="text.disabled" sx={{ px: 1.25, mt: 2.5, mb: 0.75, fontWeight: 600, display: 'block' }}>Görünümler</Typography>
      <Box component="nav" aria-label="Kayıtlı görünümler">{VIEWS.map(item)}</Box>

      <Box sx={{ flexGrow: 1 }} />
      {/* API servisi durumu */}
      <ButtonBase component={Link} to="/settings?tab=api" onClick={() => setMobileOpen(false)}
                  sx={{ display: 'block', textAlign: 'left', p: 1.5, mb: 1, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper',
                        transition: 'border-color .15s ease', '&:hover': { borderColor: 'text.disabled' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LiveDot active={enabled.length > 0} color={lastError ? '#F04438' : '#12B76A'} />
          <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>{enabled.length ? (running.length ? 'Senkronize ediliyor…' : 'Senkron açık') : 'Senkron kapalı'}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          {enabled.length ? `${enabled.length} API servisi · ${lastError ? 'son çağrıda hata' : 'sorun yok'}` : 'API servisini Ayarlar\'dan açın'}
        </Typography>
      </ButtonBase>
      {item({ to: '/settings', label: 'Ayarlar', icon: SettingsOutlinedIcon })}
      <Divider sx={{ my: 1 }} />
      <ButtonBase onClick={(e) => setUserMenu(e.currentTarget)} aria-label="Kullanıcı menüsü"
                  sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.25, p: 0.75, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
        <UserAvatar name={me} size={30} />
        <Box sx={{ minWidth: 0, flexGrow: 1, textAlign: 'left' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{fullName || me}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">{me}@lokal</Typography>
        </Box>
        <UnfoldMoreIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
      </ButtonBase>
    </Box>
  )

  return (
    <UiContext.Provider value={{ openNew, openPalette }}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
        <Box sx={{ display: { xs: 'none', md: 'block' }, width: NAV_W, flexShrink: 0, position: 'sticky', top: 0, height: '100vh' }}>{sidebar}</Box>
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { md: 'none' } }}
                slotProps={{ paper: { sx: { border: 0 } } }}>{sidebar}</Drawer>

        {/* İçerik paneli: tuvalden ayrışan, kenarlıklı yüzey */}
        <Box sx={{ flexGrow: 1, minWidth: 0, p: { xs: 0, md: 1 }, pl: { md: 0 } }}>
          <Box sx={(t) => ({ minHeight: { xs: '100vh', md: 'calc(100vh - 16px)' }, bgcolor: 'background.paper', borderRadius: { xs: 0, md: 3.5 },
                             border: { xs: 0, md: `1px solid ${t.palette.divider}` }, boxShadow: { md: t.shadows[1] }, display: 'flex', flexDirection: 'column' })}>
            <Box component="header" sx={{ position: 'sticky', top: { xs: 0, md: 8 }, zIndex: 10, display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, md: 3 }, height: 56,
                                          borderBottom: 1, borderColor: 'divider', bgcolor: (t) => alpha(t.palette.background.paper, 0.82), backdropFilter: 'blur(12px)',
                                          borderTopLeftRadius: { md: 14 }, borderTopRightRadius: { md: 14 } }}>
              <IconButton sx={{ display: { md: 'none' } }} onClick={() => setMobileOpen(true)} aria-label="Menüyü aç"><MenuIcon /></IconButton>
              <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}><BrandMark size={22} /><Typography sx={{ fontWeight: 700 }}>Yaver</Typography></Box>
              <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, fontSize: 13.5, color: 'text.secondary' }}>
                <span>{db.general.app_title || 'Yaver'}</span><Box component="span" sx={{ color: 'text.disabled' }}>/</Box>
                <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{crumb}</Box>
              </Box>
              <Box sx={{ flexGrow: 1 }} />
              <Tooltip title="Ara (⌘K)"><IconButton onClick={() => setPalette(true)} sx={{ display: { md: 'none' } }} aria-label="Ara"><SearchIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title={mode === 'dark' ? 'Açık tema' : 'Koyu tema'}>
                <IconButton onClick={toggle} aria-label="Temayı değiştir">{mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}</IconButton>
              </Tooltip>
              <Tooltip title="Bildirimler">
                <IconButton onClick={(e) => setBell(e.currentTarget)} aria-label="Bildirimler">
                  <Badge color="error" variant="dot" invisible={!notifCount}><NotificationsNoneIcon fontSize="small" /></Badge>
                </IconButton>
              </Tooltip>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openNew()} sx={{ ml: 0.5 }}>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Yeni iş</Box>
                <Box component="span" sx={{ display: { xs: 'none', lg: 'inline-flex' }, ml: 1, opacity: 0.7, fontSize: 12, border: '1px solid rgba(255,255,255,0.35)', borderRadius: '4px', px: 0.5 }}>C</Box>
              </Button>
            </Box>
            <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, md: 4 }, py: { xs: 2.5, md: 3.5 }, maxWidth: 1440, width: '100%', mx: 'auto' }}>
              <PageTransition id={location.pathname}><Outlet /></PageTransition>
            </Box>
          </Box>
        </Box>
      </Box>

      <Menu anchorEl={userMenu} open={!!userMenu} onClose={() => setUserMenu(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            slotProps={{ paper: { sx: { width: 224 } } }}>
        <MenuItem onClick={() => { setUserMenu(null); toggle() }}>
          <ListItemIcon>{mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{mode === 'dark' ? 'Açık tema' : 'Koyu tema'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setUserMenu(null); setMobileOpen(false); navigate('/settings') }}>
          <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Ayarlar</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setUserMenu(null); logout(); navigate('/login') }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon><ListItemText>Çıkış yap</ListItemText>
        </MenuItem>
      </Menu>

      <Popover open={!!bell} anchorEl={bell} onClose={() => setBell(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
               transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: 360, mt: 1, maxHeight: 440 } } }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}><Typography variant="subtitle2">Bildirimler</Typography></Box>
        {notifCount === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Her şey yolunda 🎉</Typography>}
        {overdue.slice(0, 5).map((w) => (
          <ButtonBase key={`o${w.id}`} onClick={() => { setBell(null); navigate(`/work-items?open=${w.id}`) }}
                      sx={{ display: 'flex', width: '100%', textAlign: 'left', gap: 1.5, px: 2, py: 1.25, '&:hover': { bgcolor: 'action.hover' } }}>
            <StatusIcon status={w.status} size={14} />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 550 }}>{w.title}</Typography>
              <Typography variant="caption" color="error.main">Termini geçti · {w.code}</Typography>
            </Box>
          </ButtonBase>
        ))}
        {unread.slice(0, 5).map((e) => (
          <ButtonBase key={`e${e.id}`} onClick={() => { setBell(null); navigate(`/emails?open=${e.id}`) }}
                      sx={{ display: 'flex', width: '100%', textAlign: 'left', gap: 1.5, px: 2, py: 1.25, '&:hover': { bgcolor: 'action.hover' } }}>
            <UserAvatar name={e.from_name} size={24} />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 550 }}>{e.subject}</Typography>
              <Typography variant="caption" color="text.secondary">{e.from_name} · {timeAgo(e.received_at)}</Typography>
            </Box>
          </ButtonBase>
        ))}
      </Popover>

      <CommandPalette open={palette} onClose={() => setPalette(false)} onNewItem={() => openNew()} onToggleTheme={toggle} />
      <NewWorkItemDialog open={newOpen} initial={newInit} onClose={() => setNewOpen(false)} />
      <YaverAi left={{ xs: 16, md: NAV_W + 16 }} />
    </UiContext.Provider>
  )
}
