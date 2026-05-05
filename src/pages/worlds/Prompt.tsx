import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCw, Trash2 } from 'lucide-react'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import ConfirmDialog from '../../components/ConfirmDialog'
import RelativeTimeStatus from '../../components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '../../components/Skeleton'
import { useTopNavConfig } from '../../components/topNavConfig'

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
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-rose-deep focus:outline-none focus:ring-2 focus:ring-rose/30 disabled:opacity-50"
        onClick={() => setConfirmDelete(true)}
        disabled={deleteMutation.isPending}
        aria-label={`Delete ${entityLabel('prompt')}`}
        title={`Delete ${entityLabel('prompt')}`}
      >
        <Trash2 aria-hidden="true" className="h-5 w-5" />
      </button>
    )
  }, [deleteMutation.isPending, prompt])
  useTopNavConfig({
    title: entityLabel('prompt', { capitalize: true }),
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
      <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-8">
        <header className="relative mb-12 pt-8 text-center">
          <SkeletonText className="mx-auto max-w-88" lineClassName="mx-auto h-4" lines={3} />
          <Skeleton className="mx-auto mt-16 h-14 w-full max-w-104 rounded-lg" />
        </header>
        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <Skeleton className="h-8 w-10" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-md border border-paper-3 bg-paper px-4 py-4"
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
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-8">
      <header className="relative mb-12 pt-8 text-center">
        <h1 className="mx-auto max-w-88 font-serif-zh text-[18px] font-normal leading-[1.55] text-ink">
          {prompt.text}
        </h1>

        <Link
          to={`/worlds/${id}/generate?promptId=${prompt.id}`}
          className="text-sm  mx-auto mt-16 flex min-h-10 w-full max-w-104 items-center justify-center gap-3 rounded-lg border border-rose bg-rose px-6 py-4 font-semibold text-white shadow-[0_16px_34px_rgba(205,83,106,0.24)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.34)] focus:outline-none focus:ring-4 focus:ring-rose/25"
        >
          <RotateCw aria-hidden="true" className="h-4 w-4" />
          <span>Another {entityLabel('piece')}</span>
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
        <p className="text-center text-sm text-ink-3">No {entityLabel('piece', { plural: true })} yet.</p>
      ) : (
        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span className="font-serif-zh text-[28px] leading-none text-ink">
                {prompt.piece_count}
              </span>
              <span className="pb-1 text-sm text-ink-3">
                {entityLabel('piece', { plural: prompt.piece_count !== 1 })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {pieces.map((piece, index) => {
              const pieceNumber = Math.max(1, prompt.piece_count - ((page - 1) * PAGE_SIZE) - index)

              return (
                <Link
                  key={piece.id}
                  to={`/pieces/${piece.id}`}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-md border border-paper-3 bg-paper px-4 py-4 transition-colors hover:border-ink-4/35 hover:bg-paper-2/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose/25"
                >
                  <span className="pt-0.5 text-sm font-medium text-ink-4">#{pieceNumber}</span>
                  <span className="min-w-0">
                    <span className="text-[14px] leading-6 text-ink-2 line-clamp-3">
                      {piece.preview}
                    </span>
                    <RelativeTimeStatus timestamp={piece.created_at} className="mt-2" />
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {pieces.length > 0 && (
        <div className="mt-7 flex items-center justify-between">
          <button
            className="border border-paper-3 text-ink-3 rounded-sm px-3 py-1.5 text-sm transition-colors hover:border-ink-4 hover:text-ink disabled:opacity-40 disabled:hover:border-paper-3"
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-ink-3 text-xs">Page {page}</span>
          <button
            className="border border-paper-3 text-ink-3 rounded-sm px-3 py-1.5 text-sm transition-colors hover:border-ink-4 hover:text-ink disabled:opacity-40 disabled:hover:border-paper-3"
            onClick={() => setPage(prev => prev + 1)}
            disabled={!hasMore}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
