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

  if (loading) return <div className="p-6 text-zinc-400">Loading...</div>
  if (!piece) return null

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to={`/worlds/${piece.world_id}/prompts/${piece.prompt_id}`} className="text-violet-400 hover:text-violet-300 text-sm">
          Back to prompt
        </Link>
      </div>

      <p className="text-zinc-500 text-sm mb-8 italic">"{piece.prompt}"</p>

      <div className="mb-12">
        <p className="text-zinc-100 text-[17px] leading-[1.75] whitespace-pre-wrap">{piece.body}</p>
      </div>

      <div className="border-t border-zinc-800 pt-6 flex items-center justify-between">
        <span className="text-zinc-600 text-xs">{relativeTime(piece.created_at)}</span>
        {!confirmDelete ? (
          <button
            className="text-zinc-600 hover:text-rose-400 text-sm transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-sm">Delete this piece?</span>
            <button
              className="bg-rose-700 hover:bg-rose-600 text-white rounded px-3 py-1 text-sm transition-colors"
              onClick={deletePiece}
            >
              Yes, delete
            </button>
            <button
              className="text-zinc-500 hover:text-zinc-300 text-sm"
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
