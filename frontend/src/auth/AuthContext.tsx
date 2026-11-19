import { createContext, useContext, useState, type ReactNode } from 'react'
import { apiFetch, backend, clearSession, refresh, setSession } from '../data/store'

/**
 * Giriş.
 *  - Sunucu modunda: POST /api/auth/login → lokal admin (admin / admin) veya LDAP etkinse Active Directory doğrulaması.
 *  - Demo modunda (sunucu yok): yalnız yerel admin / admin.
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
  const [fullName, setFullName] = useState(localStorage.getItem('yaver_fullname'))

  const login = async (user: string, password: string) => {
    let name = 'Yönetici'
    let uname = LOCAL_USER
    if (backend === 'api') {
      const r = await apiFetch<{ token: string; username: string; full_name: string | null }>('/auth/login', {
        method: 'POST', body: { username: user, password },
      })
      setSession(r.token)
      uname = r.username
      name = r.full_name || r.username
      await refresh()
    } else {
      await new Promise((r) => setTimeout(r, 300))
      if (user.trim().toLowerCase() !== LOCAL_USER || password !== LOCAL_PASS)
        throw new Error('Kullanıcı adı veya şifre hatalı')
      // Sunucudaki ADMIN_ACTS_AS ile aynı: admin ile girilir, ekip üyesi olarak görünülür
      uname = 'mehmet.kaya'
      name = 'Mehmet Kaya'
    }
    localStorage.setItem('yaver_username', uname)
    localStorage.setItem('yaver_fullname', name)
    setUsername(uname)
    setFullName(name)
  }

  const logout = () => {
    clearSession()
    setUsername(null)
    setFullName(null)
  }

  return (
    <AuthContext.Provider value={{ username, fullName: username ? fullName ?? 'Yönetici' : null, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı')
  return ctx
}
