import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { relativeTime } from '../utils/time'

interface PromptPiece {
  id: number
  prompt_id: number
  prompt: string
  preview: string
  created_at: number
}

interface ClusterGroup {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  updated_at: number
  prompt_ids: number[]
  pieces: PromptPiece[]
}

interface PromptResponse {
  items: ClusterGroup[]
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
  const [groups, setGroups] = useState<ClusterGroup[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/worlds/${id}`),
      apiFetch(`/api/worlds/${id}/clusters?page=${page}&limit=${PAGE_SIZE}`),
    ])
      .then(([world, response]: [{ name: string }, PromptResponse]) => {
        setWorldName(world.name)
        setGroups(response.items)
        setHasMore(response.hasMore)
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id, page, navigate])

  if (loading) return <div className="p-6 text-ink-3">Loading...</div>

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/')} className="text-ink-3 hover:text-ink text-sm">Back</button>
          <h1 className="font-serif-zh text-2xl font-normal text-ink truncate">{worldName}</h1>
          <Link to={`/worlds/${id}/details`} className="text-ink-3 hover:text-ink-2 text-sm" title="Edit world">
            Edit
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/worlds/${id}/prompts/new`}
            className="border border-paper-3 text-ink hover:border-ink-4 rounded-sm px-4 py-2 font-medium transition-colors text-sm"
          >
            Create a prompt
          </Link>
          <Link
            to={`/worlds/${id}/generate`}
            className="bg-rose hover:bg-rose-deep text-white rounded-sm px-4 py-2 font-medium transition-colors text-sm"
          >
            Generate
          </Link>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center mt-16">
          <p className="text-ink-3 mb-4">No prompts yet.</p>
          <Link
            to={`/worlds/${id}/prompts/new`}
            className="text-rose hover:text-rose-deep"
          >
            Create your first prompt
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {groups.map(group => (
              <section key={group.id} className="bg-paper border border-paper-3 rounded-md">
                <Link
                  to={`/worlds/${id}/clusters/${group.id}`}
                  className="block px-4 py-3 hover:bg-paper-2 transition-colors rounded-t-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-serif-zh text-ink text-sm font-normal leading-6">{group.title}</h2>
                    <div className="shrink-0 text-right text-ink-3 text-xs mt-1">
                      <div>{group.prompt_count} {group.prompt_count === 1 ? 'prompt' : 'prompts'}</div>
                      <div>{group.piece_count} {group.piece_count === 1 ? 'piece' : 'pieces'}</div>
                    </div>
                  </div>
                  <div className="text-ink-3 text-xs mt-2">
                    Cluster {group.id} - Latest {relativeTime(group.updated_at)}
                  </div>
                </Link>

                <div className="border-t border-paper-3">
                  {group.pieces.length === 0 ? (
                    <p className="px-4 py-3 text-ink-3 text-sm">No pieces yet.</p>
                  ) : (
                    group.pieces.map(piece => (
                      <Link
                        key={piece.id}
                        to={`/pieces/${piece.id}`}
                        className="grid grid-cols-[92px_1fr] gap-3 px-4 py-2 text-sm hover:bg-paper-2 transition-colors"
                      >
                        <span className="text-ink-3 text-xs whitespace-nowrap">{relativeTime(piece.created_at)}</span>
                        <span className="text-ink-2 truncate">{shortPreview(piece.preview || piece.prompt)}</span>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>

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
        </>
      )}
    </div>
  )
}
