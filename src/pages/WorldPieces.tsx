import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'

interface PromptPiece {
  id: number
  preview: string
  created_at: number
}

interface PromptGroup {
  id: number
  text: string
  piece_count: number
  updated_at: number
  pieces: PromptPiece[]
}

interface PromptResponse {
  items: PromptGroup[]
  page: number
  limit: number
  hasMore: boolean
}

function shortPreview(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= 90) return compact
  return `${compact.slice(0, 90)}...`
}

const PAGE_SIZE = 20

export default function WorldPieces() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [groups, setGroups] = useState<PromptGroup[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/worlds/${id}`),
      apiFetch(`/api/worlds/${id}/prompts?page=${page}&limit=${PAGE_SIZE}`),
    ])
      .then(([world, response]: [{ name: string }, PromptResponse]) => {
        setWorldName(world.name)
        setGroups(response.items)
        setHasMore(response.hasMore)
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id, page, navigate])

  if (loading) return <div className="p-6 text-zinc-400">Loading...</div>

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/')} className="text-zinc-400 hover:text-zinc-200 text-sm">Back</button>
          <h1 className="text-lg font-semibold text-zinc-100 truncate">{worldName}</h1>
          <Link to={`/worlds/${id}`} className="text-zinc-500 hover:text-zinc-300 text-sm" title="Edit world">
            Edit
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/worlds/${id}/prompts/new`}
            className="border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 rounded px-4 py-2 font-medium transition-colors text-sm"
          >
            Create a prompt
          </Link>
          <Link
            to={`/worlds/${id}/generate`}
            className="bg-violet-600 hover:bg-violet-500 text-white rounded px-4 py-2 font-medium transition-colors text-sm"
          >
            Generate
          </Link>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center mt-16">
          <p className="text-zinc-500 mb-4">No prompts yet.</p>
          <Link
            to={`/worlds/${id}/prompts/new`}
            className="text-violet-400 hover:text-violet-300"
          >
            Create your first prompt
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {groups.map(group => (
              <section key={group.id} className="bg-zinc-800 border border-zinc-700 rounded">
                <Link
                  to={`/worlds/${id}/prompts/${group.id}`}
                  className="block px-4 py-3 hover:bg-zinc-700 transition-colors rounded-t"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-zinc-100 text-sm font-medium leading-6">{group.text}</h2>
                    <span className="shrink-0 text-zinc-500 text-xs mt-1">
                      {group.piece_count} {group.piece_count === 1 ? 'piece' : 'pieces'}
                    </span>
                  </div>
                  <div className="text-zinc-600 text-xs mt-2">Latest {relativeTime(group.updated_at)}</div>
                </Link>

                <div className="border-t border-zinc-700">
                  {group.pieces.length === 0 ? (
                    <p className="px-4 py-3 text-zinc-500 text-sm">No pieces yet.</p>
                  ) : (
                    group.pieces.map(piece => (
                      <Link
                        key={piece.id}
                        to={`/pieces/${piece.id}`}
                        className="grid grid-cols-[92px_1fr] gap-3 px-4 py-2 text-sm hover:bg-zinc-700 transition-colors"
                      >
                        <span className="text-zinc-500 text-xs whitespace-nowrap">{relativeTime(piece.created_at)}</span>
                        <span className="text-zinc-300 truncate">{shortPreview(piece.preview)}</span>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              className="border border-zinc-700 text-zinc-400 rounded px-3 py-1.5 text-sm transition-colors hover:border-zinc-500 disabled:opacity-40 disabled:hover:border-zinc-700"
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span className="text-zinc-600 text-xs">Page {page}</span>
            <button
              className="border border-zinc-700 text-zinc-400 rounded px-3 py-1.5 text-sm transition-colors hover:border-zinc-500 disabled:opacity-40 disabled:hover:border-zinc-700"
              onClick={() => setPage(prev => prev + 1)}
              disabled={!hasMore}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
