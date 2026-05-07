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
import WorldTabs from './WorldTabs'

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  updated_at: number
}

interface WorldVersionListItem {
  id: number
  name: string
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
  const [deleteError, setDeleteError] = useState('')
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
    enabled: !!id && versionMenuOpen,
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
    setSelectedVersionId(versionId)
    setVersionMenuOpen(false)
  }

  function deleteWorld() {
    if (deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate()
  }

  const world = worldQuery.data
  const versions = versionsQuery.data ?? []
  const previousVersions = versions.slice(1)
  const selectedVersion = selectedVersionQuery.data
  const viewingHistory = selectedVersionId !== null
  const body = viewingHistory ? (selectedVersion?.body ?? '') : (world?.body ?? '')

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
        <header>
          <h1 className="t-display min-w-0">{world.name}</h1>
          <WorldTabs active="about" worldId={id} />
        </header>

        <div className="mt-8 flex items-center justify-between gap-3">
          <div ref={versionMenuRef} className="relative min-w-0">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-line px-4 font-serif-zh text-[15px] italic text-ink transition-colors hover:border-rose/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              onClick={() => setVersionMenuOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={versionMenuOpen}
            >
              <span>{viewingHistory && selectedVersion ? relativeTime(selectedVersion.created_at) : 'Current'}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-3" />
            </button>

            {versionMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-10 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border border-rose-line bg-paper shadow-(--shadow-menu)"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!viewingHistory}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-2 focus:outline-none focus:bg-rose-tint"
                  onClick={selectCurrent}
                >
                  <div className="min-w-0">
                    <div className="font-serif-zh text-[15px] italic text-ink">Current</div>
                    <div className="t-meta mt-1 truncate">{world.name}</div>
                  </div>
                  {!viewingHistory && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />}
                </button>

                {versionsQuery.isLoading ? (
                  <div className="px-4 py-3">
                    <Skeleton className="h-4 w-36" />
                  </div>
                ) : previousVersions.length === 0 ? (
                  <div className="t-meta px-4 py-3">No previous versions.</div>
                ) : (
                  previousVersions.map(version => (
                    <button
                      key={version.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedVersionId === version.id}
                      className="flex w-full items-center justify-between gap-3 border-t border-rose-line px-4 py-3 text-left transition-colors hover:bg-paper-2 focus:outline-none focus:bg-rose-tint"
                      onClick={() => selectVersion(version.id)}
                    >
                      <div className="min-w-0">
                        <div className="font-serif-zh text-[15px] italic text-ink">{relativeTime(version.created_at)}</div>
                        <div className="t-meta mt-1 truncate">{version.name}</div>
                      </div>
                      {selectedVersionId === version.id && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to={`/worlds/${id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-rose px-4 font-serif-zh text-[15px] italic text-white shadow-(--shadow-cta) transition-colors hover:bg-rose-deep focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit
            </Link>

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
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {viewingHistory && selectedVersion && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-line bg-rose-pale px-4 py-3">
            <p className="t-meta text-rose-deep">Viewing version from {relativeTime(selectedVersion.created_at)}</p>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-rose-deep transition-colors hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              onClick={selectCurrent}
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Return to current
            </button>
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
    </div>
  )
}
