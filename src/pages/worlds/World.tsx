import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowUp, Ellipsis, GitBranch, WandSparkles } from 'lucide-react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
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

interface WorldReturnState {
  clusterId: number
  loadedPages: number
  cardTop: number
}

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

const PAGE_SIZE = 20

function worldReturnKey(worldId: string) {
  return `world-return:${worldId}`
}

function readWorldReturnState(worldId: string | undefined) {
  if (!worldId) return null

  try {
    const raw = sessionStorage.getItem(worldReturnKey(worldId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<WorldReturnState>
    if (
      typeof parsed.clusterId !== 'number' ||
      typeof parsed.loadedPages !== 'number' ||
      typeof parsed.cardTop !== 'number'
    ) {
      return null
    }

    return {
      clusterId: parsed.clusterId,
      loadedPages: Math.max(1, parsed.loadedPages),
      cardTop: parsed.cardTop,
    }
  } catch {
    return null
  }
}

function clearWorldReturnState(worldId: string | undefined) {
  if (!worldId) return

  try {
    sessionStorage.removeItem(worldReturnKey(worldId))
  } catch { }
}

export default function World() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const restoreKeyRef = useRef<string | null>(null)
  const restoreStateRef = useRef<WorldReturnState | null>(null)
  const restoreScheduledRef = useRef(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  if (id !== restoreKeyRef.current) {
    restoreKeyRef.current = id ?? null
    restoreStateRef.current = readWorldReturnState(id)
    restoreScheduledRef.current = false
  }

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })

  const clustersQuery = useInfiniteQuery({
    queryKey: ['world-clusters', id],
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/worlds/${id}/clusters?page=${pageParam}&limit=${PAGE_SIZE}`) as Promise<PromptResponse>,
    enabled: !!id,
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.hasMore ? lastPage.page + 1 : undefined,
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = clustersQuery

  const errored = worldQuery.isError || clustersQuery.isError
  useEffect(() => {
    if (errored) navigate('/')
  }, [errored, navigate])

  useEffect(() => {
    const updateScrollTopVisibility = () => {
      setShowScrollTop(window.scrollY > 0)
    }

    updateScrollTopVisibility()
    window.addEventListener('scroll', updateScrollTopVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollTopVisibility)
  }, [])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasNextPage) return

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !isFetchingNextPage && !restoreStateRef.current) {
        fetchNextPage()
      }
    }, { rootMargin: '360px 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const pages = clustersQuery.data?.pages ?? []
  const groups = useMemo(() => pages.flatMap(page => page.items), [pages])

  useEffect(() => {
    const restoreState = restoreStateRef.current
    if (!id || !clustersQuery.data || !restoreState || restoreScheduledRef.current) return

    const hasCluster = groups.some(group => group.id === restoreState.clusterId)
    const shouldLoadMore =
      hasNextPage &&
      !isFetchingNextPage &&
      (pages.length < restoreState.loadedPages || !hasCluster)

    if (shouldLoadMore) {
      fetchNextPage()
      return
    }

    if (!hasCluster) {
      clearWorldReturnState(id)
      restoreStateRef.current = null
      return
    }

    restoreScheduledRef.current = true
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-cluster-id="${restoreState.clusterId}"]`)
      if (card) {
        window.scrollBy({ top: card.getBoundingClientRect().top - restoreState.cardTop })
      }
      clearWorldReturnState(id)
      restoreStateRef.current = null
    })
  }, [fetchNextPage, groups, hasNextPage, id, isFetchingNextPage, pages.length, clustersQuery.data])

  function saveClusterReturnState(clusterId: number, event: MouseEvent<HTMLAnchorElement>) {
    if (!id) return

    const card = event.currentTarget.closest('[data-cluster-id]') as HTMLElement | null
    const cardTop = card?.getBoundingClientRect().top ?? 0

    try {
      sessionStorage.setItem(worldReturnKey(id), JSON.stringify({
        clusterId,
        loadedPages: Math.max(1, pages.length),
        cardTop,
      }))
    } catch { }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const worldName = worldQuery.data?.name ?? ''
  const firstPage = pages[0]
  const totalClusters = firstPage?.total ?? 0
  const totalPieces = firstPage?.totalPieces ?? 0

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
            to={`/worlds/${id}/edit`}
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
                  data-cluster-id={group.id}
                  className="overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_1px_0_rgba(26,18,16,0.02)]"
                >
                  <Link
                    to={`/worlds/${id}/clusters/${group.id}`}
                    onClick={event => saveClusterReturnState(group.id, event)}
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

            <div ref={loadMoreRef} className="mt-7 min-h-8 text-center text-sm text-ink-4">
              {isFetchingNextPage && 'Loading more...'}
            </div>
            {!hasNextPage && groups.length > PAGE_SIZE && (
              <div className="mt-2 text-center text-xs text-ink-4">End of prompts</div>
            )}
          </>
        )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-7 left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full border border-paper-3 bg-white text-ink shadow-[0_10px_24px_rgba(26,18,16,0.14)] transition-all hover:-translate-y-0.5 hover:bg-paper-2 focus:outline-none focus:ring-4 focus:ring-ink-4/20"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ArrowUp aria-hidden="true" className="h-5 w-5" />
        </button>
      )}

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
