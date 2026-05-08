import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import ConfirmDialog from '@/components/ConfirmDialog'
import DeleteIconButton from '@/components/DeleteIconButton'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'

interface Prompt {
  id: number
  cluster_id: number | null
  text: string
  piece_count: number
  created_at: number
  updated_at: number
}

interface Piece {
  id: number
  preview: string
  created_at: number
}

interface PromptPiecesResponse {
  prompt: Prompt
  pieces: Piece[]
  page: number
  limit: number
  hasMore: boolean
}

interface DeletePromptResponse {
  ok: boolean
  cluster_id: number | null
}

const PAGE_SIZE = 30

export default function Prompt() {
  const { id, promptId } = useParams<{ id: string; promptId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const backHref = id ? `/worlds/${id}` : '/worlds'
  const fromWorldList = (location.state as { fromWorldList?: boolean } | null)?.fromWorldList === true
  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })

  const promptQuery = useQuery({
    queryKey: ['prompt', id, promptId, page],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/prompts/${promptId}?page=${page}&limit=${PAGE_SIZE}`) as Promise<PromptPiecesResponse>,
    enabled: !!id && !!promptId,
    placeholderData: previous => previous,
  })

  const errored = worldQuery.isError || promptQuery.isError
  useEffect(() => {
    if (errored) navigate(backHref)
  }, [errored, navigate, backHref])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page])

  const deleteMutation = useMutation({
    mutationFn: (promptIdNum: number) =>
      apiFetch(`/api/worlds/${id}/prompts/${promptIdNum}`, { method: 'DELETE' }) as Promise<DeletePromptResponse>,
    onSuccess: (response, promptIdNum) => {
      const fallbackClusterId = promptQuery.data?.prompt.cluster_id ?? null
      const clusterId = response.cluster_id ?? fallbackClusterId
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      if (clusterId != null) {
        queryClient.invalidateQueries({ queryKey: ['cluster', id, String(clusterId)] })
      }
      queryClient.removeQueries({ queryKey: ['prompt', id, String(promptIdNum)] })
      navigate(fromWorldList || clusterId == null ? backHref : `/worlds/${id}/clusters/${clusterId}`)
    },
    onError: e => {
      setDeleteError(e instanceof Error ? e.message : `Could not delete ${entityLabel('prompt')}`)
    },
  })

  const prompt = promptQuery.data?.prompt ?? null
  const pieces = useMemo(
    () => [...(promptQuery.data?.pieces ?? [])].sort((a, b) => b.created_at - a.created_at || b.id - a.id),
    [promptQuery.data?.pieces],
  )
  const hasMore = promptQuery.data?.hasMore ?? false

  const navBackHref = !fromWorldList && prompt?.cluster_id != null
    ? `/worlds/${id}/clusters/${prompt.cluster_id}`
    : backHref
  const navRightAction = useMemo(() => {
    if (!prompt) return undefined

    return (
      <DeleteIconButton
        label={`Delete ${entityLabel('prompt')}`}
        onClick={() => setConfirmDelete(true)}
        disabled={deleteMutation.isPending}
      />
    )
  }, [deleteMutation.isPending, prompt])
  useTopNavConfig({
    secondaryTitle: entityLabel('prompt', { capitalize: true }),
    backHref: navBackHref,
    rightAction: navRightAction,
  })

  function deletePrompt() {
    if (!prompt || deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate(prompt.id)
  }

  if (!worldQuery.data || !promptQuery.data) {
    return (
      <div className="page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-10">
        <header className="relative mb-14 pt-6">
          <SkeletonText lineClassName="h-5" lines={4} />
          <Skeleton className="mt-12 h-12 w-44 rounded-full" />
        </header>
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="hairline-list">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-6"
              >
                <Skeleton className="mt-0.5 h-4 w-8" />
                <div className="min-w-0">
                  <SkeletonText lines={2} />
                  <Skeleton className="mt-3 h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }
  if (!prompt) return null

  return (
    <div className="page-fade-in page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-10">
      <header className="relative mb-14 pt-6">
        <p className="drop-cap font-serif-zh text-[18px] leading-[1.7] text-ink">
          {prompt.text}
        </p>

        <Link
          to={`/worlds/${id}/generate?promptId=${prompt.id}`}
          className="mt-12 inline-flex items-center gap-3 rounded-full bg-rose px-6 py-3.5 font-serif-zh text-[15px] italic text-white shadow-(--shadow-cta) transition-all hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus:ring-4 focus:ring-rose/25"
        >
          <span>{pieces.length > 0 ? 'Another take' : 'Take it'}</span>
        </Link>
      </header>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${entityLabel('prompt')}?`}
        description={`This will delete the ${entityLabel('prompt')} and all of its ${entityLabel('piece', { plural: true })}.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        isPending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={deletePrompt}
        onClose={() => setConfirmDelete(false)}
      />

      {pieces.length === 0 ? (
        <p className="t-meta text-center">No {entityLabel('piece', { plural: true })} yet.</p>
      ) : (
        <section>
          <div className="t-eyebrow eyebrow-rule mb-6">
            <span>
              <span className="text-rose">{prompt.piece_count}</span>{' '}
              {entityLabel('piece', { plural: prompt.piece_count !== 1 })}
            </span>
          </div>

          <ul className="hairline-list flex flex-col">
            {pieces.map((piece, index) => {
              const pieceNumber = Math.max(1, prompt.piece_count - ((page - 1) * PAGE_SIZE) - index)

              return (
                <li
                  key={piece.id}
                  className="list-item-reveal"
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                >
                  <Link
                    to={`/pieces/${piece.id}`}
                    className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-6 transition-transform duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
                  >
                    <span className="font-serif-zh text-sm italic text-rose">#{pieceNumber}</span>
                    <span className="min-w-0">
                      <span className="block font-serif-zh text-[15px] leading-7 text-ink-2 line-clamp-3">
                        {piece.preview}
                      </span>
                      <RelativeTimeStatus timestamp={piece.created_at} className="mt-3" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {pieces.length > 0 && (
        <div className="mt-10 flex items-center justify-between">
          <button
            className="t-meta transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="t-eyebrow">Page {page}</span>
          <button
            className="t-meta transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
            onClick={() => setPage(prev => prev + 1)}
            disabled={!hasMore}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
