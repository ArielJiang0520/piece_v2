import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ellipsis, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import CountIndicator from '@/components/CountIndicator'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { entityLabel } from '@/config'
import { diffPromptInlineEdits, type PromptEditMark } from '@/utils/promptDiff'
import { relativeTime } from '@/utils/time'
import type { ClusterPrompt } from './generateTypes'

interface GenerateVersionsPanelProps {
  worldId: string | undefined
  currentPromptId: string | null
  prompts: ClusterPrompt[]
  loading: boolean
  onViewPrompt: () => void
}

interface PromptVersionEntry {
  prompt: ClusterPrompt
  number: number
  isCurrent: boolean
  editMarks: PromptEditMark[] | null
}

interface DeletePromptResponse {
  ok: true
  deletedPieces: number
  nextPromptId: number | null
  clusterDeleted: boolean
}

function renderPromptText(text: string, editMarks: PromptEditMark[] | null) {
  if (!editMarks) return text

  return editMarks.map((mark, index) => {
    if (mark.kind === 'added') {
      return (
        <ins
          key={index}
          className="rounded-xs bg-signal-green/5 px-0.5 text-signal-green underline decoration-signal-green/60 underline-offset-2"
        >
          {mark.value}
        </ins>
      )
    }

    if (mark.kind === 'removed') {
      return (
        <del
          key={index}
          className="rounded-xs bg-signal-red/5 px-0.5 text-signal-red line-through decoration-signal-red/60"
        >
          {mark.value}
        </del>
      )
    }

    return mark.value
  })
}

