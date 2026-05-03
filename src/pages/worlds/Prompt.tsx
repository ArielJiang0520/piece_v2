import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { relativeTime } from '../../utils/time'
import { useTopNavConfig } from '../../components/TopNav'

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
  const queryClient = useQueryClient()
  const backHref = id ? `/worlds/${id}` : '/worlds'
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
      navigate(clusterId != null ? `/worlds/${id}/clusters/${clusterId}` : backHref)
    },
    onError: e => {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete prompt')
    },
  })

  const prompt = promptQuery.data?.prompt ?? null
  const pieces = promptQuery.data?.pieces ?? []
  const hasMore = promptQuery.data?.hasMore ?? false

  const navBackHref = prompt?.cluster_id != null
    ? `/worlds/${id}/clusters/${prompt.cluster_id}`
    : backHref
  useTopNavConfig({ title: 'Prompt', backHref: navBackHref })

  function deletePrompt() {
    if (!prompt || deleteMutation.isPending) return
    setDeleteError('')
    deleteMutation.mutate(prompt.id)
  }

  if (!worldQuery.data || !promptQuery.data) {
    return <div className="page-width p-6 text-ink-3">Loading...</div>
  }
  if (!prompt) return null

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-ink-3 text-xs mt-2">
            {prompt.piece_count} {prompt.piece_count === 1 ? 'piece' : 'pieces'} - latest {relativeTime(prompt.updated_at)}
          </p>
          <div className="shrink-0 flex items-center gap-2">
            <button
              className="border border-paper-3 text-ink-3 hover:text-rose-deep hover:border-rose rounded-sm px-4 py-2 font-medium transition-colors text-sm disabled:opacity-50"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending}
            >
              Delete prompt
            </button>
            <Link
              to={`/worlds/${id}/generate?promptId=${prompt.id}`}
              className="bg-rose hover:bg-rose-deep text-white rounded-sm px-4 py-2 font-medium transition-colors text-sm"
            >
              Use this prompt
            </Link>
          </div>
        </div>
        <h1 className="font-serif-zh text-2xl font-normal text-ink leading-tight">{prompt.text}</h1>
      </header>

      {confirmDelete && (
        <div className="border border-rose bg-rose-pale rounded-md px-4 py-3 mb-6">
          <p className="text-ink-2 text-sm mb-3">Delete this prompt and all of its pieces?</p>
          <div className="flex items-center gap-3">
            <button
              className="bg-rose-deep hover:bg-rose text-white rounded-sm px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
              onClick={deletePrompt}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button
              className="text-ink-3 hover:text-ink text-sm disabled:opacity-50"
              onClick={() => setConfirmDelete(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </button>
            {deleteError && <span className="text-rose-deep text-sm">{deleteError}</span>}
          </div>
        </div>
      )}

      {pieces.length === 0 ? (
        <p className="text-ink-3 text-sm">No pieces yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {pieces.map(piece => (
            <Link
              key={piece.id}
              to={`/pieces/${piece.id}`}
              className="bg-paper hover:bg-paper-2 border border-paper-3 rounded-md px-4 py-3 transition-colors"
            >
              <div className="text-ink-2 text-sm line-clamp-2">{piece.preview}</div>
              <div className="text-ink-3 text-xs mt-2">{relativeTime(piece.created_at)}</div>
            </Link>
          ))}
        </div>
      )}

      {pieces.length > 0 && (
        <div className="flex items-center justify-between mt-6">
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
