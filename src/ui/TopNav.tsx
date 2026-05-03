import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Menu, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { apiFetch } from '../api'

interface World {
  id: number
  name: string
}

interface TopNavConfig {
  title?: string
  backHref?: string
}

const TopNavConfigContext = createContext<TopNavConfig>({})
const TopNavSetConfigContext = createContext<(config: TopNavConfig) => void>(() => {})

export function TopNavProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<TopNavConfig>({})
  return (
    <TopNavSetConfigContext.Provider value={setConfig}>
      <TopNavConfigContext.Provider value={config}>
        {children}
      </TopNavConfigContext.Provider>
    </TopNavSetConfigContext.Provider>
  )
}

export function useTopNavConfig(config: TopNavConfig) {
  const setConfig = useContext(TopNavSetConfigContext)
  const { title, backHref } = config
  useEffect(() => {
    setConfig({ title, backHref })
    return () => setConfig({})
  }, [setConfig, title, backHref])
}

export default function TopNav() {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const config = useContext(TopNavConfigContext)

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
    enabled: open,
  })
  const recentWorlds = (worldsQuery.data ?? []).slice(0, 5)

  function closeMenu() {
    menuButtonRef.current?.focus({ preventScroll: true })
    setOpen(false)
  }

  async function handleLogout() {
    closeMenu()
    await logout()
    navigate('/login')
  }

  function goToWorld(id: number) {
    closeMenu()
    navigate(`/worlds/${id}`)
  }

  function goToWorldList() {
    closeMenu()
    navigate('/worlds')
  }

  return (
    <>
      <div className="sticky top-0 z-20 bg-paper/85 backdrop-blur">
        <div className="page-width relative flex h-12 items-center px-4">
          {config.backHref ? (
            <Link
              to={config.backHref}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </Link>
          ) : (
            <span className="h-9 w-9" aria-hidden="true" />
          )}

          {config.title && (
            <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-medium text-ink-2">
              {config.title}
            </h1>
          )}

          <button
            type="button"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
            aria-label="Open menu"
            title="Open menu"
            ref={menuButtonRef}
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-30 bg-ink/30 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <aside
        className={`fixed right-0 top-0 z-40 flex h-dvh w-2/3 max-w-sm flex-col bg-paper shadow-[-12px_0_28px_rgba(26,18,16,0.12)] transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-paper-3 px-5 py-4">
          <span className="font-serif-zh text-base text-ink">{user?.username ?? ''}</span>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
            aria-label="Close menu"
            onClick={closeMenu}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <button
            type="button"
            className="mb-3 flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4 transition-colors hover:text-ink"
            onClick={goToWorldList}
          >
            <span>Your Worlds</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
          {recentWorlds.length === 0 ? (
            <p className="text-sm text-ink-3">No worlds yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recentWorlds.map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="w-full truncate rounded-sm px-2 py-2 text-left font-serif-zh text-[15px] text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                    onClick={() => goToWorld(w.id)}
                  >
                    {w.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-paper-3 px-5 py-4">
          <button
            type="button"
            className="w-full rounded-sm border border-paper-3 px-4 py-2 text-sm text-ink-3 transition-colors hover:border-ink-4 hover:text-ink"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </aside>
    </>
  )
}
