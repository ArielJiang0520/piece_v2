import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, CircleUserRound, Ellipsis, Moon, Sun, Trash2, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { apiFetch } from '../api'
import { entityLabel } from '../config'
import { THEME_OPTIONS, setThemeId, useThemeId } from '../preferences/theme'
import ConfirmDialog from './ConfirmDialog'
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [deleteAccountPending, setDeleteAccountPending] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { user, logout, deleteAccount } = useAuth()
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

  useEffect(() => {
    if (!open) setAccountMenuOpen(false)
  }, [open])

  function closeMenu() {
    menuButtonRef.current?.focus({ preventScroll: true })
    setAccountMenuOpen(false)
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

  function openDeleteAccountDialog() {
    setAccountMenuOpen(false)
    setDeleteAccountError('')
    setConfirmDeleteAccount(true)
  }

  async function handleDeleteAccount() {
    if (deleteAccountPending) return

    setDeleteAccountError('')
    setDeleteAccountPending(true)
    try {
      await deleteAccount()
      setConfirmDeleteAccount(false)
      setOpen(false)
      navigate('/login')
    } catch (error) {
      setDeleteAccountError(error instanceof Error ? error.message : 'Could not delete account')
      setDeleteAccountPending(false)
    }
  }

  return (
    <>
      <div className="sticky top-0 z-20 bg-paper/85 backdrop-blur">
        <div className="page-width relative flex h-12 items-center px-4">
          {config.backHref ? (
            <Link
              to={config.backHref}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </Link>
          ) : (
            <span className="h-9 w-9" aria-hidden="true" />
          )}

          <h1 className="pointer-events-none absolute left-1/2 max-w-[calc(100%-8rem)] -translate-x-1/2 truncate font-serif-zh text-[15px] italic text-ink-2">
            {mainTitle}
          </h1>

          <div className="ml-auto flex h-9 items-center gap-1">
            {config.rightAction}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              aria-label="Open menu"
              title="Open menu"
              ref={menuButtonRef}
              onClick={() => setOpen(true)}
            >
              <CircleUserRound aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>
        {secondaryTitle && (
          <div className="page-width flex h-5 items-start justify-center px-4 ">
            <div className="t-eyebrow max-w-full truncate leading-4">
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
          className={`pointer-events-auto absolute right-0 top-0 flex h-dvh w-2/3 max-w-sm flex-col bg-paper shadow-(--shadow-menu) transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'
            }`}
          aria-hidden={!open}
        >
          <div className="flex items-center gap-2 border-b border-rose-line px-6 py-5">
            <span className="font-serif-zh text-lg text-ink">{user?.username ?? ''}</span>
            <button
              type="button"
              className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            <button
              type="button"
              className="t-eyebrow mb-4 flex w-full items-center justify-between transition-colors hover:text-ink"
              onClick={goToWorldList}
            >
              <span>Your {entityLabel('world', { plural: true, capitalize: true })}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
            {worldsQuery.isLoading ? (
              <ul className="flex flex-col gap-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <li key={index} className="py-1.5">
                    <Skeleton className="h-5 w-full" />
                  </li>
                ))}
              </ul>
            ) : recentWorlds.length === 0 ? (
              <p className="t-meta">No {entityLabel('world', { plural: true })} yet.</p>
            ) : (
              <ul className="flex flex-col">
                {recentWorlds.map(w => (
                  <li key={w.id}>
                    <button
                      type="button"
                      className="w-full truncate py-2 text-left font-serif-zh text-[15px] text-ink-2 transition-colors hover:text-ink"
                      onClick={() => goToWorld(w.id)}
                    >
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div
              className="mt-auto grid w-24 grid-cols-2 self-end overflow-hidden rounded-full border border-rose-line p-0.5"
              aria-label="Color mode"
            >
              {THEME_OPTIONS.map(option => {
                const selected = option.id === themeId
                const Icon = themeIconByName[option.icon]
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`grid h-8 place-items-center rounded-full transition-colors ${selected ? 'bg-rose-pale text-rose-deep' : 'text-ink-3 hover:text-ink'
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

          <div className="relative flex items-center justify-between gap-4 border-t border-rose-line px-6 py-5">
            <button
              type="button"
              className="t-meta text-left transition-colors hover:text-ink"
              onClick={handleLogout}
            >
              Log out
            </button>
            <div className="relative">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
                aria-label="Account options"
                aria-expanded={accountMenuOpen}
                title="Account options"
                onClick={() => setAccountMenuOpen(value => !value)}
              >
                <Ellipsis aria-hidden="true" className="h-5 w-5" />
              </button>
              {accountMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-44 overflow-hidden rounded-md border border-rose-line bg-paper shadow-(--shadow-menu)">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-signal-red transition-colors hover:bg-paper-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                    onClick={openDeleteAccountDialog}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    <span>Delete account</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDeleteAccount}
        title="Are you sure?"
        description={`This will permanently delete your account and all associated ${entityLabel('world', { plural: true })}, ${entityLabel('prompt', { plural: true })}, and ${entityLabel('piece', { plural: true })}.`}
        confirmLabel="Yes, delete account"
        pendingLabel="Deleting..."
        isPending={deleteAccountPending}
        error={deleteAccountError}
        onConfirm={handleDeleteAccount}
        onClose={() => setConfirmDeleteAccount(false)}
      />
    </>
  )
}
