import { useEffect, useState } from 'react'
import { Ellipsis, GitBranch, WandSparkles } from 'lucide-react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import RelativeTimeStatus from '../ui/RelativeTimeStatus'

interface ClusterGroup {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  latest_piece_at: number | null
}

interface PromptResponse {
  items: ClusterGroup[]
  page: number
  limit: number
  total: number
  totalPieces: number
  hasMore: boolean
}

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

function pieceDotClasses(pieceCount: number) {
  const visibleDots = Math.min(MAX_PIECE_DOTS, Math.ceil(pieceCount / 2))
  const darkDots = pieceCount > MAX_PIECE_DOTS * 2
    ? Math.min(MAX_PIECE_DOTS, Math.ceil((pieceCount - MAX_PIECE_DOTS * 2) / 2))
    : 0

  return Array.from({ length: visibleDots }, (_, index) =>
    index < darkDots ? 'bg-rose-deep/80' : 'bg-rose/65',
  )
}

const PAGE_SIZE = 20
const MAX_PIECE_DOTS = 8

export default function WorldPieces() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worldName, setWorldName] = useState('')
  const [groups, setGroups] = useState<ClusterGroup[]>([])
  const [page, setPage] = useState(1)
  const [totalClusters, setTotalClusters] = useState(0)
  const [totalPieces, setTotalPieces] = useState(0)
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
        setTotalClusters(response.total)
        setTotalPieces(response.totalPieces ?? 0)
        setHasMore(response.hasMore)
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id, page, navigate])

  if (loading) {
    return (
      <div className="page-width min-h-screen bg-paper px-7 py-12 text-sm text-ink-4">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="page-width min-h-screen px-4 pb-32 pt-12">
        <header className="flex items-start justify-between gap-5">
          <h1 className="min-w-0 font-serif-zh text-[38px] font-normal leading-[1.12] text-ink">
            {worldName}
          </h1>
          <Link
            to={`/worlds/${id}/details`}
            className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-paper-2 hover:text-ink-3 focus:outline-none focus:ring-2 focus:ring-rose/30"
            title="Edit world"
            aria-label="Edit world"
          >
            <Ellipsis aria-hidden="true" className="h-6 w-6" />
          </Link>
        </header>

        <div className="mt-9">
          <div className="mt-4 text-xs text-ink-4">
            {countLabel(totalClusters, 'prompt')}
            <span className="px-2">&middot;</span>
            {countLabel(totalPieces, 'piece')}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="mb-5 text-sm text-ink-3">No prompts yet.</p>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-col gap-4">
              {groups.map(group => {
                const pieceDots = pieceDotClasses(group.piece_count)

                return (
                  <section
                    key={group.id}
                    className="overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_1px_0_rgba(26,18,16,0.02)]"
                  >
                    <Link
                      to={`/worlds/${id}/clusters/${group.id}`}
                      className="block px-5 py-5 transition-colors hover:bg-paper-2/45 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-rose/30"
                    >
                      <RelativeTimeStatus timestamp={group.latest_piece_at} emptyLabel="No pieces" />
                      <div className=" font-serif-zh text-sm font-normal text-ink-2 line-clamp-4">
                        {group.title}
                      </div>
                    </Link>

                    <div className="flex items-center justify-between gap-4 border-t border-paper-3 bg-paper-2/70 px-7 py-4 text-xs leading-none text-ink-4">
                      <div className="flex min-w-0 items-center gap-3">
                        {pieceDots.length > 0 && (
                          <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
                            {pieceDots.map((dotClass, index) => (
                              <span key={`${group.id}-${index}`} className={`h-2 w-2 rounded-xs ${dotClass}`} />
                            ))}
                          </span>
                        )}
                        <span>{countLabel(group.piece_count, 'piece')}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 text-ink-4">
                        <GitBranch aria-hidden="true" className="h-4 w-4" />
                        <span>{countLabel(group.prompt_count, 'variation')}</span>
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>

            {(page > 1 || hasMore) && (
              <div className="mt-7 flex items-center justify-between">
                <button
                  className="rounded-full border border-paper-3 px-5 py-2.5 text-sm text-ink-3 transition-colors hover:border-ink-4 hover:text-ink disabled:opacity-35 disabled:hover:border-paper-3 disabled:hover:text-ink-3"
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span className="text-sm text-ink-4">Page {page}</span>
                <button
                  className="rounded-full border border-paper-3 px-5 py-2.5 text-sm text-ink-3 transition-colors hover:border-ink-4 hover:text-ink disabled:opacity-35 disabled:hover:border-paper-3 disabled:hover:text-ink-3"
                  onClick={() => setPage(prev => prev + 1)}
                  disabled={!hasMore}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Link
        to={`/worlds/${id}/generate`}
        className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] grid h-[72px] w-[72px] place-items-center rounded-full border border-rose bg-rose text-white shadow-[0_16px_34px_rgba(205,83,106,0.34)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.42)] focus:outline-none focus:ring-4 focus:ring-rose/25"
        aria-label="Generate piece"
        title="Generate piece"
      >
        <WandSparkles aria-hidden="true" className="h-6 w-6" />
      </Link>
    </div>
  )
}
