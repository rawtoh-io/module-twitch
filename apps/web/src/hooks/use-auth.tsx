import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { query } from '@/api/client'
import type { Org, UserInfo } from '@module-twitch/shared/validation'

interface AuthCtx {
  user: UserInfo | null
  loading: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    query
      .get('api/auth/me')
      .json<{ user: UserInfo | null }>()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async () => {
    const res = await query.get('api/auth/login').json<{ url: string }>()
    window.location.href = res.url
  }

  const logout = async () => {
    await query.post('api/auth/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function useOrg(): Org {
  const { user } = useAuth()
  const { orgSlug } = useParams({ strict: false })
  const org = user?.organizations?.find((o) => o.slug === orgSlug)
  if (!org) throw new Error('Org not found')
  return org
}
