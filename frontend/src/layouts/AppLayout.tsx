import AssignmentIcon from '@mui/icons-material/Assignment'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import DashboardIcon from '@mui/icons-material/Dashboard'
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft'
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight'
import LightModeIcon from '@mui/icons-material/LightMode'
import LogoutIcon from '@mui/icons-material/Logout'
import MailIcon from '@mui/icons-material/Mail'
import MenuIcon from '@mui/icons-material/Menu'
import SettingsIcon from '@mui/icons-material/Settings'
import SyncIcon from '@mui/icons-material/Sync'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import VideocamIcon from '@mui/icons-material/Videocam'
import {
  AppBar, Avatar, Badge, Box, ButtonBase, Chip, Container, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Switch, Toolbar, Tooltip, Typography,
} from '@mui/material'
import { useState, type ComponentType } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useThemeMode } from '../App'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../data/store'
import { useApiPoller } from '../services/apiPoller'
import { BRAND_GRADIENT } from '../theme'

type NavLink = { to: string; label: string; icon: ComponentType<{ fontSize?: 'small' }> }
const NAV: { title?: string; items: NavLink[] }[] = [
  { items: [{ to: '/', label: 'Genel Bakış', icon: DashboardIcon }] },
  { title: 'Takip', items: [
    { to: '/work-items', label: 'İşler', icon: AssignmentIcon },
    { to: '/emails', label: 'E-postalar', icon: MailIcon },
    { to: '/meetings', label: 'Zoom Toplantıları', icon: VideocamIcon },
  ] },
  { title: 'Yönetim', items: [{ to: '/settings', label: 'Ayarlar', icon: SettingsIcon }] },
]

const NAV_W = 248
const NAV_W_COMPACT = 68
const COLLAPSE_KEY = 'yaver.nav.collapsed'

