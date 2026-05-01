import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'

interface Piece {
  id: number
  world_id: number
  prompt_id: number
  prompt: string
  body: string
  model: string | null
  created_at: number
}

export default function PieceReader() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [piece, setPiece] = useState<Piece | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    apiFetch(`/api/pieces/${id}`)
      .then(setPiece)
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  async function deletePiece() {
    if (!piece) return
    await apiFetch(`/api/pieces/${id}`, { method: 'DELETE' })
    navigate(`/worlds/${piece.world_id}`)
  }

  if (loading) return <div className="p-6 text-ink-3">Loading...</div>
  if (!piece) return null

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to={`/worlds/${piece.world_id}/prompts/${piece.prompt_id}`} className="text-rose hover:text-rose-deep text-sm">
          Back to prompt
        </Link>
      </div>

      <p className="font-serif-zh text-ink-2 text-sm mb-8 italic">"{piece.prompt}"</p>

      <div className="mb-12">
        <p className="prose whitespace-pre-wrap">{piece.body}</p>
      </div>

      <div className="border-t border-paper-3 pt-6 flex items-center justify-between">
        <span className="text-ink-3 text-xs">{relativeTime(piece.created_at)}</span>
        {!confirmDelete ? (
          <button
            className="text-ink-3 hover:text-rose-deep text-sm transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-ink-3 text-sm">Delete this piece?</span>
            <button
              className="bg-rose-deep hover:bg-rose text-white rounded-sm px-3 py-1 text-sm transition-colors"
              onClick={deletePiece}
            >
              Yes, delete
            </button>
            <button
              className="text-ink-3 hover:text-ink text-sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
