import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { APP_VERSION } from '../version'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandLogo } from '../components/Brand'
import { Sparkline } from '../components/Charts'
import { PriorityIcon, StatusIcon } from '../components/WorkKit'
import { avatarColor, initials } from '../theme'
import { dbWaiting } from '../data/store'

const ease = [0.22, 1, 0.36, 1] as const

/** Sağ panelde ürünü anlatan, hafifçe süzülen önizleme kartları */
function Float({ children, delay = 0, y = 10, style }: { children: React.ReactNode; delay?: number; y?: number; style?: React.CSSProperties }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay, ease }} style={{ position: 'absolute', ...style }}>
      <motion.div animate={{ y: [0, -y, 0] }} transition={{ duration: 6 + delay * 2, repeat: Infinity, ease: 'easeInOut' }}>{children}</motion.div>
    </motion.div>
  )
}
const glass = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(16px)', borderRadius: '16px',
                boxShadow: '0 24px 48px -16px rgba(0,0,0,0.5)', color: '#fff' } as const
function Av({ n }: { n: string }) {
  return <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: avatarColor(n), fontSize: 9.5, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #3A0A0C', ml: -0.75 }}>{initials(n)}</Box>
}

function Showcase() {
  return (
    <Box sx={{ position: 'relative', width: '100%', maxWidth: 520, height: 440 }}>
      <Float delay={0.15} style={{ left: 0, top: 10, width: 260 }}>
        <Box sx={{ ...glass, p: 2.25 }}>
          <Typography sx={{ fontSize: 12.5, opacity: 0.7 }}>Açık işler</Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' }}>24</Typography>
            <Sparkline data={[8, 10, 9, 13, 12, 16, 15, 19, 18, 24]} color="#FF8A80" width={110} height={38} />
          </Box>
          <Typography sx={{ fontSize: 12, color: '#6CE9A6', fontWeight: 600 }}>↘ geçen haftadan 3 az gecikme</Typography>
        </Box>
      </Float>
      <Float delay={0.3} y={14} style={{ right: 0, top: 120, width: 300 }}>
        <Box sx={{ ...glass, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, opacity: 0.75, fontSize: 12 }}><Box component="span">YVR-1042</Box><Box sx={{ flexGrow: 1 }} /><Av n="Zeynep Demir" /></Box>
          <Typography sx={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>Prod rapor servisi yavaşlığı</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25, alignItems: 'center' }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, height: 24, borderRadius: '7px', bgcolor: 'rgba(255,82,87,0.2)', color: '#FFB4AE', fontSize: 12, fontWeight: 600 }}>
              <StatusIcon status="in_progress" />Devam ediyor
            </Box>
            <PriorityIcon priority="high" />
            <Typography sx={{ fontSize: 12, opacity: 0.6 }}>· mailden</Typography>
          </Box>
        </Box>
      </Float>
      <Float delay={0.45} y={8} style={{ left: 30, top: 270, width: 290 }}>
        <Box sx={{ ...glass, p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 2, bgcolor: '#6CE9A6' }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ fontSize: 12, opacity: 0.7 }}>10:30 · 45 dk · Zoom</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Haftalık takım senkronu</Typography>
          </Box>
          <Box sx={{ display: 'flex', pl: 0.75 }}><Av n="Ayşe Yılmaz" /><Av n="Mehmet Kaya" /><Av n="Can Öztürk" /></Box>
        </Box>
      </Float>
    </Box>
  )
}

export default function Login() {
  const { login, username: current } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  if (current) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await login(username, password); navigate('/') }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setAttempt((n) => n + 1) }
    finally { setBusy(false) }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, bgcolor: 'background.paper' }}>
      {/* Sol: form */}
      <Box sx={{ display: 'flex', flexDirection: 'column', p: { xs: 3, sm: 5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <BrandLogo height={30} />
        </Box>
        <Box sx={{ flexGrow: 1, display: 'grid', placeItems: 'center', py: 6 }}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} style={{ width: '100%', maxWidth: 380 }}>
            <Typography component="h1" sx={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.15 }}>Tekrar hoş geldiniz</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>Takımınıza gelen işleri takip etmek için oturum açın.</Typography>
            <form onSubmit={submit} noValidate>
              <Stack spacing={2}>
                <Box>
                  <Typography component="label" htmlFor="u" variant="body2" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>Kullanıcı adı</Typography>
                  <TextField id="u" fullWidth placeholder="kullanici.adi" value={username} autoFocus autoComplete="username" onChange={(e) => setUsername(e.target.value)}
                             slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> } }} />
                </Box>
                <Box>
                  <Typography component="label" htmlFor="p" variant="body2" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>Şifre</Typography>
                  <TextField id="p" fullWidth placeholder="••••••••" value={password} type={showPass ? 'text' : 'password'} autoComplete="current-password"
                             onChange={(e) => setPassword(e.target.value)}
                             slotProps={{ input: {
                               startAdornment: <InputAdornment position="start"><LockOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>,
                               endAdornment: <InputAdornment position="end"><IconButton size="small" edge="end" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                                 {showPass ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}</IconButton></InputAdornment> } }} />
                </Box>
                {dbWaiting && !error && (
                  <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2.5 }}>
                    Sunucu açık ama veritabanı hazır değil ({dbWaiting}). Birkaç dakika sonra sayfayı yenileyin;
                    düzelmezse yöneticiniz yaver konteyner logundaki açıklamaya baksın.
                  </Alert>
                )}
                {error && (
                  <motion.div key={attempt} animate={{ x: [0, -8, 8, -5, 5, 0] }} transition={{ duration: 0.4 }}>
                    <Alert severity="error" variant="outlined" sx={{ borderRadius: 2.5 }}>{error}</Alert>
                  </motion.div>
                )}
                <Button type="submit" variant="contained" fullWidth size="large" disabled={busy || !username || !password} sx={{ height: 46, fontSize: 15, mt: 1 }}>
                  {busy ? <CircularProgress size={20} color="inherit" /> : 'Oturum aç'}
                </Button>
              </Stack>
            </form>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 3, p: 1.5, borderRadius: 2.5, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
              <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">Kurumsal hesabınızla (LDAP / Active Directory) ya da lokal yönetici hesabıyla giriş yapabilirsiniz.</Typography>
            </Box>
          </motion.div>
        </Box>
        <Typography variant="caption" color="text.disabled">© {new Date().getFullYear()} Yaver · v{APP_VERSION}</Typography>
      </Box>

      {/* Sağ: ürün vitrini */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, m: 1.5, borderRadius: 5, position: 'relative', overflow: 'hidden', color: '#fff',
                 flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 6,
                 background: 'radial-gradient(1200px 600px at 0% 0%, #DC0005 0%, transparent 55%), radial-gradient(900px 500px at 100% 100%, #FF5A36 0%, transparent 50%), #1C0507' }}>
        <Box sx={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none',
                   backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                   backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)' }} />
        <Showcase />
        <Box sx={{ position: 'relative', maxWidth: 440, textAlign: 'center', mt: 2 }}>
          <Typography sx={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2 }}>Mailler, toplantılar ve işler.<br />Tek yerde, kimse unutmadan.</Typography>
          <Typography sx={{ opacity: 0.65, mt: 1.5, fontSize: 14.5, lineHeight: 1.6 }}>Yaver takıma gelen her talebi toplar, sahibini ve terminini görünür kılar.</Typography>
        </Box>
      </Box>
    </Box>
  )
}
