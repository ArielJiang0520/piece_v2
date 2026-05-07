import { createContext, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'
import Skeleton, { SkeletonText } from './components/Skeleton'

interface User {
  username: string
}

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(username: string, password: string) {
    const u = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    queryClient.clear()
    setUser(u)
  }

  async function signup(username: string, password: string) {
    const u = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    queryClient.clear()
    setUser(u)
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    queryClient.clear()
    setUser(null)
  }

  async function deleteAccount() {
    await apiFetch('/api/auth/account', { method: 'DELETE' })
    queryClient.clear()
    setUser(null)
  }

  if (loading) {
    return (
      <div className="page-width min-h-screen px-4 py-12">
        <Skeleton className="mb-8 h-9 w-40" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-md border border-paper-3 bg-paper px-5 py-4">
              <Skeleton className="mb-3 h-3 w-24" />
              <Skeleton className="h-6 w-2/3" />
              <SkeletonText className="mt-4" lineClassName="h-3" lines={2} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
