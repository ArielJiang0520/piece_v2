import { useEffect } from 'react'
import { Ellipsis, GitBranch, WandSparkles } from 'lucide-react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import PieceCountIndicator from '../../ui/PieceCountIndicator'
import RelativeTimeStatus from '../../ui/RelativeTimeStatus'

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

const PAGE_SIZE = 20

function parsePageParam(value: string | null) {
  const page = Number(value ?? '1')
  return Number.isInteger(page) && page > 0 ? page : 1
}

function detailSearchForPage(page: number) {
  return page > 1 ? `?worldPage=${page}` : ''
}

export default function World() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePageParam(searchParams.get('page'))

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })

  const clustersQuery = useQuery({
    queryKey: ['world-clusters', id, page],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/clusters?page=${page}&limit=${PAGE_SIZE}`) as Promise<PromptResponse>,
    enabled: !!id,
    placeholderData: previous => previous,
  })

  const errored = worldQuery.isError || clustersQuery.isError
  useEffect(() => {
    if (errored) navigate('/')
  }, [errored, navigate])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page])

  function setPage(nextPage: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (nextPage <= 1) {
        next.delete('page')
      } else {
        next.set('page', String(nextPage))
      }
      return next
    })
  }

  const worldName = worldQuery.data?.name ?? ''
  const groups = clustersQuery.data?.items ?? []
  const totalClusters = clustersQuery.data?.total ?? 0
  const totalPieces = clustersQuery.data?.totalPieces ?? 0
  const hasMore = clustersQuery.data?.hasMore ?? false

  if (!worldQuery.data || !clustersQuery.data) {
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
              {groups.map(group => (
                <section
                  key={group.id}
                  className="overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_1px_0_rgba(26,18,16,0.02)]"
                >
                  <Link
                    to={`/worlds/${id}/clusters/${group.id}${detailSearchForPage(page)}`}
                    className="block px-5 py-5 transition-colors hover:bg-paper-2/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-4/35"
                  >
                    <RelativeTimeStatus timestamp={group.latest_piece_at} emptyLabel="No pieces" />
                    <div className="font-serif-zh text-sm font-normal text-ink-2 line-clamp-4">
                      {group.title}
                    </div>
                  </Link>

                  <div className="flex items-center justify-between gap-4 border-t border-paper-3 bg-paper-2/70 px-7 py-4 text-xs leading-none text-ink-4">
                    <PieceCountIndicator count={group.piece_count} />
                    <div className="flex shrink-0 items-center gap-1.5 text-ink-4">
                      <GitBranch aria-hidden="true" className="h-4 w-4" />
                      <span>{countLabel(group.prompt_count, 'variation')}</span>
                    </div>
                  </div>
                </section>
              ))}
            </div>

            {(page > 1 || hasMore) && (
              <div className="mt-7 flex items-center justify-between">
                <button
                  className="rounded-full border border-paper-3 px-5 py-2.5 text-sm text-ink-3 transition-colors hover:border-ink-4 hover:text-ink disabled:opacity-35 disabled:hover:border-paper-3 disabled:hover:text-ink-3"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span className="text-sm text-ink-4">Page {page}</span>
                <button
                  className="rounded-full border border-paper-3 px-5 py-2.5 text-sm text-ink-3 transition-colors hover:border-ink-4 hover:text-ink disabled:opacity-35 disabled:hover:border-paper-3 disabled:hover:text-ink-3"
                  onClick={() => setPage(page + 1)}
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
        className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] grid h-18 w-18 place-items-center rounded-full border border-rose bg-rose text-white shadow-[0_16px_34px_rgba(205,83,106,0.34)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.42)] focus:outline-none focus:ring-4 focus:ring-rose/25"
        aria-label="Generate piece"
        title="Generate piece"
      >
        <WandSparkles aria-hidden="true" className="h-6 w-6" />
      </Link>
    </div>
  )
}