export default function GenerateVersionsPanel({
  worldId,
  currentPromptId,
  prompts,
  loading,
  onViewPrompt,
}: GenerateVersionsPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDiff, setShowDiff] = useState(true)
  const [openMenuPromptId, setOpenMenuPromptId] = useState<number | null>(null)
  const [confirmPrompt, setConfirmPrompt] = useState<PromptVersionEntry | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const currentEntryRef = useRef<HTMLElement | null>(null)
  const entries = useMemo<PromptVersionEntry[]>(
    () => prompts
      .map((prompt, index) => {
        const previousPrompt = prompts[index - 1]
        return {
          prompt,
          number: index + 1,
          isCurrent: String(prompt.id) === currentPromptId,
          editMarks: previousPrompt ? diffPromptInlineEdits(previousPrompt.text, prompt.text) : null,
        }
      })
      .reverse(),
    [currentPromptId, prompts],
  )
  const deletingLastClusterPrompt = !!confirmPrompt && entries.length === 1
  const deleteDescription = confirmPrompt
    ? promptDeleteDescription(confirmPrompt, deletingLastClusterPrompt)
    : undefined

  useEffect(() => {
    if (loading || !currentPromptId) return
    currentEntryRef.current?.scrollIntoView({ block: 'center' })
  }, [currentPromptId, loading])

  useEffect(() => {
    if (openMenuPromptId === null) return

    function handlePointerDown(event: PointerEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setOpenMenuPromptId(null)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenuPromptId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openMenuPromptId])

  const deleteMutation = useMutation({
    mutationFn: (entry: PromptVersionEntry) => {
      if (!worldId) throw new Error(`Missing ${entityLabel('world')} id`)
      return apiFetch(`/api/worlds/${worldId}/prompts/${entry.prompt.id}`, { method: 'DELETE' }) as Promise<DeletePromptResponse>
    },
    onSuccess: (result, deletedEntry) => {
      const deletedPromptId = deletedEntry.prompt.id
      setConfirmPrompt(null)
      setDeleteError('')
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.invalidateQueries({ queryKey: ['world', worldId] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', worldId] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters-count', worldId] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters-search', worldId] })
      queryClient.invalidateQueries({ queryKey: ['cluster', worldId] })
      if (deletedPromptId) {
        queryClient.removeQueries({ queryKey: ['prompt', worldId, String(deletedPromptId)] })
      }
      if (result.clusterDeleted) {
        navigate(worldId ? `/worlds/${worldId}` : '/worlds', { replace: true })
        return
      }
      if (deletedPromptId && String(deletedPromptId) === currentPromptId) {
        if (result.nextPromptId) {
          navigate(`/worlds/${worldId}/generate?promptId=${result.nextPromptId}`, { replace: true })
          return
        }
        navigate(worldId ? `/worlds/${worldId}` : '/worlds', { replace: true })
      }
    },
    onError: error => {
      setDeleteError(error instanceof Error ? error.message : `Could not delete ${entityLabel('prompt')}`)
    },
  })

  function viewPromptVersion(promptId: number, isCurrent: boolean) {
    if (!worldId || isCurrent) return
    onViewPrompt()
    navigate(`/worlds/${worldId}/generate?promptId=${promptId}`)
  }

  function requestDeletePrompt(entry: PromptVersionEntry) {
    setOpenMenuPromptId(null)
    setDeleteError('')
    setConfirmPrompt(entry)
  }

  function deletePrompt() {
    if (!confirmPrompt || deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate(confirmPrompt)
  }

  if (loading) {
    return (
      <div className="hairline-list">
        {Array.from({ length: 3 }, (_, index) => (
          <section
            key={index}
            className={versionEntryClass()}
          >
            <div className="relative flex justify-center">
              <Skeleton className="relative z-10 h-12 w-12 rounded-full" />
            </div>
            <div className="min-w-0">
              <Skeleton className="h-3 w-28" />
              <SkeletonText className="mt-4" lineClassName="h-4" lines={3} />
              <Skeleton className="mt-5 h-4 w-24" />
            </div>
          </section>
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="t-meta px-2 py-6">No versions yet.</p>
  }

  return (
    <div className="relative">
      <div className="mb-5 flex justify-end px-2">
        <label className="t-meta inline-flex cursor-pointer items-center gap-2 text-ink-3 transition-colors hover:text-ink">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded-xs border-rose-line accent-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
            checked={showDiff}
            onChange={event => setShowDiff(event.target.checked)}
          />
          <span>Show changes</span>
        </label>
      </div>

      <span
        aria-hidden="true"
        className="absolute bottom-8 left-7 top-2 w-px bg-rose-line/45 sm:left-9.5"
      />

      <div>
        {entries.map(entry => {
          const { prompt, number, isCurrent, editMarks } = entry
          const clickable = !isCurrent && !!worldId
          const handleCardActivate = () => {
            if (!clickable) return
            viewPromptVersion(prompt.id, isCurrent)
          }
          return (
            <section
              key={prompt.id}
              ref={isCurrent ? currentEntryRef : undefined}
              data-prompt-id={prompt.id}
              className={`${versionEntryClass()} ${isCurrent ? 'rounded-lg bg-paper-2/70' : clickable ? 'cursor-pointer' : ''}`}
              aria-current={isCurrent ? 'page' : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? handleCardActivate : undefined}
              onKeyDown={clickable
                ? event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleCardActivate()
                  }
                }
                : undefined}
            >
              <div className="relative flex justify-center">
                <div
                  className={[
                    'relative z-10 grid h-10 w-10 place-items-center rounded-full font-serif-zh text-sm italic',
                    isCurrent
                      ? 'bg-rose text-white shadow-(--shadow-cta)'
                      : 'border border-rose-line bg-paper text-ink-3',
                  ].join(' ')}
                >
                  v{number}
                </div>
              </div>

              <div className="min-w-0">
                <div className="t-meta flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate not-italic text-ink-3">{relativeTime(prompt.updated_at)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CountIndicator count={prompt.piece_count} className="justify-end gap-x-2" />
                    <div ref={openMenuPromptId === prompt.id ? actionsMenuRef : undefined} className="relative">
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-[background-color,color] hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                        aria-label={`${entityLabel('prompt', { capitalize: true })} actions`}
                        title={`${entityLabel('prompt', { capitalize: true })} actions`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuPromptId === prompt.id}
                        onClick={event => {
                          event.stopPropagation()
                          setOpenMenuPromptId(openId => openId === prompt.id ? null : prompt.id)
                        }}
                      >
                        <Ellipsis aria-hidden="true" className="h-4 w-4" />
                      </button>
                      {openMenuPromptId === prompt.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
                          onClick={event => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm normal-case tracking-normal text-signal-red transition-colors hover:bg-paper-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                            onClick={event => {
                              event.stopPropagation()
                              requestDeletePrompt(entry)
                            }}
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                            Delete this {entityLabel('prompt')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <h2 className={`mt-3 whitespace-pre-wrap font-serif-zh text-[16px] leading-7 ${isCurrent ? 'text-ink' : 'text-ink-2'}`}>
                  {renderPromptText(prompt.text, showDiff ? editMarks : null)}
                </h2>
              </div>
            </section>
          )
        })}
      </div>
      <ConfirmDialog
        open={!!confirmPrompt}
        title={`Delete this ${entityLabel('prompt')}?`}
        description={deleteDescription}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={deletePrompt}
        onClose={() => {
          if (deleteMutation.isPending) return
          setConfirmPrompt(null)
          setDeleteError('')
        }}
      />
    </div>
  )
}

function versionEntryClass() {
  return 'grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-1 py-6 sm:grid-cols-[3.75rem_minmax(0,1fr)] sm:gap-4 sm:px-2 sm:py-7'
}

function promptDeleteDescription(entry: PromptVersionEntry, deletesCluster: boolean) {
  const pieceCount = entry.prompt.piece_count
  const base = `This will delete the ${entityLabel('prompt')} and ${pieceCount} ${entityLabel('piece', { plural: pieceCount !== 1 })}.`
  return deletesCluster
    ? `${base} This is the last version in its cluster, so the cluster will be deleted too.`
    : base
}
