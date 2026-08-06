import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, History, Loader2, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { relativeTime } from '@/utils/time'
import { useSwitchWorldVersion } from '@/hooks/useSwitchWorldVersion'
import WorldTabs from '../shared/WorldTabs'
import { useWorldAdditions } from '../shared/useWorldAdditions'

const ONE_HOUR_MS = 60 * 60 * 1e3

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  current_version_id: number | null
  current_version_name: string | null
  updated_at: number
}

interface WorldVersionListItem {
  id: number
  name: string | null
  number: number
  created_at: number
}

interface PromptCountResponse {
  total: number
}

interface CachedPromptPages {
  pages?: Array<{ total?: number }>
}

export default function WorldAbout() {
  const language = useLanguageId()
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [namingNewVersion, setNamingNewVersion] = useState(false)
  const [newVersionName, setNewVersionName] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftVersionName, setDraftVersionName] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState(false)
  const [deleteVersionError, setDeleteVersionError] = useState('')
  const [confirmDeleteWorld, setConfirmDeleteWorld] = useState(false)
  const [deleteWorldError, setDeleteWorldError] = useState('')
  const versionMenuRef = useRef<HTMLDivElement | null>(null)

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<World>,
    enabled: !!id,
  })

  const promptCountQuery = useQuery({
    queryKey: ['world-clusters-count', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/clusters?page=1&limit=1`) as Promise<PromptCountResponse>,
    enabled: !!id,
    placeholderData: () => {
      const cachedEntries = queryClient.getQueriesData<CachedPromptPages>({ queryKey: ['world-clusters', id] })
      for (const [, data] of cachedEntries) {
        const total = data?.pages?.[0]?.total
        if (typeof total === 'number') return { total }
      }
      return undefined
    },
  })

  const versionsQuery = useQuery({
    queryKey: ['world-versions', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/versions`) as Promise<WorldVersionListItem[]>,
    enabled: !!id,
  })

  // Shared with the header quick-switcher; invalidates the version-filtered prompt list too.
  const switchMutation = useSwitchWorldVersion(id)

  const { additions, activeIds, activeAdditions, toggle } = useWorldAdditions(id)

  const createVersionMutation = useMutation({
    mutationFn: (versionName: string) =>
      apiFetch(`/api/worlds/${id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ version_name: versionName }),
      }),
    onSuccess: () => {
      setVersionMenuOpen(false)
      invalidateVersionQueries()
    },
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/worlds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draftName,
          body: draftBody,
          version_name: draftVersionName,
        }),
      }),
    onSuccess: () => {
      setEditing(false)
      invalidateVersionQueries()
    },
  })

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: number) =>
      apiFetch(`/api/worlds/${id}/versions/${versionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDeleteVersion(false)
      setDeleteVersionError('')
      setEditing(false)
      invalidateVersionQueries()
    },
    onError: error => {
      setDeleteVersionError(error instanceof Error ? error.message : t.couldNotDeleteVersion)
    },
  })

  const deleteWorldMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.removeQueries({ queryKey: ['world', id] })
      queryClient.removeQueries({ queryKey: ['world-versions', id] })
      queryClient.removeQueries({ queryKey: ['world-clusters', id] })
      queryClient.removeQueries({ queryKey: ['world-clusters-count', id] })
      queryClient.removeQueries({ queryKey: ['world-additions', id] })
      navigate('/worlds')
    },
    onError: error => {
      setDeleteWorldError(error instanceof Error ? error.message : t.couldNotDelete(entityLabel('world', {}, language)))
    },
  })

  function invalidateVersionQueries() {
    queryClient.invalidateQueries({ queryKey: ['worlds'] })
    queryClient.invalidateQueries({ queryKey: ['world', id] })
    queryClient.invalidateQueries({ queryKey: ['world-versions', id] })
    // Creating/switching/deleting a version changes which version is checked out, so the
    // version-filtered prompt list and its count need to refetch.
    queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
    queryClient.invalidateQueries({ queryKey: ['world-clusters-count', id] })
    // Additions are version-owned too: a switch shows a different shelf, and a new version an
    // empty one. The active set falls away on its own — it is keyed by version.
    queryClient.invalidateQueries({ queryKey: ['world-additions', id] })
  }

  useEffect(() => {
    if (worldQuery.isError) navigate('/worlds')
  }, [navigate, worldQuery.isError])

  useEffect(() => {
    if (!versionMenuOpen) {
      setNamingNewVersion(false)
      setNewVersionName('')
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (versionMenuRef.current && !versionMenuRef.current.contains(target)) setVersionMenuOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setVersionMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [versionMenuOpen])

  const world = worldQuery.data
  const promptCount = promptCountQuery.data?.total

  const versions = versionsQuery.data ?? []
  const currentVersionId = world?.current_version_id ?? null
  const currentVersion = versions.find(version => version.id === currentVersionId) ?? versions[0]
  const body = world?.body ?? ''
  const hasBody = body.trim().length > 0
  const switchingId = switchMutation.isPending ? switchMutation.variables : null

  function versionTitle(version: { name: string | null; number: number }) {
    const trimmed = version.name?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : t.versionLabel(version.number)
  }
  const currentVersionTitle = currentVersion ? versionTitle(currentVersion) : null
  const versionDropdownLoading = versionsQuery.isLoading && currentVersionTitle === null

  const dirty = !!world && (
    draftName !== world.name
    || draftBody !== world.body
    || draftVersionName !== (world.current_version_name ?? '')
  )
  const canSave = draftName.trim().length > 0

  function startEditing() {
    if (!world) return
    setDraftName(world.name)
    setDraftVersionName(world.current_version_name ?? '')
    setDraftBody(world.body)
    saveMutation.reset()
    setVersionMenuOpen(false)
    setEditing(true)
  }

  function save() {
    if (!canSave || saveMutation.isPending) return
    if (!dirty) {
      setEditing(false)
      return
    }
    saveMutation.mutate()
  }

  function cancelEditing() {
    if (saveMutation.isPending) return
    if (dirty) {
      setConfirmCancel(true)
      return
    }
    setEditing(false)
  }

  function switchVersion(versionId: number) {
    if (versionId === currentVersionId) {
      setVersionMenuOpen(false)
      return
    }
    if (switchMutation.isPending) return
    switchMutation.mutate(versionId, { onSuccess: () => setVersionMenuOpen(false) })
  }

  function createVersion() {
    if (createVersionMutation.isPending) return
    createVersionMutation.mutate(newVersionName.trim())
  }

  function versionDotClass(timestamp: number) {
    return Date.now() - timestamp < ONE_HOUR_MS ? 'bg-rose' : 'bg-ink-4/50'
  }

  const saveError = saveMutation.isError
    ? (saveMutation.error instanceof Error ? saveMutation.error.message : t.couldNotSave(entityLabel('world', {}, language)))
    : ''

  const worldTabs = useMemo(
    () => <WorldTabs active="about" worldId={id} promptCount={promptCount} />,
    [id, promptCount],
  )

  const editActions = useMemo(() => (
    <div className="page-width border-b border-rose-line/80 px-4 pb-2">
      <div className="flex h-12 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3.5 font-serif-zh text-[15px] italic leading-none text-ink-3 transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-paper-2 hover:text-ink active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-4/50"
          onClick={cancelEditing}
        >
          {t.cancel}
        </button>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 sm:flex">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dirty ? 'bg-rose' : 'bg-ink-4/45'}`}
            aria-hidden="true"
          />
          <span className="t-meta truncate text-ink-3">
            {dirty ? t.unsavedChanges : t.noChanges}
          </span>
        </div>
        <div className="flex-1 sm:hidden" aria-hidden="true" />
        <button
          type="button"
          className="inline-flex h-10 min-w-20 shrink-0 items-center justify-center rounded-full bg-rose px-4 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
          onClick={save}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? t.saving : t.save}
        </button>
      </div>
    </div>
  ), [canSave, dirty, saveMutation.isPending, t])

  useTopNavConfig({
    backHref: '/worlds',
    bottomSlot: editing ? editActions : worldTabs,
  })

  if (!world) {
    return (
      <div className="page-fade-in bg-paper">
        <div className="page-width px-6 pb-32 pt-0">
          <Skeleton className="mt-6 h-11 w-48" />
          <Skeleton className="mt-6 h-11 w-full rounded-full" />
          <div className="mt-8 flex items-center justify-between">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
          </div>
          <SkeletonText className="mt-10" lineClassName="h-4" lines={8} />
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="page-fade-in bg-paper">
        <div className="page-width flex min-h-below-nav flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-0">
          {/* The version being edited, with its name editable right where it is shown. */}
          <div className="sticky top-23 z-10 -mx-6 border-b border-rose-line/70 bg-paper/90 px-6 backdrop-blur">
            <div className="py-3">
              <div className="flex h-12 w-full min-w-0 items-center gap-3 rounded-full border border-rose-line/80 bg-paper/60 py-2 pl-2 pr-3.5 shadow-[inset_0_0_24px_rgba(205,83,106,0.035)] focus-within:border-rose/40">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-pale text-rose-deep">
                  <History aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block t-eyebrow truncate leading-none">{t.versionName}</span>
                  <input
                    value={draftVersionName}
                    onChange={event => setDraftVersionName(event.target.value)}
                    placeholder={currentVersion ? t.versionLabel(currentVersion.number) : t.version}
                    className="mt-1 block w-full bg-transparent font-serif-zh text-[15px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none"
                  />
                </span>
                <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-4" />
              </div>
            </div>
          </div>

          <label className="mt-8 block">
            <span className="t-eyebrow eyebrow-rule">{t.name}</span>
            <input
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              className="mt-4 block w-full bg-transparent px-0 py-1 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:outline-none focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-ink-4/70"
              placeholder={t.worldNamePlaceholder(entityLabel('world', { capitalize: true }, language))}
            />
          </label>

          <label className="mt-10 flex min-h-0 flex-1 flex-col">
            <span className="t-eyebrow eyebrow-rule">{t.details}</span>
            <textarea
              value={draftBody}
              onChange={event => setDraftBody(event.target.value)}
              className="mt-4 min-h-[55svh] flex-1 resize-none border-l border-rose-line bg-transparent py-1 pl-5 pr-0 font-serif-zh text-[17px] leading-8 text-ink placeholder:text-ink-4 focus:outline-none focus-visible:border-ink-4"
              placeholder={t.worldDetailsPlaceholder}
            />
          </label>

          {saveError && (
            <p className="mt-4 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
              {saveError}
            </p>
          )}

          {versions.length > 1 && (
            <div className="mt-10 border-t border-rose-line/70 pt-6">
              <button
                type="button"
                onClick={() => {
                  setDeleteVersionError('')
                  setConfirmDeleteVersion(true)
                }}
                className="inline-flex items-center gap-2 font-serif-zh text-[15px] italic leading-none text-signal-red transition-colors hover:text-signal-red/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {t.deleteThisVersion}
              </button>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmCancel}
          title={t.discardChangesTitle}
          description={t.discardChangesDescription}
          confirmLabel={t.discard}
          onConfirm={() => {
            setConfirmCancel(false)
            setEditing(false)
          }}
          onClose={() => setConfirmCancel(false)}
        />
        <ConfirmDialog
          open={confirmDeleteVersion}
          title={t.deleteVersionTitle}
          description={t.deleteVersionDescription}
          confirmLabel={t.yesDelete}
          pendingLabel={t.deleting}
          isPending={deleteVersionMutation.isPending}
          error={deleteVersionError}
          onConfirm={() => {
            if (currentVersionId === null || deleteVersionMutation.isPending) return
            deleteVersionMutation.mutate(currentVersionId)
          }}
          onClose={() => {
            if (deleteVersionMutation.isPending) return
            setConfirmDeleteVersion(false)
            setDeleteVersionError('')
          }}
        />
      </div>
    )
  }

  return (
    <div className="page-fade-in bg-paper">
      <div className="page-width px-6 pb-32 pt-0">
        <div className="sticky top-23 z-10 -mx-6 border-b border-rose-line/70 bg-paper/90 px-6 backdrop-blur">
          <div className="flex items-center justify-between gap-3 py-3">
            <div ref={versionMenuRef} className="relative min-w-0 flex-1">
              <button
                type="button"
                className="group flex h-12 w-full min-w-0 items-center justify-between gap-3 rounded-full border border-rose-line/80 bg-paper/60 py-2 pl-2 pr-3.5 text-left shadow-[inset_0_0_24px_rgba(205,83,106,0.035)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 hover:shadow-(--shadow-feather) focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                onClick={() => setVersionMenuOpen(open => !open)}
                aria-haspopup="menu"
                aria-expanded={versionMenuOpen}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-pale text-rose-deep transition-colors group-hover:bg-paper">
                  <History aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block t-eyebrow truncate leading-none">{t.versionHistory}</span>
                  {versionDropdownLoading ? (
                    <Skeleton className="mt-1.5 h-4 w-20" />
                  ) : (
                    <span className="mt-1 block truncate font-serif-zh text-[15px] italic leading-none text-ink">
                      {currentVersionTitle ?? t.version}
                    </span>
                  )}
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 group-aria-expanded:rotate-180" />
              </button>

              {versionMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-10 mt-2 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
                >
                  {versionsQuery.isLoading ? (
                    <div className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                    </div>
                  ) : (
                    <>
                      {versions.length === 0 ? (
                        <div className="t-meta px-4 py-3">{t.noVersionsYet}</div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto py-1">
                          {versions.map(version => {
                            const isCurrent = version.id === currentVersionId
                            const isSwitching = switchingId === version.id
                            return (
                              <button
                                key={version.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={isCurrent}
                                disabled={switchMutation.isPending}
                                className="group/item flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-rose-tint/50 focus:outline-none focus:bg-rose-tint disabled:cursor-default"
                                onClick={() => switchVersion(version.id)}
                              >
                                <span
                                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full font-serif-zh text-xs italic transition-colors ${isCurrent
                                    ? 'bg-rose text-white shadow-(--shadow-cta)'
                                    : 'border border-rose-line bg-paper text-ink-3 group-hover/item:border-rose/40 group-hover/item:text-rose-deep'
                                    }`}
                                >
                                  v{version.number}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex min-w-0 items-center gap-2 font-serif-zh text-[15px] italic leading-snug text-ink">
                                    <span className="truncate">{versionTitle(version)}</span>
                                    {isCurrent && (
                                      <span className="shrink-0 font-serif-zh text-xs italic text-rose-deep">
                                        {t.current}
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-1 flex min-w-0 items-center gap-2 font-serif-zh text-xs italic leading-none text-ink-3">
                                    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${versionDotClass(version.created_at)}`} />
                                    <span className="truncate">{relativeTime(version.created_at, language)}</span>
                                  </span>
                                </span>
                                {isSwitching ? (
                                  <Loader2 aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 animate-spin text-rose" />
                                ) : isCurrent ? (
                                  <Check aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-rose" />
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {createVersionMutation.isError && (
                        <p className="t-meta border-t border-rose-line/70 px-3.5 py-2 text-signal-red">
                          {t.couldNotCreateVersion}
                        </p>
                      )}
                      {namingNewVersion ? (
                        <div className="flex items-center gap-3 border-t border-rose-line/70 py-2 pl-3.5 pr-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-pale text-rose-deep">
                            {createVersionMutation.isPending ? (
                              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus aria-hidden="true" className="h-4 w-4" />
                            )}
                          </span>
                          <input
                            value={newVersionName}
                            onChange={event => setNewVersionName(event.target.value)}
                            placeholder={t.versionNamePlaceholder}
                            disabled={createVersionMutation.isPending}
                            autoFocus
                            className="min-w-0 flex-1 bg-transparent py-2 font-serif-zh text-[15px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none disabled:opacity-50"
                            onKeyDown={event => {
                              if (event.key === 'Enter') createVersion()
                            }}
                          />
                          <button
                            type="button"
                            className="shrink-0 rounded-full px-3 py-2 font-serif-zh text-[14px] italic leading-none text-rose-deep transition-colors hover:bg-rose-tint/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:opacity-50"
                            onClick={createVersion}
                            disabled={createVersionMutation.isPending}
                          >
                            {createVersionMutation.isPending ? t.creatingVersion : t.createVersion}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 border-t border-rose-line/70 px-3.5 py-3 text-left transition-colors hover:bg-rose-tint/50 focus:outline-none focus:bg-rose-tint"
                          onClick={() => setNamingNewVersion(true)}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-pale text-rose-deep">
                            <Plus aria-hidden="true" className="h-4 w-4" />
                          </span>
                          <span className="font-serif-zh text-[15px] italic leading-none text-ink">
                            {t.newVersion}
                          </span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={startEditing}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-full border border-rose-line/80 bg-paper/60 py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-rose-deep shadow-[inset_0_0_24px_rgba(205,83,106,0.03)] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-pale text-rose-deep">
                <Pencil aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
              </span>
              <span className="text-ink">{t.edit}</span>
            </button>
          </div>
        </div>

        <header className="mt-8 border-b border-rose-line/70 pb-6">
          <span className="t-eyebrow eyebrow-rule">{entityLabel('world', { capitalize: true }, language)}</span>
          <h1 className="t-headline mt-4 wrap-break-word">
            {world.name}
          </h1>
        </header>

        {/* Sits on the top edge of the description, not after it: what's switched on is appended
            to this text, and a world body runs long enough that anything below it is out of
            reach. The bottom of this page is for Delete alone.

            Toggling is here, as pills, rather than on the additions screen — this is where the
            description they join is read, and a pill is a one-thumb tap. Writing and deleting the
            additions themselves is a screen of its own. */}
        <div className="mt-8 border-b border-rose-line/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="t-eyebrow truncate">{t.additions}</span>
              {additions.length > 0 && (
                // Counted off the resolved list, not the stored set: an id whose addition is gone
                // is not something that's on.
                <span
                  className={`inline-flex shrink-0 justify-center rounded-full px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal ring-1 ${activeAdditions.length > 0
                    ? 'bg-rose-pale text-rose-deep ring-rose-line'
                    : 'bg-paper-2 text-ink-3 ring-paper-3/70'
                    }`}
                >
                  {activeAdditions.length}/{additions.length}
                </span>
              )}
            </div>
            <Link
              to={`/worlds/${id}/additions`}
              className="inline-flex shrink-0 items-center gap-1 font-serif-zh text-[13px] italic leading-none text-ink-3 transition-opacity duration-200 active:opacity-60"
            >
              {additions.length === 0 ? t.newAddition : t.manageAdditions}
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>

          {additions.length === 0 ? (
            <p className="t-meta mt-3">{t.noAdditionsYet}</p>
          ) : (
            // One line that scrolls rather than a block that wraps: the shelf can grow, and a
            // wrapping grid would push the description further down every time it does.
            <div className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {additions.map(addition => {
                const on = activeIds.includes(addition.id)
                return (
                  // The glyph carries the state, not the tint alone: a row of pills that differ
                  // only in shade reads as decoration, and you can't tell which are in play.
                  <button
                    key={addition.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(addition.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1.5 pl-2.5 pr-3.5 font-serif-zh text-[13px] italic leading-none transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${on
                      ? 'border-rose/45 bg-rose-pale text-rose-deep'
                      : 'border-rose-line/80 bg-paper/60 text-ink-4'
                      }`}
                  >
                    {on ?? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />}
                    <span>{addition.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <article className="mt-5 whitespace-pre-wrap font-serif-zh text-[17px] leading-8 text-ink-2">
          {hasBody ? body : <p className="t-meta">{t.noBodyYet}</p>}
        </article>

        <div className="mt-12 border-t border-rose-line/70 pt-6">
          <button
            type="button"
            onClick={() => {
              setDeleteWorldError('')
              setConfirmDeleteWorld(true)
            }}
            className="inline-flex items-center gap-2 font-serif-zh text-[15px] italic leading-none text-signal-red transition-colors hover:text-signal-red/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {t.deleteThis(entityLabel('world', {}, language))}
          </button>
        </div>

      </div>

      <ConfirmDialog
        open={confirmDeleteWorld}
        title={t.deleteThisTitle(entityLabel('world', {}, language))}
        description={t.deleteWorldDescription(
          entityLabel('world', {}, language),
          entityLabel('piece', { plural: true }, language),
        )}
        confirmLabel={t.yesDelete}
        pendingLabel={t.deleting}
        isPending={deleteWorldMutation.isPending}
        error={deleteWorldError}
        onConfirm={() => {
          if (deleteWorldMutation.isPending) return
          setDeleteWorldError('')
          deleteWorldMutation.mutate()
        }}
        onClose={() => {
          if (deleteWorldMutation.isPending) return
          setConfirmDeleteWorld(false)
          setDeleteWorldError('')
        }}
      />

      {/* Bottom-left: this app is held one-handed with the left thumb. */}
      <Link
        to={`/worlds/${id}/chat`}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-rose text-white shadow-(--shadow-cta) transition-transform active:translate-y-px"
        aria-label={t.chatOpen}
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
      </Link>
    </div>
  )
}