export default function AppLayout() {
  const { username, fullName, logout } = useAuth()
  const { mode, toggle } = useThemeMode()
  const db = useDb()
  const { running } = useApiPoller()
  const location = useLocation()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false } })
  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* gizli pencere */ }
    return !c
  })

  const badgeFor = (to: string) =>
    to === '/emails' ? db.emails.filter((e) => !e.is_read).length
      : to === '/work-items' ? db.items.filter((w) => w.status === 'new').length : 0
  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to))
  const enabledServices = db.apiConfigs.filter((c) => c.enabled).length
  const initial = (fullName || username || '?')[0]?.toUpperCase()

  const navItem = (item: NavLink, compact: boolean) => {
    const Icon = item.icon
    const badge = badgeFor(item.to)
    const button = (
      <ListItemButton key={item.to} component={Link} to={item.to} selected={isActive(item.to)} onClick={() => setDrawerOpen(false)}
                      sx={{ mx: 1.25, my: 0.25, borderRadius: '10px', minHeight: 40, position: 'relative',
                            pl: 1.5, pr: compact ? 1.5 : 1, justifyContent: compact ? 'center' : 'flex-start',
                            color: 'rgba(255,255,255,0.74)', transition: 'background-color 150ms, color 150ms',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' },
                            '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,0.14)', color: '#fff',
                                                                     boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' },
                            '&.Mui-selected::before': { content: '""', position: 'absolute', left: -10, top: 9, bottom: 9,
                                                        width: 3, borderRadius: 2, bgcolor: '#fff' } }}>
        <ListItemIcon sx={{ minWidth: compact ? 0 : 36, color: 'inherit' }}>
          <Badge color="warning" badgeContent={compact ? badge : 0} max={99}><Icon fontSize="small" /></Badge>
        </ListItemIcon>
        {!compact && (
          <>
            <ListItemText primary={item.label}
                          slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, fontWeight: isActive(item.to) ? 700 : 500 } } }} />
            {badge > 0 && <Chip size="small" color="warning" label={badge} sx={{ height: 20 }} />}
          </>
        )}
      </ListItemButton>
    )
    return compact ? <Tooltip key={item.to} title={item.label} placement="right">{button}</Tooltip> : button
  }

  const navContent = (compact: boolean) => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#fff', background: BRAND_GRADIENT }}>
      <Box sx={{ display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: 'center', gap: compact ? 0.5 : 0,
                 px: compact ? 1 : 2, pr: 1, py: compact ? 1.25 : 1.75 }}>
        <Box component={Link} to="/" onClick={() => setDrawerOpen(false)}
             sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexGrow: compact ? 0 : 1,
                   textDecoration: 'none', color: 'inherit', '&:hover': { opacity: 0.9 } }}>
          <Box component="img" src="/favicon.svg" alt="YAVER" sx={{ width: 36, height: 36, display: 'block', borderRadius: 2 }} />
          {!compact && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.1 }}>{db.general.app_title || 'YAVER'}</Typography>
              <Typography variant="caption" noWrap component="div" sx={{ opacity: 0.8 }}>Takım İş Takibi</Typography>
            </Box>
          )}
        </Box>
        <Tooltip title={compact ? 'Menüyü genişlet' : 'Menüyü daralt'} placement="right">
          <IconButton size="small" onClick={toggleCollapsed} aria-label={compact ? 'Menüyü genişlet' : 'Menüyü daralt'}
                      sx={{ display: { xs: 'none', md: 'inline-flex' }, color: 'rgba(255,255,255,0.75)',
                            '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}>
            {compact ? <KeyboardDoubleArrowRightIcon fontSize="small" /> : <KeyboardDoubleArrowLeftIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.10)' }} />
      <List sx={{ py: 1, flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map((g, i) => (
          <Box key={g.title ?? i}>
            {g.title && (compact
              ? <Divider sx={{ my: 1, mx: 1.5, borderColor: 'rgba(255,255,255,0.15)' }} />
              : <ListSubheader component="div" sx={{ bgcolor: 'transparent', mt: 1, pl: 2.75, lineHeight: '30px', position: 'static',
                                                     color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600,
                                                     letterSpacing: '.08em', textTransform: 'uppercase' }}>{g.title}</ListSubheader>)}
            {g.items.map((it) => navItem(it, compact))}
          </Box>
        ))}
      </List>
      {/* API servisi durumu — tıklayınca Ayarlar'daki servise gider */}
      <Tooltip title={`${enabledServices} etkin API servisi${running.length ? ' · çağrı sürüyor' : ''}`} placement="right">
        <ButtonBase onClick={() => { setDrawerOpen(false); navigate('/settings?tab=api') }}
                    sx={{ mx: 1.25, mb: 0.5, px: 1.5, py: 0.75, borderRadius: '10px', gap: 1, justifyContent: compact ? 'center' : 'flex-start',
                          color: 'rgba(255,255,255,0.7)', fontSize: 12.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' } }}>
          <SyncIcon fontSize="small" sx={{ animation: running.length ? 'spin 1s linear infinite' : 'none',
                                           '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
          {!compact && <span>API servisi: {enabledServices ? `${enabledServices} etkin` : 'kapalı'}</span>}
        </ButtonBase>
      </Tooltip>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.10)' }} />
      <Tooltip title={compact ? `${fullName || username}` : ''} placement="right">
        <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} aria-label="Kullanıcı menüsü"
                    sx={{ mx: 1.25, my: 1, px: compact ? 0.5 : 1, py: 0.75, borderRadius: '10px', gap: 1.25,
                          justifyContent: compact ? 'center' : 'flex-start', textAlign: 'left', color: '#fff',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 15, fontWeight: 700 }}>{initial}</Avatar>
          {!compact && (
            <>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 700, lineHeight: 1.3 }}>{fullName || username}</Typography>
                <Typography variant="caption" noWrap component="div" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.3 }}>{username}</Typography>
              </Box>
              <UnfoldMoreIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.6)' }} />
            </>
          )}
        </ButtonBase>
      </Tooltip>
    </Box>
  )

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
      <Box component="nav" aria-label="Ana menü"
           sx={{ display: { xs: 'none', md: 'block' }, width: collapsed ? NAV_W_COMPACT : NAV_W, flexShrink: 0,
                 position: 'sticky', top: 0, height: '100vh', transition: 'width 150ms ease' }}>
        {navContent(collapsed)}
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} color="inherit"
                sx={{ display: { xs: 'block', md: 'none' }, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar variant="dense" sx={{ gap: 1, minHeight: 56 }}>
            <IconButton color="inherit" edge="start" aria-label="Menüyü aç" onClick={() => setDrawerOpen(true)}><MenuIcon /></IconButton>
            <Typography variant="h6" sx={{ fontSize: 17 }}>YAVER</Typography>
          </Toolbar>
        </AppBar>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              slotProps={{ paper: { sx: { width: 260, mt: -1 } } }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>{initial}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap>{fullName || username}</Typography>
              <Chip size="small" label="Lokal hesap" sx={{ mt: 0.5 }} />
            </Box>
          </Box>
          <Divider />
          <MenuItem disableRipple sx={{ cursor: 'default', '&:hover': { bgcolor: 'transparent' } }}>
            <ListItemIcon>{mode === 'dark' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>Koyu tema</ListItemText>
            <Switch edge="end" checked={mode === 'dark'} onChange={toggle} />
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { setAnchor(null); setDrawerOpen(false); navigate('/settings') }}>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon><ListItemText>Ayarlar</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setAnchor(null); logout(); navigate('/login') }}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon><ListItemText>Çıkış Yap</ListItemText>
          </MenuItem>
        </Menu>
        <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} ModalProps={{ keepMounted: true }}
                sx={{ display: { md: 'none' } }}>
          <Box sx={{ width: NAV_W, height: '100%' }} role="presentation">{navContent(false)}</Box>
        </Drawer>
        <Container maxWidth={false} sx={{ py: 3 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}
