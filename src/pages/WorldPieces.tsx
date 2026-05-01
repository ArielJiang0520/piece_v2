import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'

interface Piece {
  id: number
  prompt: string
  preview: string
  created_at: number
}

function relativeTime(ts: number) {
  const diff = (Date.now() - ts) / 1000
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (diff < 60) return fmt.format(-Math.round(diff), 'second')
  if (diff < 3600) return fmt.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return fmt.format(-Math.round(diff / 3600), 'hour')
  return fmt.format(-Math.round(diff / 86400), 'day')
}

export default function WorldPieces() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/worlds/${id}`),
      apiFetch(`/api/worlds/${id}/pieces`),
    ])
      .then(([world, ps]) => { setWorldName(world.name); setPieces(ps) })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id])

  async function deletePiece(pieceId: number) {
    await apiFetch(`/api/pieces/${pieceId}`, { method: 'DELETE' })
    setPieces(prev => prev.filter(p => p.id !== pieceId))
    setConfirmDelete(null)
  }

  if (loading) return <div className="p-6 text-zinc-400">Loading...</div>

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-zinc-400 hover:text-zinc-200 text-sm">←</button>
          <h1 className="text-lg font-semibold text-zinc-100">{worldName}</h1>
          <Link to={`/worlds/${id}`} className="text-zinc-500 hover:text-zinc-300 text-lg" title="Edit world">
            ⚙
          </Link>
        </div>
        <Link
          to={`/worlds/${id}/generate`}
          className="bg-violet-600 hover:bg-violet-500 text-white rounded px-4 py-2 font-medium transition-colors text-sm"
        >
          Generate
        </Link>
      </div>

      {pieces.length === 0 ? (
        <div className="text-center mt-16">
          <p className="text-zinc-500 mb-4">No pieces yet.</p>
          <Link
            to={`/worlds/${id}/generate`}
            className="text-violet-400 hover:text-violet-300"
          >
            Generate your first piece →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pieces.map(p => (
            <div key={p.id} className="bg-zinc-800 border border-zinc-700 rounded">
              <button
                className="w-full text-left px-4 py-3 hover:bg-zinc-700 transition-colors rounded"
                onClick={() => navigate(`/pieces/${p.id}`)}
              >
                <div className="text-zinc-100 text-sm font-medium truncate">{p.prompt}</div>
                <div className="text-zinc-400 text-sm mt-1 line-clamp-2">{p.preview}</div>
                <div className="text-zinc-600 text-xs mt-2">{relativeTime(p.created_at)}</div>
              </button>
              <div className="px-4 pb-3">
                {confirmDelete === p.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs">Delete this piece?</span>
                    <button
                      className="text-rose-400 hover:text-rose-300 text-xs border border-rose-900 rounded px-2 py-0.5"
                      onClick={() => deletePiece(p.id)}
                    >
                      Yes
                    </button>
                    <button
                      className="text-zinc-500 hover:text-zinc-300 text-xs"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-zinc-600 hover:text-rose-400 text-xs transition-colors"
                    onClick={() => setConfirmDelete(p.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
