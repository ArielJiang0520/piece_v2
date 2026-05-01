import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'

interface Cluster {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  updated_at: number
}

interface Piece {
  id: number
  preview: string
  created_at: number
}

interface ClusterPrompt {
  id: number
  text: string
  piece_count: number
  updated_at: number
  pieces: Piece[]
}

interface ClusterResponse {
  cluster: Cluster
  prompts: ClusterPrompt[]
}

function preview(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length <= 140 ? compact : `${compact.slice(0, 140)}...`
}

export default function ClusterPieces() {
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [cluster, setCluster] = useState<Cluster | null>(null)
  const [prompts, setPrompts] = useState<ClusterPrompt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/worlds/${id}`),
      apiFetch(`/api/worlds/${id}/clusters/${clusterId}`),
    ])
      .then(([world, response]: [{ name: string }, ClusterResponse]) => {
        setWorldName(world.name)
        setCluster(response.cluster)
        setPrompts(response.prompts)
      })
      .catch(() => navigate(`/worlds/${id}`))
      .finally(() => setLoading(false))
  }, [id, clusterId, navigate])

  if (loading) return <div className="p-6 text-zinc-400">Loading...</div>
  if (!cluster) return null

  return (
    <div className="min-h-screen px-4 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to={`/worlds/${id}`} className="text-violet-400 hover:text-violet-300 text-sm">
          Back to {worldName || 'Pieces'}
        </Link>
      </div>

      <header className="mb-6">
        <p className="text-zinc-500 text-xs mb-2">
          Cluster {cluster.id} - {cluster.prompt_count} {cluster.prompt_count === 1 ? 'prompt' : 'prompts'} - {cluster.piece_count} {cluster.piece_count === 1 ? 'piece' : 'pieces'} - latest {relativeTime(cluster.updated_at)}
        </p>
        <h1 className="text-zinc-100 text-lg font-semibold leading-7">{cluster.title}</h1>
      </header>

      <div className="flex flex-col gap-4">
        {prompts.map(prompt => (
          <section key={prompt.id} className="bg-zinc-800 border border-zinc-700 rounded">
            <Link
              to={`/worlds/${id}/prompts/${prompt.id}`}
              className="block px-4 py-3 hover:bg-zinc-700 transition-colors rounded-t"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-zinc-100 text-sm font-medium leading-6">{prompt.text}</h2>
                <span className="shrink-0 text-zinc-500 text-xs mt-1">
                  {prompt.piece_count} {prompt.piece_count === 1 ? 'piece' : 'pieces'}
                </span>
              </div>
              <div className="text-zinc-600 text-xs mt-2">Prompt {prompt.id} - Latest {relativeTime(prompt.updated_at)}</div>
            </Link>

            <div className="border-t border-zinc-700">
              {prompt.pieces.length === 0 ? (
                <p className="px-4 py-3 text-zinc-500 text-sm">No pieces yet.</p>
              ) : (
                prompt.pieces.map(piece => (
                  <Link
                    key={piece.id}
                    to={`/pieces/${piece.id}`}
                    className="grid grid-cols-[92px_1fr] gap-3 px-4 py-2 text-sm hover:bg-zinc-700 transition-colors"
                  >
                    <span className="text-zinc-500 text-xs whitespace-nowrap">{relativeTime(piece.created_at)}</span>
                    <span className="text-zinc-300 truncate">{preview(piece.preview)}</span>
                  </Link>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
