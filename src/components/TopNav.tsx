import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, CircleUserRound, Ellipsis, Loader2, Moon, Sun, Trash2, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { LANGUAGE_OPTIONS, setLanguageId, useLanguageId } from '@/preferences/language'
import { THEME_OPTIONS, setThemeId, useThemeId } from '@/preferences/theme'
import { useSwitchWorldVersion } from '@/hooks/useSwitchWorldVersion'
import ConfirmDialog from './ConfirmDialog'
import { useCurrentTopNavConfig } from './topNavConfig'
import Skeleton from './Skeleton'

interface World {
  id: number
  name: string
  current_version_id?: number | null
}

interface WorldVersionListItem {
  id: number
  name: string | null
  number: number
  created_at: number
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
  const language = useLanguageId()
  const t = useUiText()
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
  const mainTitle = currentWorldQuery.data?.name ?? (worldId ? '' : config.mainTitle ?? t.home)
  const secondaryTitle = config.secondaryTitle ?? ''

  const versionsQuery = useQuery({
    queryKey: ['world-versions', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}/versions`) as Promise<WorldVersionListItem[]>,
    enabled: !!worldId,
  })
  const currentVersionLabel = useMemo(() => {
    const versions = versionsQuery.data
    const currentId = currentWorldQuery.data?.current_version_id
    if (!versions || versions.length === 0 || currentId == null) return null
    const current = versions.find(version => version.id === currentId)
    if (!current) return null
    const name = current.name?.trim()
    if (name && name.length > 0) return name
    // Keep the common single-version case clean; only surface a bare number once branches exist.
    return versions.length > 1 ? t.versionLabel(current.number) : null
  }, [currentWorldQuery.data?.current_version_id, t, versionsQuery.data])

  // Tapping the header title opens a quick version switcher (switch only; create/rename/delete
  // stay on the About tab). Only offered once a world has more than one version to switch between.
  const [versionSwitcherOpen, setVersionSwitcherOpen] = useState(false)
  const versionSwitcherRef = useRef<HTMLDivElement>(null)
  const versions = versionsQuery.data ?? []
  const canSwitchVersion = !!worldId && versions.length > 1
  const currentVersionId = currentWorldQuery.data?.current_version_id ?? null
  const switchVersionMutation = useSwitchWorldVersion(worldId ?? undefined)

  function versionTitle(version: WorldVersionListItem) {
    const name = version.name?.trim()
    return name && name.length > 0 ? name : t.versionLabel(version.number)
  }

  function switchVersion(versionId: number) {
    if (versionId === currentVersionId) {
      setVersionSwitcherOpen(false)
      return
    }
    if (switchVersionMutation.isPending) return
    switchVersionMutation.mutate(versionId, { onSuccess: () => setVersionSwitcherOpen(false) })
  }

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
    enabled: open,
  })
  const recentWorlds = (worldsQuery.data ?? []).slice(0, 5)

  useEffect(() => {
    if (!open) setAccountMenuOpen(false)
  }, [open])

  // Close the version switcher on navigation (e.g. switching worlds via the drawer).
  useEffect(() => {
    setVersionSwitcherOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!versionSwitcherOpen) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (versionSwitcherRef.current && !versionSwitcherRef.current.contains(target)) setVersionSwitcherOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setVersionSwitcherOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [versionSwitcherOpen])

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
              aria-label={t.back}
              title={t.back}
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </Link>
          ) : (
            <span className="h-9 w-9" aria-hidden="true" />
          )}

          <div className="absolute left-1/2 flex max-w-[calc(100%-8rem)] -translate-x-1/2 justify-center">
            {canSwitchVersion ? (
              <div ref={versionSwitcherRef} className="relative flex min-w-0 justify-center">
                <button
                  type="button"
                  onClick={() => setVersionSwitcherOpen(value => !value)}
                  aria-haspopup="menu"
                  aria-expanded={versionSwitcherOpen}
                  className="flex min-w-0 max-w-full items-baseline justify-center gap-1.5 rounded-full px-2 py-1 font-serif-zh text-[15px] italic transition-colors active:bg-paper-2"
                >
                  <span className="min-w-0 truncate text-ink-2">{mainTitle}</span>
                  <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[13px] not-italic text-ink-4">
                    ({currentVersionLabel ?? t.version})
                    <ChevronDown aria-hidden="true" className="h-3 w-3" />
                  </span>
                </button>

                {versionSwitcherOpen && (
                  <div
                    role="menu"
                    className="absolute left-1/2 top-full z-30 mt-1.5 w-[min(18rem,calc(100vw-2.5rem))] -translate-x-1/2 overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
                  >
                    <div className="max-h-72 overflow-y-auto py-1">
                      {versions.map(version => {
                        const isCurrent = version.id === currentVersionId
                        const isSwitching = switchVersionMutation.isPending && switchVersionMutation.variables === version.id
                        return (
                          <button
                            key={version.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isCurrent}
                            disabled={switchVersionMutation.isPending}
                            onClick={() => switchVersion(version.id)}
                            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-rose-tint/50 disabled:cursor-default"
                          >
                            <span
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-serif-zh text-[11px] italic ${isCurrent ? 'bg-rose text-white' : 'border border-rose-line bg-paper text-ink-3'
                                }`}
                            >
                              v{version.number}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-serif-zh text-[15px] italic text-ink">
                              {versionTitle(version)}
                            </span>
                            {isSwitching ? (
                              <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-rose" />
                            ) : isCurrent ? (
                              <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <h1 className="flex min-w-0 max-w-full items-baseline justify-center gap-1.5 font-serif-zh text-[15px] italic">
                <span className="min-w-0 truncate text-ink-2">{mainTitle}</span>
                {currentVersionLabel && (
                  <span className="shrink-0 whitespace-nowrap text-[13px] not-italic text-ink-4">
                    ({currentVersionLabel})
                  </span>
                )}
              </h1>
            )}
          </div>

          <div className="ml-auto flex h-9 items-center gap-1">
            {config.rightAction}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              aria-label={t.openMenu}
              title={t.openMenu}
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
        {config.bottomSlot}
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
          <div className="flex items-center gap-3 border-b border-rose-line px-6 py-5">
            <span className="min-w-0 flex-1 truncate font-serif-zh text-lg text-ink">{user?.username ?? ''}</span>
            <div
              className="grid w-20 shrink-0 grid-cols-2 overflow-hidden rounded-full border border-rose-line p-0.5"
              aria-label={t.language}
            >
              {LANGUAGE_OPTIONS.map(option => {
                const selected = option.id === language
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`grid h-6 place-items-center rounded-full font-serif-zh text-[10px] italic leading-none transition-colors ${selected ? 'bg-rose-pale text-rose-deep' : 'text-ink-3 hover:text-ink'
                      }`}
                    aria-label={option.label}
                    aria-pressed={selected}
                    onClick={() => setLanguageId(option.id)}
                  >
                    {option.shortLabel}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
              aria-label={t.closeMenu}
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
              <span>{t.yourEntities(entityLabel('world', { plural: true, capitalize: true }, language))}</span>
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
              <p className="t-meta">{t.noEntitiesYet(entityLabel('world', { plural: true }, language))}</p>
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

            <div className="mt-auto flex items-center justify-end gap-3">
              <div
                className="grid w-24 grid-cols-2 overflow-hidden rounded-full border border-rose-line p-0.5"
                aria-label={t.colorMode}
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
          </div>

          <div className="relative flex items-center justify-between gap-4 border-t border-rose-line px-6 py-5">
            <button
              type="button"
              className="t-meta text-left transition-colors hover:text-ink"
              onClick={handleLogout}
            >
              {t.logout}
            </button>
            <div className="relative">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
                aria-label={t.accountOptions}
                aria-expanded={accountMenuOpen}
                title={t.accountOptions}
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
                    <span>{t.deleteAccount}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDeleteAccount}
        title={t.deleteAccountTitle}
        description={t.deleteAccountDescription(
          entityLabel('world', { plural: true }, language),
          entityLabel('prompt', { plural: true }, language),
          entityLabel('piece', { plural: true }, language),
        )}
        confirmLabel={t.deleteAccountConfirm}
        pendingLabel={t.deleting}
        isPending={deleteAccountPending}
        error={deleteAccountError}
        onConfirm={handleDeleteAccount}
        onClose={() => setConfirmDeleteAccount(false)}
      />
    </>
  )
}
