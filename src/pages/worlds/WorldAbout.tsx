import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, History, Pencil, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import ListEndMarker from '@/components/ListEndMarker'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { relativeTime } from '@/utils/time'
import WorldTabs from './WorldTabs'

const ONE_HOUR_MS = 60 * 60 * 1e3

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  updated_at: number
}

interface WorldVersionListItem {
  id: number
  restored_from_version_id: number | null
  created_at: number
}

interface WorldVersion extends WorldVersionListItem {
  body: string
}

interface PromptCountResponse {
  total: number
}

interface CachedPromptPages {
  pages?: Array<{ total?: number }>
}

export default function WorldAbout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoreError, setRestoreError] = useState('')
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

  const selectedVersionQuery = useQuery({
    queryKey: ['world-version', id, selectedVersionId],
    queryFn: () => apiFetch(`/api/worlds/${id}/versions/${selectedVersionId}`) as Promise<WorldVersion>,
    enabled: !!id && selectedVersionId !== null,
  })

  const restoreMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}/versions/${selectedVersionId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      const restoredVersionId = selectedVersionId
      setConfirmRestore(false)
      setRestoreError('')
      setSelectedVersionId(null)
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-versions', id] })
      if (restoredVersionId !== null) {
        queryClient.invalidateQueries({ queryKey: ['world-version', id, restoredVersionId] })
      }
    },
    onError: error => {
      setRestoreError(error instanceof Error ? error.message : 'Could not restore version')
    },
  })

  useEffect(() => {
    if (worldQuery.isError) navigate('/worlds')
  }, [navigate, worldQuery.isError])

  useEffect(() => {
    if (!versionMenuOpen) return

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

  function selectCurrent() {
    setSelectedVersionId(null)
    setVersionMenuOpen(false)
  }

  function selectVersion(versionId: number) {
    setRestoreError('')
    setSelectedVersionId(versionId)
    setVersionMenuOpen(false)
  }

  function restoreVersion() {
    if (selectedVersionId === null || restoreMutation.isPending) return
    setRestoreError('')
    restoreMutation.mutate()
  }

  const world = worldQuery.data
  const promptCount = promptCountQuery.data?.total
  const worldTabs = useMemo(
    () => <WorldTabs active="about" worldId={id} promptCount={promptCount} />,
    [id, promptCount],
  )
  useTopNavConfig({ backHref: '/worlds', bottomSlot: worldTabs })
  const versions = versionsQuery.data ?? []
  const versionEntries = versions.map((version, index) => ({
    version,
    number: versions.length - index,
  }))
  const selectedVersion = selectedVersionQuery.data
  const selectedVersionNumber = selectedVersionId === null
    ? null
    : versionEntries.find(entry => entry.version.id === selectedVersionId)?.number ?? null
  const viewingHistory = selectedVersionId !== null
  const body = viewingHistory ? (selectedVersion?.body ?? '') : (world?.body ?? '')
  const hasBody = body.trim().length > 0
  const currentVersionNumber = versionEntries[0]?.number ?? null
  const dropdownVersionNumber = viewingHistory ? selectedVersionNumber : currentVersionNumber
  const versionDropdownLabel = dropdownVersionNumber !== null ? `Version ${dropdownVersionNumber}` : 'Version'
  const versionDropdownLoading = versionsQuery.isLoading && dropdownVersionNumber === null
  function restoredFromLabel(restoredFromVersionId: number | null | undefined) {
    if (!restoredFromVersionId) return ''
    const sourceEntry = versionEntries.find(entry => entry.version.id === restoredFromVersionId)
    return sourceEntry ? `Restored from Version ${sourceEntry.number}` : 'Restored from another version'
  }

  function versionDotClass(timestamp: number) {
    return Date.now() - timestamp < ONE_HOUR_MS ? 'bg-rose' : 'bg-ink-4/50'
  }

  if (!world) {
    return (
      <div className="page-fade-in min-h-screen bg-paper">
        <div className="page-width min-h-screen px-6 pb-32 pt-0">
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

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      <div className="page-width min-h-screen px-6 pb-32 pt-0">
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
                  <span className="block t-eyebrow truncate leading-none">Version history</span>
                  {versionDropdownLoading ? (
                    <Skeleton className="mt-1.5 h-4 w-20" />
                  ) : (
                    <span className="mt-1 block truncate font-serif-zh text-[15px] italic leading-none text-ink">
                      {versionDropdownLabel}
                      {!viewingHistory && currentVersionNumber !== null && (
                        <span className="ml-2 text-rose-deep">current</span>
                      )}
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
                  ) : versionEntries.length === 0 ? (
                    <div className="t-meta px-4 py-3">No versions yet.</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto py-1">
                      {versionEntries.map(({ version, number }, index) => {
                        const isCurrent = index === 0
                        const isSelected = isCurrent ? !viewingHistory : selectedVersionId === version.id
                        return (
                          <button
                            key={version.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            className="group/item flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-rose-tint/50 focus:outline-none focus:bg-rose-tint"
                            onClick={() => isCurrent ? selectCurrent() : selectVersion(version.id)}
                          >
                            <span
                              className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full font-serif-zh text-xs italic transition-colors ${isSelected
                                ? 'bg-rose text-white shadow-(--shadow-cta)'
                                : 'border border-rose-line bg-paper text-ink-3 group-hover/item:border-rose/40 group-hover/item:text-rose-deep'
                                }`}
                            >
                              v{number}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2 font-serif-zh text-[15px] italic leading-snug text-ink">
                                <span className="truncate">Version {number}</span>
                                {isCurrent && (
                                  <span className="shrink-0 font-serif-zh text-xs italic text-rose-deep">
                                    current
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 flex min-w-0 items-center gap-2 font-serif-zh text-xs italic leading-none text-ink-3">
                                <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${versionDotClass(version.created_at)}`} />
                                <span className="truncate">{relativeTime(version.created_at)}</span>
                              </span>
                              {version.restored_from_version_id && (
                                <span className="mt-1 block truncate font-serif-zh text-xs italic leading-snug text-rose-deep">
                                  {restoredFromLabel(version.restored_from_version_id)}
                                </span>
                              )}
                            </span>
                            {isSelected && (
                              <Check aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-rose" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Link
              to={`/worlds/${id}/edit`}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-full border border-rose-line/80 bg-paper/60 py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-rose-deep shadow-[inset_0_0_24px_rgba(205,83,106,0.03)] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-pale text-rose-deep">
                <Pencil aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
              </span>
              <span className="text-ink">Edit</span>
            </Link>
          </div>

          {viewingHistory && selectedVersion && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rose-line/70 py-3.5">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="t-eyebrow">Viewing history</span>
                  {selectedVersionNumber !== null && (
                    <span className="rounded-full bg-rose-pale px-2 py-0.5 font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-rose-deep">
                      Version {selectedVersionNumber}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-serif-zh text-xs italic leading-none text-ink-3">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${versionDotClass(selectedVersion.created_at)}`} />
                  <span>{relativeTime(selectedVersion.created_at)}</span>
                  {selectedVersion.restored_from_version_id && (
                    <span className="text-rose-deep">
                      {restoredFromLabel(selectedVersion.restored_from_version_id)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-rose-line bg-paper px-3.5 font-serif-zh text-[14px] italic text-rose-deep transition-colors hover:border-rose/40 hover:bg-rose-pale focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                onClick={() => {
                  setRestoreError('')
                  setConfirmRestore(true)
                }}
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Restore
              </button>
            </div>
          )}
        </div>

        <header className="mt-8 border-b border-rose-line/70 pb-6">
          <span className="t-eyebrow eyebrow-rule">World</span>
          <h1 className="t-headline mt-4 wrap-break-word">
            {world.name}
          </h1>
        </header>

        <article className="mt-7 whitespace-pre-wrap font-serif-zh text-[17px] leading-8 text-ink-2">
          {viewingHistory && selectedVersionQuery.isLoading ? (
            <SkeletonText lineClassName="h-4" lines={8} />
          ) : hasBody ? (
            body
          ) : (
            <p className="t-meta">No body yet.</p>
          )}
        </article>
        {hasBody && (
          <ListEndMarker label="End of world description" className="mt-10" />
        )}
      </div>

      <ConfirmDialog
        open={confirmRestore}
        title={`Restore ${selectedVersionNumber !== null ? `Version ${selectedVersionNumber}` : 'this version'}?`}
        description="This will replace the current body with this saved version. The world name will stay unchanged."
        confirmLabel="Restore"
        pendingLabel="Restoring..."
        isPending={restoreMutation.isPending}
        error={restoreError}
        onConfirm={restoreVersion}
        onClose={() => {
          setConfirmRestore(false)
          setRestoreError('')
        }}
      />
    </div>
  )
}
