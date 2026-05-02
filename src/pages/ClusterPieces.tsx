import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { diffPromptText } from '../utils/promptDiff'
import { relativeTime } from '../utils/time'

interface Cluster {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  updated_at: number
}

interface ClusterPrompt {
  id: number
  text: string
  piece_count: number
  created_at: number
  updated_at: number
}

interface ClusterResponse {
  cluster: Cluster
  prompts: ClusterPrompt[]
}

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

export default function ClusterPieces() {
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [cluster, setCluster] = useState<Cluster | null>(null)
  const [prompts, setPrompts] = useState<ClusterPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const promptDiffs = useMemo(
    () => prompts.map((prompt, index) => {
      const previousPrompt = prompts[index - 1]
      return previousPrompt ? diffPromptText(previousPrompt.text, prompt.text) : null
    }),
    [prompts],
  )

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

  if (loading) return <div className="page-width p-6 text-ink-3">Loading...</div>
  if (!cluster) return null

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="mb-6">
        <Link to={`/worlds/${id}`} className="text-rose hover:text-rose-deep text-sm">
          Back to {worldName || 'Pieces'}
        </Link>
      </div>

      {prompts.length === 0 ? (
        <p className="text-ink-3 text-sm">No variations yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {prompts.map((prompt, index) => {
              const diff = promptDiffs[index]

              return (
                <section
                  key={prompt.id}
                  className="overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_1px_0_rgba(26,18,16,0.02)]"
                >
                  <Link
                    to={`/worlds/${id}/prompts/${prompt.id}`}
                    className="block px-5 py-5 transition-colors hover:bg-paper-2/45 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-rose/30"
                  >
                    <div className="mb-4 flex items-center justify-between gap-4 text-xs text-ink-4">
                      <span>{countLabel(prompt.piece_count, 'piece')}</span>
                      <span className="shrink-0">Inserted {relativeTime(prompt.updated_at)}</span>
                    </div>
                    <h2 className="font-serif-zh text-sm font-normal leading-6 text-ink-2">
                      {prompt.text}
                    </h2>

                    {diff && (
                      <div className="mt-4 space-y-1 rounded-sm border border-paper-3 bg-paper-2 px-3 py-2 font-mono text-xs leading-5">
                        {diff.removed && (
                          <div className="text-red-800/70">
                            <span className="select-none">- </span>
                            {diff.removed}
                          </div>
                        )}
                        {diff.added && (
                          <div className="text-green-800/70">
                            <span className="select-none">+ </span>
                            {diff.added}
                          </div>
                        )}
                      </div>
                    )}


                  </Link>

                  <Link
                    to={`/worlds/${id}/generate?promptId=${prompt.id}`}
                    className="block w-full border-t border-paper-3 text-paper-2 px-4 py-2 text-center text-xs font-medium bg-ink-3/80 transition-colors hover:bg-paper-2 hover:text-rose-deep focus:outline-none focus:ring-2 focus:ring-inset focus:ring-rose/30"
                  >
                    Use this prompt
                  </Link>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
