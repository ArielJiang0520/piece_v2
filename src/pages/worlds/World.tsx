import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowUp, ArrowUpDown, Check, GitBranch, Search, Plus, X } from 'lucide-react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useScrollReturn } from '@/hooks/useScrollReturn'
import CountIndicator from '@/components/CountIndicator'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TextField from '@/components/TextField'
import { useTopNavConfig } from '@/components/topNavConfig'
import WorldHeader from './WorldHeader'

interface ClusterGroup {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  latest_prompt_id: number | null
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

interface SearchResponse {
  items: ClusterGroup[]
  total: number
  query: string
  hasMore: boolean
}

interface WorldReturnState {
  clusterId: number
  loadedPages: number
  cardTop: number
}

const PAGE_SIZE = 20

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'most_pieces', label: `Most ${entityLabel('piece', { plural: true })}` },
  { value: 'most_variations', label: `Most ${entityLabel('prompt')} variations` },
  { value: 'oldest', label: 'Oldest' },
] as const

type SortKey = typeof SORT_OPTIONS[number]['value']

function ClusterCardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="hairline-list mt-8 flex flex-col">
      {Array.from({ length: count }, (_, index) => (
        <section key={index} className="py-7">
          <Skeleton className="mb-3 h-3 w-24" />
          <SkeletonText lineClassName="h-4" lines={3} />
          <Skeleton className="mt-4 h-3 w-32" />
        </section>
      ))}
    </div>
  )
}

function parseWorldReturnState(value: unknown) {
  const parsed = value as Partial<WorldReturnState>
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
}

