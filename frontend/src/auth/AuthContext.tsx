import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Giriş: şimdilik yerel admin hesabı (admin / admin).
 * Backend geldiğinde login() → POST /api/auth/login (lokal admin + LDAP doğrulama) olacak;
 * LDAP parametreleri Ayarlar > LDAP / Active Directory ekranından yönetilir.
 */
const LOCAL_USER = 'admin'
const LOCAL_PASS = 'admin'

interface AuthState {
  username: string | null
  fullName: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState(localStorage.getItem('yaver_username'))

  const login = async (user: string, password: string) => {
    await new Promise((r) => setTimeout(r, 300))
    if (user.trim().toLowerCase() !== LOCAL_USER || password !== LOCAL_PASS)
      throw new Error('Kullanıcı adı veya şifre hatalı')
    localStorage.setItem('yaver_username', LOCAL_USER)
    setUsername(LOCAL_USER)
  }

  const logout = () => {
    localStorage.removeItem('yaver_username')
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ username, fullName: username ? 'Yönetici' : null, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı')
  return ctx
}
