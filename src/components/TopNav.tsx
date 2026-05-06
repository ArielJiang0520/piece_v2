import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Menu, Moon, Sun, Wrench, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { apiFetch } from '../api'
import { entityLabel } from '../config'
import { THEME_OPTIONS, setThemeId, useThemeId } from '../preferences/theme'
import { useCurrentTopNavConfig } from './topNavConfig'
import Skeleton from './Skeleton'

interface World {
  id: number
  name: string
}

const themeIconByName = {
  moon: Moon,
  sun: Sun,
} as const

export default function TopNav() {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const config = useCurrentTopNavConfig()
  const themeId = useThemeId()

  const worldId = useMemo(() => {
    const pathWorldId = location.pathname.match(/^\/worlds\/(\d+)/)?.[1]
    const backHrefWorldId = config.backHref?.match(/^\/worlds\/(\d+)/)?.[1]
    return pathWorldId ?? backHrefWorldId ?? null
  }, [config.backHref, location.pathname])

  const currentWorldQuery = useQuery({
    queryKey: ['world', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}`) as Promise<World>,
    enabled: !!worldId,
  })
  const mainTitle = currentWorldQuery.data?.name ?? (worldId ? '' : config.mainTitle ?? 'Home')
  const secondaryTitle = config.secondaryTitle ?? ''

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

  function goToAdminTools() {
    closeMenu()
    navigate('/admin')
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

          <h1 className="pointer-events-none absolute left-1/2 max-w-[calc(100%-8rem)] -translate-x-1/2 truncate text-sm font-medium text-ink-2">
            {mainTitle}
          </h1>

          <div className="ml-auto flex h-9 items-center gap-1">
            {config.rightAction}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              aria-label="Open menu"
              title="Open menu"
              ref={menuButtonRef}
              onClick={() => setOpen(true)}
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>
        {secondaryTitle && (
          <div className="page-width flex h-5 items-start justify-center px-4 ">
            <div className="max-w-full truncate text-[11px] font-medium leading-4 text-ink-4">
              {secondaryTitle}
            </div>
          </div>
        )}
      </div>

      <div
        className={`fixed inset-0 z-30 bg-ink/30 transition-opacity duration-200 dark:bg-black/40 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        <aside
          className={`pointer-events-auto absolute right-0 top-0 flex h-dvh w-2/3 max-w-sm flex-col bg-paper shadow-[-12px_0_28px_rgba(26,18,16,0.12)] transition-transform duration-200 ease-out dark:shadow-[-12px_0_28px_rgba(0,0,0,0.35)] ${open ? 'translate-x-0' : 'translate-x-full'
            }`}
          aria-hidden={!open}
        >
          <div className="flex items-center gap-2 border-b border-paper-3 px-5 py-4">
            <span className="font-serif-zh text-base text-ink">{user?.username ?? ''}</span>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
              aria-label="Admin tools"
              title="Admin tools"
              onClick={goToAdminTools}
            >
              <Wrench aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5">
            <button
              type="button"
              className="mb-3 flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4 transition-colors hover:text-ink"
              onClick={goToWorldList}
            >
              <span>Your {entityLabel('world', { plural: true, capitalize: true })}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
            {worldsQuery.isLoading ? (
              <ul className="flex flex-col gap-1">
                {Array.from({ length: 3 }, (_, index) => (
                  <li key={index} className="px-2 py-2">
                    <Skeleton className="h-5 w-full" />
                  </li>
                ))}
              </ul>
            ) : recentWorlds.length === 0 ? (
              <p className="text-xs text-ink-3">No {entityLabel('world', { plural: true })} yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {recentWorlds.map(w => (
                  <li key={w.id}>
                    <button
                      type="button"
                      className="w-full truncate rounded-sm px-1 py-1 text-left font-serif-zh text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                      onClick={() => goToWorld(w.id)}
                    >
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div
              className="mt-auto grid w-24 grid-cols-2 self-end overflow-hidden rounded-sm border border-paper-3 bg-paper-2 p-0.5"
              aria-label="Color mode"
            >
              {THEME_OPTIONS.map(option => {
                const selected = option.id === themeId
                const Icon = themeIconByName[option.icon]
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`grid h-8 place-items-center rounded-xs transition-colors ${selected ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                      }`}
                    aria-label={`${option.label} mode`}
                    aria-pressed={selected}
                    onClick={() => setThemeId(option.id)}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
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
      </div>
    </>
  )
}