export default function World() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const {
    stateRef: restoreStateRef,
    scheduledRef: restoreScheduledRef,
    clear: clearWorldReturnState,
    save: saveWorldReturnState,
  } = useScrollReturn(id ? `world-return:${id}` : null, parseWorldReturnState)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const sortParam = searchParams.get('sort')
  const sort: SortKey = SORT_OPTIONS.some(o => o.value === sortParam)
    ? sortParam as SortKey
    : 'latest'
  const [sortOpen, setSortOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const queryParam = (searchParams.get('q') ?? '').trim()
  const [searchInput, setSearchInput] = useState(queryParam)
  const isSearching = queryParam.length > 0

  useEffect(() => {
    if (searchInput.trim() === queryParam) return
    const t = setTimeout(() => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev)
        const trimmed = searchInput.trim()
        if (trimmed) params.set('q', trimmed)
        else params.delete('q')
        return params
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, queryParam, setSearchParams])

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string; is_example: boolean }>,
    enabled: !!id,
  })

  const clustersQuery = useInfiniteQuery({
    queryKey: ['world-clusters', id, sort],
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/worlds/${id}/clusters?page=${pageParam}&limit=${PAGE_SIZE}&sort=${sort}`) as Promise<PromptResponse>,
    enabled: !!id && !isSearching,
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.hasMore ? lastPage.page + 1 : undefined,
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = clustersQuery

  const searchQuery = useQuery({
    queryKey: ['world-clusters-search', id, queryParam],
    queryFn: () => apiFetch(`/api/worlds/${id}/clusters/search?q=${encodeURIComponent(queryParam)}`) as Promise<SearchResponse>,
    enabled: !!id && isSearching,
  })

  const errored = worldQuery.isError || (isSearching ? searchQuery.isError : clustersQuery.isError)
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
    if (!sortOpen) return

    function handleClickOutside(event: PointerEvent) {
      if (!sortMenuRef.current) return
      if (!sortMenuRef.current.contains(event.target as Node)) setSortOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSortOpen(false)
    }

    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [sortOpen])

  function handleSortChange(next: SortKey) {
    setSortOpen(false)
    if (next === sort) return
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (next === 'latest') params.delete('sort')
      else params.set('sort', next)
      return params
    }, { replace: true })
    clearWorldReturnState()
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasNextPage || isSearching) return

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !isFetchingNextPage && !restoreStateRef.current) {
        fetchNextPage()
      }
    }, { rootMargin: '360px 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isSearching])

  const pages = clustersQuery.data?.pages ?? []
  const listGroups = useMemo(() => pages.flatMap(page => page.items), [pages])
  const groups = isSearching ? (searchQuery.data?.items ?? []) : listGroups

  const activeData = isSearching ? searchQuery.data : clustersQuery.data
  const loadingSearch = isSearching && searchQuery.isLoading

  useEffect(() => {
    const restoreState = restoreStateRef.current
    if (!id || !activeData || !restoreState || restoreScheduledRef.current) return

    const hasCluster = groups.some(group => group.id === restoreState.clusterId)
    const shouldLoadMore =
      !isSearching &&
      hasNextPage &&
      !isFetchingNextPage &&
      (pages.length < restoreState.loadedPages || !hasCluster)

    if (shouldLoadMore) {
      fetchNextPage()
      return
    }

    if (!hasCluster) {
      clearWorldReturnState()
      return
    }

    restoreScheduledRef.current = true
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-cluster-id="${restoreState.clusterId}"]`)
      if (card) {
        window.scrollBy({ top: card.getBoundingClientRect().top - restoreState.cardTop })
      }
      clearWorldReturnState()
    })
  }, [fetchNextPage, groups, hasNextPage, id, isFetchingNextPage, pages.length, activeData, isSearching, clearWorldReturnState])

  function saveClusterReturnState(clusterId: number, event: MouseEvent<HTMLAnchorElement>) {
    if (!id) return

    const card = event.currentTarget.closest('[data-cluster-id]') as HTMLElement | null
    const cardTop = card?.getBoundingClientRect().top ?? 0

    saveWorldReturnState({
      clusterId,
      loadedPages: Math.max(1, pages.length),
      cardTop,
    })
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const worldName = worldQuery.data?.name ?? ''
  const firstPage = pages[0]
  const totalClusters = firstPage?.total ?? 0
  const searchTotal = searchQuery.data?.items.length ?? 0
  useTopNavConfig({ backHref: '/worlds' })

  if (!worldQuery.data || (isSearching ? false : !clustersQuery.data)) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="page-width min-h-screen px-6 pb-32 pt-12">
          <header>
            <Skeleton className="h-11 w-52" />
            <Skeleton className="mt-6 h-11 w-full rounded-full" />
          </header>
          <Skeleton className="mt-6 h-11 w-full rounded-md" />
          <div className="mt-5 flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <ClusterCardSkeletons />
        </div>
      </div>
    )
  }

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      <div className="page-width min-h-screen px-6 pb-32 pt-12">
        <WorldHeader
          active="scenes"
          isExample={worldQuery.data.is_example}
          name={worldName}
          worldId={id}
        />

        <div className="mt-6">
          <TextField
            type="text"
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder={`Search ${entityLabel('prompt', { plural: true })} by meaning...`}
            aria-label={`Search ${entityLabel('prompt', { plural: true })}`}
            variant="search"
            leadingAdornment={<Search aria-hidden="true" className="h-4 w-4 text-ink-4" />}
            trailingAdornment={searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="grid h-6 w-6 place-items-center rounded-full text-ink-4 hover:text-ink-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                aria-label="Clear search"
                title="Clear search"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          />
        </div>

        <div className="mt-6 flex items-baseline justify-between gap-4">
          <div className="t-eyebrow">
            {loadingSearch ? (
              <Skeleton className="h-3 w-24" />
            ) : isSearching ? (
              <>
                <span className="text-rose">{searchTotal}</span>{' '}
                {searchTotal === 1 ? 'match' : 'matches'}
              </>
            ) : (
              <>
                <span className="text-rose">{totalClusters}</span>{' '}
                {entityLabel('prompt', { plural: totalClusters !== 1 })}
              </>
            )}
          </div>
          {!isSearching && groups.length > 0 && (
            <div ref={sortMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setSortOpen(open => !open)}
                className="t-meta flex items-center gap-1.5 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
                aria-haspopup="menu"
                aria-expanded={sortOpen}
              >
                <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{SORT_OPTIONS.find(o => o.value === sort)?.label}</span>
              </button>
              {sortOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-10 mt-2 w-52 overflow-hidden rounded-md bg-paper shadow-(--shadow-menu)"
                >
                  {SORT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sort === option.value}
                      onClick={() => handleSortChange(option.value)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left font-serif-zh text-sm italic text-ink-2 transition-colors hover:text-ink focus:outline-none focus:bg-rose-tint"
                    >
                      <span>{option.label}</span>
                      {sort === option.value && (
                        <Check aria-hidden="true" className="h-3.5 w-3.5 text-rose" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {loadingSearch ? (
          <ClusterCardSkeletons count={3} />
        ) : groups.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="t-meta mb-5">
              {isSearching
                ? 'No matches.'
                : `No ${entityLabel('prompt', { plural: true })} yet.`}
            </p>
          </div>
        ) : (
          <>
            <ul className="hairline-list mt-6 flex flex-col">
              {groups.map((group, index) => (
                <li
                  key={group.id}
                  data-cluster-id={group.id}
                  className="list-item-reveal"
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <Link
                    to={
                      group.latest_prompt_id
                        ? `/worlds/${id}/generate?promptId=${group.latest_prompt_id}`
                        : `/worlds/${id}/generate`
                    }
                    state={{ fromWorldList: true }}
                    onClick={event => saveClusterReturnState(group.id, event)}
                    className="block py-7 transition-transform duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
                  >
                    <RelativeTimeStatus
                      className="mb-3"
                      timestamp={group.latest_piece_at}
                      emptyLabel={`No ${entityLabel('piece', { plural: true })}`}
                    />
                    <p className="font-serif-zh text-[16px] leading-7 text-ink-2 line-clamp-4">
                      {group.title}
                    </p>
                    <div className="t-meta mt-4 flex items-center justify-between gap-4">
                      <CountIndicator count={group.piece_count} />
                      {group.prompt_count > 1 && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>
                            {group.prompt_count} {group.prompt_count === 1 ? 'version' : 'versions'}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {!isSearching && (
              <>
                <div ref={loadMoreRef} className="mt-7 min-h-8 text-center text-sm text-ink-4">
                  {isFetchingNextPage && (
                    <div className="-mt-8">
                      <ClusterCardSkeletons count={1} />
                    </div>
                  )}
                </div>
                {!hasNextPage && groups.length > PAGE_SIZE && (
                  <div className="mt-2 text-center text-xs text-ink-4">End of {entityLabel('prompt', { plural: true })}</div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-7 left-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] grid h-14 w-14 place-items-center rounded-full bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ArrowUp aria-hidden="true" className="h-6 w-6" />
        </button>
      )}

      <Link
        to={`/worlds/${id}/generate`}
        className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] inline-flex items-center gap-3 rounded-full bg-rose py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
        aria-label={`New ${entityLabel('prompt', { capitalize: true })}`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
          <Plus aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
        </span>
        New {entityLabel('prompt', { capitalize: true })}
      </Link>
    </div>
  )
}
