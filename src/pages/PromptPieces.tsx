import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'

interface Prompt {
  id: number
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

const PAGE_SIZE = 30

export default function PromptPieces() {
  const { id, promptId } = useParams<{ id: string; promptId: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/worlds/${id}`),
      apiFetch(`/api/worlds/${id}/prompts/${promptId}?page=${page}&limit=${PAGE_SIZE}`),
    ])
      .then(([world, response]: [{ name: string }, PromptPiecesResponse]) => {
        setWorldName(world.name)
        setPrompt(response.prompt)
        setPieces(response.pieces)
        setHasMore(response.hasMore)
      })
      .catch(() => navigate(`/worlds/${id}`))
      .finally(() => setLoading(false))
  }, [id, promptId, page, navigate])

  async function deletePrompt() {
    if (!prompt || deleting) return

    setDeleting(true)
    setDeleteError('')

    try {
      await apiFetch(`/api/worlds/${id}/prompts/${prompt.id}`, { method: 'DELETE' })
      navigate(`/worlds/${id}`)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete prompt')
      setDeleting(false)
    }
  }

  if (loading) return <div className="page-width p-6 text-ink-3">Loading...</div>
  if (!prompt) return null

  return (
    <div className="min-h-screen page-width px-4 py-6">
      <div className="mb-6">
        <Link to={`/worlds/${id}`} className="text-rose hover:text-rose-deep text-sm">
          Back to {worldName}
        </Link>
      </div>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-ink-3 text-xs mt-2">
            {prompt.piece_count} {prompt.piece_count === 1 ? 'piece' : 'pieces'} - latest {relativeTime(prompt.updated_at)}
          </p>
          <div className="shrink-0 flex items-center gap-2">
            <button
              className="border border-paper-3 text-ink-3 hover:text-rose-deep hover:border-rose rounded-sm px-4 py-2 font-medium transition-colors text-sm disabled:opacity-50"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
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
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button
              className="text-ink-3 hover:text-ink text-sm disabled:opacity-50"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
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
