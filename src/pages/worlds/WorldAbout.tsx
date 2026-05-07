import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Ellipsis, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import ConfirmDialog from '../../components/ConfirmDialog'
import Skeleton, { SkeletonText } from '../../components/Skeleton'
import { useTopNavConfig } from '../../components/topNavConfig'
import { relativeTime } from '../../utils/time'
import WorldHeader from './WorldHeader'

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

export default function WorldAbout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const versionMenuRef = useRef<HTMLDivElement | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)

  useTopNavConfig({ backHref: '/worlds' })

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<World>,
    enabled: !!id,
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

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/worlds/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.removeQueries({ queryKey: ['world', id] })
      queryClient.removeQueries({ queryKey: ['world-versions', id] })
      queryClient.removeQueries({ queryKey: ['world-clusters', id] })
      navigate('/worlds')
    },
    onError: error => {
      setDeleteError(error instanceof Error ? error.message : `Could not delete ${entityLabel('world')}`)
    },
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
    if (!versionMenuOpen && !actionsOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (versionMenuRef.current && !versionMenuRef.current.contains(target)) setVersionMenuOpen(false)
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) setActionsOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setVersionMenuOpen(false)
        setActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [actionsOpen, versionMenuOpen])

  function selectCurrent() {
    setSelectedVersionId(null)
    setVersionMenuOpen(false)
  }

  function selectVersion(versionId: number) {
    setRestoreError('')
    setSelectedVersionId(versionId)
    setVersionMenuOpen(false)
  }

  function deleteWorld() {
    if (deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate()
  }

  function restoreVersion() {
    if (selectedVersionId === null || restoreMutation.isPending) return
    setRestoreError('')
    restoreMutation.mutate()
  }

  const world = worldQuery.data
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
        <div className="page-width min-h-screen px-6 pb-32 pt-12">
          <Skeleton className="h-11 w-52" />
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
      <div className="page-width min-h-screen px-6 pb-32 pt-12">
        <WorldHeader
          active="about"
          isExample={world.is_example}
          name={world.name}
          worldId={id}
        />

        <div className="mt-8 flex items-center justify-between gap-3">
          <div ref={versionMenuRef} className="relative min-w-0">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-line px-4 font-serif-zh text-[15px] italic text-ink transition-colors hover:border-rose/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              onClick={() => setVersionMenuOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={versionMenuOpen}
            >
              {versionDropdownLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <span>{versionDropdownLabel}</span>
              )}
              {!viewingHistory && currentVersionNumber !== null && (
                <span className="rounded-full bg-rose-pale px-2 py-0.5 font-sans text-[10px] font-semibold not-italic uppercase leading-none tracking-[0.08em] text-rose-deep">
                  current
                </span>
              )}
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-3" />
            </button>

            {versionMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-10 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border border-rose-line bg-paper shadow-(--shadow-menu)"
              >
                {versionsQuery.isLoading ? (
                  <div className="px-4 py-3">
                    <Skeleton className="h-4 w-36" />
                  </div>
                ) : versionEntries.length === 0 ? (
                  <div className="t-meta px-4 py-3">No versions yet.</div>
                ) : (
                  versionEntries.map(({ version, number }, index) => {
                    const isCurrent = index === 0
                    const isSelected = isCurrent ? !viewingHistory : selectedVersionId === version.id
                    return (
                      <button
                        key={version.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        className={`${index > 0 ? 'border-t border-rose-line' : ''} flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-2 focus:outline-none focus:bg-rose-tint`}
                        onClick={() => isCurrent ? selectCurrent() : selectVersion(version.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2 font-serif-zh text-[15px] italic leading-snug text-ink">
                            <span>Version {number}</span>
                            {isCurrent && (
                              <span className="rounded-full bg-rose-pale px-2 py-0.5 font-sans text-[10px] font-semibold not-italic uppercase leading-none tracking-[0.08em] text-rose-deep">
                                current
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-2 font-serif-zh text-[11px] italic leading-none text-ink-3">
                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${versionDotClass(version.created_at)}`} />
                            <span className="shrink-0">{relativeTime(version.created_at)}</span>
                          </div>
                          {version.restored_from_version_id && (
                            <div className="mt-1 truncate font-serif-zh text-[11px] italic leading-snug text-rose-deep">
                              {restoredFromLabel(version.restored_from_version_id)}
                            </div>
                          )}
                        </div>
                        {isSelected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <Link
            to={`/worlds/${id}/edit`}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-rose px-4 font-serif-zh text-[15px] italic text-white shadow-(--shadow-cta) transition-colors hover:bg-rose-deep focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            Edit
          </Link>
        </div>

        {viewingHistory && selectedVersion && (
          <div className="mt-7 border-y border-rose-line py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
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
          </div>
        )}

        <article className="mt-9 whitespace-pre-wrap font-serif-zh text-[17px] leading-8 text-ink-2">
          {viewingHistory && selectedVersionQuery.isLoading ? (
            <SkeletonText lineClassName="h-4" lines={8} />
          ) : body.trim() ? (
            body
          ) : (
            <p className="t-meta">No body yet.</p>
          )}
        </article>

        <div className="mt-5 flex justify-end">
          <div ref={actionsMenuRef} className="relative">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              onClick={() => setActionsOpen(open => !open)}
              aria-label="World actions"
              title="World actions"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
            >
              <Ellipsis aria-hidden="true" className="h-5 w-5" />
            </button>
            {actionsOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-2 w-44 overflow-hidden rounded-md border border-rose-line bg-paper shadow-(--shadow-menu)"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-signal-red transition-colors hover:bg-paper-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                  onClick={() => {
                    setActionsOpen(false)
                    setConfirmDelete(true)
                  }}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  Delete this world
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${entityLabel('world')}?`}
        description={`This will delete the ${entityLabel('world')} and all of its ${entityLabel('piece', { plural: true })}.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={deleteWorld}
        onClose={() => setConfirmDelete(false)}
      />
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
