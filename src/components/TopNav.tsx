import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleUserRound, House, LogOut, Moon, PenLine, Sun, Trash2, UserRound, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import { LANGUAGE_OPTIONS, setLanguageId, useLanguageId } from '@/preferences/language'
import { THEME_OPTIONS, setThemeId, useThemeId } from '@/preferences/theme'
import ConfirmDialog from './ConfirmDialog'
import { useCurrentTopNavConfig } from './topNavConfig'

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

  const inWorldCreatorCenter = /^\/worlds\/[^/]+\/edit(\/|$)/.test(location.pathname)

  const worldId = useMemo(() => {
    const pathWorldId = location.pathname.match(/^\/worlds\/(\d+)/)?.[1]
    // A page that names itself (e.g. a profile reached from a world) keeps its own title.
    const backHrefWorldId = config.mainTitle ? undefined : config.backHref?.match(/^\/worlds\/(\d+)/)?.[1]
    return pathWorldId ?? backHrefWorldId ?? null
  }, [config.backHref, config.mainTitle, location.pathname])

  // Under a world, its published name — unless the page names it itself (the creator center: the draft's).
  const currentWorldQuery = useQuery({
    queryKey: ['world', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}`) as Promise<World>,
    enabled: !!worldId && config.mainTitle === undefined,
  })
  const mainTitle = config.mainTitle ?? currentWorldQuery.data?.name ?? (worldId ? '' : t.appTitle)
  const secondaryTitle = config.secondaryTitle ?? ''

  function closeMenu() {
    menuButtonRef.current?.focus({ preventScroll: true })
    setOpen(false)
  }

  async function handleLogout() {
    closeMenu()
    await logout()
    navigate('/login')
  }

  function goTo(path: string) {
    closeMenu()
    navigate(path)
  }

  function openDeleteAccountDialog() {
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

  const initial = (user?.username ?? '?').trim().charAt(0).toUpperCase()

  return (
    <>
      <div className="sticky top-0 z-20 bg-surface">
        <div className={config.bottomSlot ? '' : 'border-b border-line'}>
        <div className="page-width flex h-12 items-center gap-1 px-1.5">
          {config.backHref && (
            <Link to={config.backHref} state={config.backState} className="icon-btn" aria-label={t.back} title={t.back}>
              <ChevronLeft aria-hidden="true" className="h-6! w-6!" />
            </Link>
          )}
          {/* Home is one tap away: Discover, from anywhere but inside a world's creator center, which is left
              by Back (to /creator-center). */}
          {!inWorldCreatorCenter && (
            <Link to="/" className="icon-btn" aria-label={t.home} title={t.home}>
              <House aria-hidden="true" />
            </Link>
          )}

          {/* Takes whatever the actions leave, so a long name truncates instead of running under them. */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
            <h1 className="max-w-full truncate text-[16px] font-bold leading-tight text-ink">{mainTitle}</h1>
            {secondaryTitle && (
              <div className="max-w-full truncate text-[11px] font-medium leading-tight text-ink-3">{secondaryTitle}</div>
            )}
          </div>

          <div className="flex shrink-0 items-center">
            {config.rightAction}
            <button
              type="button"
              className="icon-btn"
              aria-label={t.openMenu}
              title={t.openMenu}
              ref={menuButtonRef}
              onClick={() => setOpen(true)}
            >
              <UserRound aria-hidden="true" />
            </button>
          </div>
        </div>
        </div>
        {config.bottomSlot}
      </div>

      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        <aside
          className={`pointer-events-auto absolute right-0 top-0 flex h-dvh w-[82%] max-w-sm flex-col bg-paper shadow-(--shadow-menu) transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
          aria-hidden={!open}
        >
          <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose text-lg font-bold text-white">
              {initial}
            </span>
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ink">{user?.username ?? ''}</span>
            <button type="button" className="icon-btn" aria-label={t.closeMenu} onClick={closeMenu}>
              <X aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
            <div className="card overflow-hidden">
              {/* Creator center is the only way into the creator center: the reading side never links there. */}
              {[
                { label: t.yourProfile, path: `/u/${encodeURIComponent(user?.username ?? '')}`, Icon: CircleUserRound },
                { label: t.creatorCenter, path: '/creator-center', Icon: PenLine },
              ].map(({ label, path, Icon }, index) => (
                <button
                  key={path}
                  type="button"
                  className={`flex h-13 w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-ink active:bg-paper-2 ${index > 0 ? 'border-t border-line' : ''}`}
                  onClick={() => goTo(path)}
                >
                  <Icon aria-hidden="true" className="h-5 w-5 text-ink-3" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-ink-4" />
                </button>
              ))}
            </div>

            <div>
              <span className="t-label mb-2">{t.language}</span>
              <div className="segmented">
                {LANGUAGE_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={option.id === language}
                    onClick={() => setLanguageId(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="t-label mb-2">{t.colorMode}</span>
              <div className="segmented">
                {THEME_OPTIONS.map(option => {
                  const Icon = themeIconByName[option.icon]
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={option.id === themeId}
                      onClick={() => setThemeId(option.id)}
                    >
                      <Icon aria-hidden="true" />
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <button type="button" className="btn btn-secondary btn-block" onClick={handleLogout}>
              <LogOut aria-hidden="true" />
              {t.logout}
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-block text-signal-red" onClick={openDeleteAccountDialog}>
              <Trash2 aria-hidden="true" />
              {t.deleteAccount}
            </button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDeleteAccount}
        title={t.deleteAccountTitle}
        description={t.deleteAccountDescription}
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
