import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowUp, ArrowUpDown, Check, GitBranch, Search, Plus, X, Ellipsis } from 'lucide-react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import { useScrollReturn } from '../../hooks/useScrollReturn'
import CountIndicator from '../../components/CountIndicator'
import RelativeTimeStatus from '../../components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '../../components/Skeleton'
import TextField from '../../components/TextField'
import { useTopNavConfig } from '../../components/topNavConfig'

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

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
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
    <div className="mt-8 flex flex-col gap-4">
      {Array.from({ length: count }, (_, index) => (
        <section
          key={index}
          className="overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_1px_0_rgba(26,18,16,0.02)]"
        >
          <div className="px-5 py-5">
            <Skeleton className="mb-3 h-3 w-24" />
            <SkeletonText lineClassName="h-4" lines={3} />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-paper-3 bg-paper-2/70 px-7 py-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
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
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
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
        <div className="page-width min-h-screen px-4 pb-32 pt-12">
          <header className="flex items-start justify-between gap-5">
            <Skeleton className="h-11 w-52" />
            <Skeleton className="mt-1 h-10 w-10 rounded-full" />
          </header>
          <Skeleton className="mt-4 h-11 w-full rounded-md" />
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
    <div className="min-h-screen bg-paper">
      <div className="page-width min-h-screen px-4 pb-32 pt-12">
        <header className="flex items-start justify-between gap-5">
          <h1 className="min-w-0 font-serif-zh text-[38px] font-normal leading-[1.12] text-ink">
            {worldName}
          </h1>
          <Link
            to={`/worlds/${id}/edit`}
            className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-paper-2 hover:text-ink-3 focus:outline-none focus:ring-2 focus:ring-rose/30"
            title={`Edit ${entityLabel('world')}`}
            aria-label={`Edit ${entityLabel('world')}`}
          >
            <Ellipsis aria-hidden="true" className="h-6 w-6" />
          </Link>
        </header>

        <div className="mt-4">
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
                className="grid h-6 w-6 place-items-center rounded-full text-ink-4 hover:bg-paper-2 hover:text-ink-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                aria-label="Clear search"
                title="Clear search"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="text-xs text-ink-4">
            {loadingSearch ? (
              <Skeleton className="h-3 w-24" />
            ) : isSearching ? (
              `${countLabel(searchTotal, 'match')} for "${queryParam}"`
            ) : (
              <>
                {countLabel(totalClusters, entityLabel('prompt'))}
              </>
            )}
          </div>
          {!isSearching && groups.length > 0 && (
            <div ref={sortMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setSortOpen(open => !open)}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
                aria-haspopup="menu"
                aria-expanded={sortOpen}
              >
                <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{SORT_OPTIONS.find(o => o.value === sort)?.label}</span>
              </button>
              {sortOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_8px_24px_rgba(26,18,16,0.12)]"
                >
                  {SORT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sort === option.value}
                      onClick={() => handleSortChange(option.value)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-ink-2 transition-colors hover:bg-paper-2 focus:outline-none focus:bg-paper-2"
                    >
                      <span>{option.label}</span>
                      {sort === option.value && (
                        <Check aria-hidden="true" className="h-3.5 w-3.5 text-ink-3" />
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
            <p className="mb-5 text-sm text-ink-3">
              {isSearching
                ? 'No matches.'
                : `No ${entityLabel('prompt', { plural: true })} yet.`}
            </p>
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
                    to={
                      group.prompt_count === 1 && group.latest_prompt_id
                        ? `/worlds/${id}/prompts/${group.latest_prompt_id}`
                        : `/worlds/${id}/clusters/${group.id}`
                    }
                    state={{ fromWorldList: true }}
                    onClick={event => saveClusterReturnState(group.id, event)}
                    className="block px-5 py-5 transition-colors hover:bg-paper-2/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-4/35"
                  >
                    <RelativeTimeStatus timestamp={group.latest_piece_at} emptyLabel={`No ${entityLabel('piece', { plural: true })}`} />
                    <div className="font-serif-zh text-sm font-normal text-ink-2 line-clamp-4">
                      {group.title}
                    </div>
                  </Link>

                  <div className="flex items-center justify-between gap-4 border-t border-paper-3 bg-paper-2/70 px-7 py-4 text-xs leading-none text-ink-4">
                    <CountIndicator count={group.piece_count} />
                    {group.prompt_count > 1 && (
                      <div className="flex shrink-0 items-center gap-1.5 text-ink-4">
                        <GitBranch aria-hidden="true" className="h-4 w-4" />
                        <span>{countLabel(group.prompt_count, `variation`)}</span>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>

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
          className="fixed bottom-7 left-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] grid h-14 w-14 place-items-center rounded-full border border-paper-3 bg-paper text-ink shadow-[0_10px_24px_rgba(26,18,16,0.14)] transition-all hover:-translate-y-0.5 hover:bg-paper-2 focus:outline-none focus:ring-4 focus:ring-ink-4/20 dark:shadow-[0_10px_24px_rgba(0,0,0,0.32)]"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ArrowUp aria-hidden="true" className="h-6 w-6" />
        </button>
      )}

      <Link
        to={`/worlds/${id}/generate`}
        className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] inline-flex items-center gap-2 rounded-full border border-rose bg-rose px-5 py-3 text-base font-medium text-white shadow-[0_16px_34px_rgba(205,83,106,0.34)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.42)] focus:outline-none focus:ring-4 focus:ring-rose/25"
        aria-label={`New ${entityLabel('prompt', { capitalize: true })}`}
      >
        <Plus aria-hidden="true" className="h-5 w-5" />
        New {entityLabel('prompt', { capitalize: true })}
      </Link>
    </div>
  )
}
