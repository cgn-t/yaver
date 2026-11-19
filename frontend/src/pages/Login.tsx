import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import MailOutlineIcon from '@mui/icons-material/MailOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { Alert, Box, Button, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Stagger, StaggerItem } from '../components/Motion'
import { motion } from 'motion/react'

const FEATURES = [
  { icon: <MailOutlineIcon />, title: 'E-posta Takibi', desc: 'Takım kutusuna gelen her mail kayıt altında; tek tıkla işe dönüşür' },
  { icon: <VideocamOutlinedIcon />, title: 'Zoom Toplantıları', desc: 'Planlanan ve yapılan toplantılar, katılımcılar ve aksiyon maddeleri' },
  { icon: <AssignmentOutlinedIcon />, title: 'Tüm İşler Tek Yerde', desc: 'Kaynağı ne olursa olsun takıma gelen işler; durum, öncelik, sahip ve termin' },
]

function BrandMark({ size = 52 }: { size?: number }) {
  return <Box component="img" src="/favicon.svg" alt="YAVER"
              sx={{ width: size, height: size, borderRadius: 2.5, filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.35))' }} />
}

export default function Login() {
  const { login, username: current } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)   // hatalı denemede uyarı kutusu yeniden sallansın

  if (current) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAttempt((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      {/* Sol: marka paneli (md+) */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', flexBasis: '48%', maxWidth: 620, minWidth: 0,
                 p: { md: 6, lg: 8 }, color: '#fff', position: 'relative', overflow: 'hidden',
                 // Yavaş akan gradyan (performans: yalnız background-position; hareketi azalt açıksa durur)
                 background: 'linear-gradient(155deg, #5e1317 0%, #971d24 35%, #c62a36 60%, #7e1a1f 100%)',
                 backgroundSize: '220% 220%', animation: 'yaverFlow 18s ease-in-out infinite alternate',
                 '@keyframes yaverFlow': { '0%': { backgroundPosition: '0% 0%' }, '100%': { backgroundPosition: '100% 100%' } } }}>
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                   background: 'radial-gradient(circle at 82% 12%, rgba(255,255,255,0.16), transparent 46%)' }} />
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
                   backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                   backgroundSize: '38px 38px', maskImage: 'radial-gradient(circle at 30% 40%, #000 20%, transparent 75%)' }} />
        {[{ s: 340, x: '62%', y: '-8%', d: 22 }, { s: 260, x: '-12%', y: '58%', d: 28 }].map((o, i) => (
          <motion.div key={i} aria-hidden
                      style={{ position: 'absolute', left: o.x, top: o.y, width: o.s, height: o.s, borderRadius: '50%', pointerEvents: 'none',
                               background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0.02) 70%)', filter: 'blur(2px)' }}
                      animate={{ y: [0, -18, 0], x: [0, 10, 0] }} transition={{ duration: o.d, repeat: Infinity, ease: 'easeInOut' }} />
        ))}
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.75 }}>
          <BrandMark />
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1 }}>YAVER</Typography>
            <Typography sx={{ opacity: 0.85, fontSize: 13 }}>Takım İş Takip Platformu</Typography>
          </Box>
        </Box>
        <Box sx={{ position: 'relative', mt: 'auto' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 'clamp(1.75rem, 1.2rem + 1.2vw, 2.4rem)', letterSpacing: '-0.025em', lineHeight: 1.12, mb: 1.5 }}>
            Takıma gelen her iş,<br />tek ekranda ve takipte.
          </Typography>
          <Typography sx={{ opacity: 0.82, mb: 4.5, maxWidth: 400, fontSize: 15, lineHeight: 1.55 }}>
            Mailler, Zoom toplantıları ve diğer kaynaklardan gelen işler otomatik toplanır;
            kim, neyi, ne zamana kadar yapacak her an görünür.
          </Typography>
          <Stagger style={{ display: 'grid', gap: 12 }}>
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                {/* Cam (glassmorphism) kart: yarı saydam zemin + arka plan bulanıklığı */}
                <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start', p: 1.75, borderRadius: 3,
                           bgcolor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                           backdropFilter: 'blur(10px) saturate(110%)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                           transition: 'transform .25s cubic-bezier(.22,1,.36,1), background-color .25s ease',
                           '&:hover': { transform: 'translateX(4px)', bgcolor: 'rgba(255,255,255,0.12)' } }}>
                  <Box sx={{ flexShrink: 0, width: 42, height: 42, borderRadius: 2, display: 'grid', placeItems: 'center',
                             bgcolor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>{f.icon}</Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>{f.title}</Typography>
                    <Typography sx={{ opacity: 0.8, fontSize: 13.5, lineHeight: 1.4 }}>{f.desc}</Typography>
                  </Box>
                </Box>
              </StaggerItem>
            ))}
          </Stagger>
        </Box>
        <Typography sx={{ position: 'relative', mt: 6, opacity: 0.72, fontSize: 12.5 }}>
          🔒 LDAP / Active Directory ile kurumsal kimlik doğrulama
        </Typography>
      </Box>

      {/* Sağ: giriş formu */}
      <Box sx={{ flexGrow: 1, display: 'grid', placeItems: 'center', p: { xs: 3, sm: 5 }, position: 'relative' }}>
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                   background: 'radial-gradient(circle at 70% 8%, rgba(229,57,70,0.10), transparent 42%)' }} />
        <motion.div style={{ position: 'relative', width: '100%', maxWidth: 396 }}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', alignItems: 'center', gap: 1, mb: 4 }}>
            <BrandMark size={64} />
            <Typography sx={{ fontWeight: 800, fontSize: 22 }}>YAVER</Typography>
            <Typography variant="body2" color="text.secondary">Takım İş Takip Platformu</Typography>
          </Box>
          <Typography variant="h5" sx={{ mb: 0.5 }}>Oturum Aç</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>Devam etmek için hesabınızla giriş yapın.</Typography>
          <form onSubmit={submit}>
            <Stack spacing={2.25}>
              <TextField label="Kullanıcı Adı" placeholder="kullanici.adi" fullWidth value={username} autoFocus
                         onChange={(e) => setUsername(e.target.value)} helperText="LDAP (AD) veya lokal hesap"
                         slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: (
                           <InputAdornment position="start"><PersonOutlineIcon fontSize="small" color="action" /></InputAdornment>) } }} />
              <TextField label="Şifre" fullWidth value={password} type={showPass ? 'text' : 'password'}
                         onChange={(e) => setPassword(e.target.value)}
                         slotProps={{ inputLabel: { shrink: true }, input: {
                           startAdornment: (<InputAdornment position="start"><LockOutlinedIcon fontSize="small" color="action" /></InputAdornment>),
                           endAdornment: (
                             <InputAdornment position="end">
                               <IconButton onClick={() => setShowPass((s) => !s)} edge="end" size="small"
                                           aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                                 {showPass ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                               </IconButton>
                             </InputAdornment>) } }} />
              {error && (
                <motion.div key={attempt} initial={{ x: 0 }} animate={{ x: [0, -8, 8, -5, 5, 0] }} transition={{ duration: 0.4 }}>
                  <Alert severity="error">{error}</Alert>
                </motion.div>
              )}
              <Button type="submit" variant="contained" fullWidth size="large" disableElevation sx={{ py: 1.25, fontSize: 15 }}
                      disabled={busy || !username || !password}>
                {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
              </Button>
            </Stack>
          </form>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 4 }}>
            © {new Date().getFullYear()} YAVER · Takım İş Takibi · v0.1.0
          </Typography>
        </motion.div>
      </Box>
    </Box>
  )
}
