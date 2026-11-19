import { CssBaseline, ThemeProvider } from '@mui/material'
import { MotionConfig } from 'motion/react'
import { SnackbarProvider } from 'notistack'
import { createContext, useContext, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppLayout from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Emails from './pages/Emails'
import Login from './pages/Login'
import Meetings from './pages/Meetings'
import Settings from './pages/Settings'
import WorkItems from './pages/WorkItems'
import { ApiPollerProvider } from './services/apiPoller'
import { createAppTheme, type ThemeMode } from './theme'

const ThemeModeContext = createContext<{ mode: ThemeMode; toggle: () => void }>({ mode: 'light', toggle: () => {} })
export const useThemeMode = () => useContext(ThemeModeContext)

function Protected() {
  const { username } = useAuth()
  if (!username) return <Navigate to="/login" replace />
  // API çağrı servisi yalnız oturum açıkken çalışır
  return <ApiPollerProvider><AppLayout /></ApiPollerProvider>
}

export default function App() {
  const [mode, setMode] = useState<ThemeMode>((localStorage.getItem('yaver_theme') as ThemeMode) || 'light')
  const theme = useMemo(() => createAppTheme(mode), [mode])
  const toggle = () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark'
    localStorage.setItem('yaver_theme', next)
    setMode(next)
  }

  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
    {/* İşletim sisteminde "hareketi azalt" açıksa tüm animasyonlar kapanır (erişilebilirlik) */}
    <MotionConfig reducedMotion="user">
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider maxSnack={3} autoHideDuration={2500} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<Protected />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/work-items" element={<WorkItems />} />
                  <Route path="/emails" element={<Emails />} />
                  <Route path="/meetings" element={<Meetings />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </MotionConfig>
    </ThemeModeContext.Provider>
  )
}
