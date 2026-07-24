import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowUp, ChevronRight, GitBranch, Heart, History, Layers, Search, Plus, X, Lightbulb } from 'lucide-react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useScrollReturn } from '@/hooks/useScrollReturn'
import CountIndicator from '@/components/CountIndicator'
import ListEndMarker from '@/components/ListEndMarker'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TextField from '@/components/TextField'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import { setTasteProfileEnabled, useTasteProfileEnabled } from '@/preferences/tasteProfileEnabled'
import WorldSortMenu from '../shared/WorldSortMenu'
import WorldTabs from '../shared/WorldTabs'
import { useScrollTopButton } from '../shared/useScrollTopButton'

interface ClusterGroup {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  latest_prompt_id: number | null
  latest_piece_at: number | null
  similar_count: number
  is_generated: boolean
  world_version_id: number | null
  version_number: number | null
  version_name: string | null
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

const SORT_VALUES = ['latest', 'most_pieces', 'most_variations', 'oldest'] as const

type SortKey = typeof SORT_VALUES[number]

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

export default function WorldPrompts() {
  const language = useLanguageId()
  const t = useUiText()
  const tasteEnabled = useTasteProfileEnabled()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const {
    stateRef: restoreStateRef,
    scheduledRef: restoreScheduledRef,
    clear: clearWorldReturnState,
    save: saveWorldReturnState,
  } = useScrollReturn(id ? `world-return:${id}` : null, parseWorldReturnState)
  const { showScrollTop, scrollToTop } = useScrollTopButton()
  const [searchParams, setSearchParams] = useSearchParams()
  const sortParam = searchParams.get('sort')
  const sort: SortKey = SORT_VALUES.some(value => value === sortParam)
    ? sortParam as SortKey
    : 'latest'
  const queryParam = (searchParams.get('q') ?? '').trim()
  const [searchInput, setSearchInput] = useState(queryParam)
  const isSearching = queryParam.length > 0
  // Default the list to the checked-out version; `?v=all` shows every version's prompts.
  const allVersions = searchParams.get('v') === 'all'

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

  // Only offer the version filter once a world has more than one version to scope between.
  const versionsQuery = useQuery({
    queryKey: ['world-versions', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/versions`) as Promise<Array<{ id: number }>>,
    enabled: !!id,
  })
  const canScopeVersion = (versionsQuery.data?.length ?? 0) > 1
  const versionParam = allVersions ? '&allVersions=1' : ''

  const clustersQuery = useInfiniteQuery({
    queryKey: ['world-clusters', id, sort, allVersions ? 'all' : 'current'],
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/worlds/${id}/clusters?page=${pageParam}&limit=${PAGE_SIZE}&sort=${sort}${versionParam}`) as Promise<PromptResponse>,
    enabled: !!id && !isSearching,
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.hasMore ? lastPage.page + 1 : undefined,
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = clustersQuery

  const searchQuery = useQuery({
    queryKey: ['world-clusters-search', id, queryParam, allVersions ? 'all' : 'current'],
    queryFn: () => apiFetch(`/api/worlds/${id}/clusters/search?q=${encodeURIComponent(queryParam)}${versionParam}`) as Promise<SearchResponse>,
    enabled: !!id && isSearching,
  })

  const errored = worldQuery.isError || (isSearching ? searchQuery.isError : clustersQuery.isError)
  useEffect(() => {
    if (errored) navigate('/')
  }, [errored, navigate])

  function handleSortChange(next: SortKey) {
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

  function handleVersionScopeChange(nextAllVersions: boolean) {
    if (nextAllVersions === allVersions) return
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (nextAllVersions) params.set('v', 'all')
      else params.delete('v')
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

  const sortOptions = useMemo(() => [
    { value: 'latest', label: t.latest },
    { value: 'most_pieces', label: t.mostEntities(entityLabel('piece', { plural: true }, language)) },
    { value: 'most_variations', label: t.mostPromptVariations(entityLabel('prompt', {}, language)) },
    { value: 'oldest', label: t.oldest },
  ] as const, [language, t])

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

  const firstPage = pages[0]
  const totalClusters = firstPage?.total ?? 0
  const searchTotal = searchQuery.data?.items.length ?? 0
  const worldTabs = useMemo(
    () => (
      <WorldTabs
        active="prompts"
        worldId={id}
        promptCount={clustersQuery.data ? totalClusters : undefined}
      />
    ),
    [clustersQuery.data, id, totalClusters],
  )
  useTopNavConfig({ backHref: '/worlds', bottomSlot: worldTabs })

  if (!worldQuery.data || (isSearching ? false : !clustersQuery.data)) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="page-width min-h-screen px-6 pb-32 pt-0">
          <Skeleton className="mt-6 h-11 w-48" />
          <div className="sticky top-23 z-10 -mx-6 mt-6 border-y border-rose-line/70 bg-paper/90 px-6 backdrop-blur">
            <div className="flex items-center gap-3 py-3">
              <Skeleton className="h-11 min-w-0 flex-1 rounded-full" />
              <Skeleton className="h-11 w-28 shrink-0 rounded-full" />
              <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            </div>
          </div>
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
      <div className="page-width min-h-screen px-6 pb-32 pt-0">
        <div className="sticky top-23 z-10 -mx-6 border-b border-rose-line/70 bg-paper/90 px-6 backdrop-blur">
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <TextField
                type="text"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder={t.searchEntities(entityLabel('prompt', { plural: true }, language))}
                aria-label={t.searchEntities(entityLabel('prompt', { plural: true }, language))}
                variant="search"
                leadingAdornment={<Search aria-hidden="true" className="h-4 w-4 text-ink-4" />}
                trailingAdornment={searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="grid h-6 w-6 place-items-center rounded-full text-ink-4 hover:text-ink-2 focus:outline-none focus:ring-2 focus:ring-rose/30"
                    aria-label={t.clearSearch}
                    title={t.clearSearch}
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              />
            </div>
            <Link
              to={`/worlds/${id}/ideas`}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-rose-line/80 bg-paper/60 pl-3 pr-4 font-serif-zh text-[14px] italic leading-none text-ink-2 shadow-[inset_0_0_24px_rgba(205,83,106,0.03)] transition-transform duration-200 active:translate-y-px active:bg-rose-tint/45"
              aria-label={t.sparkTitle}
              title={t.sparkTitle}
            >
              <Lightbulb aria-hidden="true" className="h-4 w-4 text-rose" />
              <span>{t.sparkTitle}</span>
            </Link>
            {canScopeVersion && (
              <button
                type="button"
                onClick={() => handleVersionScopeChange(!allVersions)}
                aria-pressed={allVersions}
                aria-label={allVersions ? t.allVersions : t.thisVersion}
                title={allVersions ? t.allVersions : t.thisVersion}
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-[border-color,background-color,color,transform] duration-200 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 ${allVersions
                  ? 'border-rose/40 bg-rose-pale text-rose-deep'
                  : 'border-rose-line/80 bg-paper/60 text-ink-4 active:bg-rose-tint/45'
                  }`}
              >
                <Layers aria-hidden="true" className="h-4.5 w-4.5" />
              </button>
            )}
            <WorldSortMenu options={sortOptions} value={sort} onChange={handleSortChange} />
          </div>
        </div>

        {(loadingSearch || isSearching) && (
          <div className="mt-5 flex items-baseline justify-between gap-4">
            <div className="t-eyebrow">
              {loadingSearch ? (
                <Skeleton className="h-3 w-24" />
              ) : (
                <>
                  <span className="text-rose">{searchTotal}</span>{' '}
                  {t.matchCount(searchTotal).replace(String(searchTotal), '').trim()}
                </>
              )}
            </div>
          </div>
        )}

        <Link
          to={`/worlds/${id}/prompt/new`}
          className="fixed bottom-[calc(1.75rem+env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-11 w-auto items-center justify-center gap-1.5 rounded-full bg-rose pl-2 pr-4 font-serif-zh text-[14px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 sm:right-7"
          aria-label={t.newEntity(entityLabel('prompt', { capitalize: true }, language))}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full">
            <Plus aria-hidden="true" className="h-5 w-5 stroke-[1.8]" />
          </span>
          <span>{t.newEntity(entityLabel('prompt', { capitalize: true }, language))}</span>
        </Link>

        {!isSearching && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-rose-line/80 bg-paper/60 px-4 py-4">
            <Link
              to={`/worlds/${id}/taste`}
              className="flex min-w-0 flex-1 items-center gap-3 transition-colors active:opacity-70"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-pale text-rose-deep">
                <Heart aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-serif-zh text-[15px] italic text-ink">{t.tasteTitle}</span>
                <span className="t-meta mt-0.5 block text-ink-3">{t.tasteAboutHint}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3" />
            </Link>
            {/* Turn the profile on/off right here — same segmented control as the taste detail page,
                so you don't have to open it just to flip generation on or off. */}
            <div className="grid w-24 shrink-0 grid-cols-2 overflow-hidden rounded-full border border-rose-line p-0.5" aria-label={t.tasteUseProfile}>
              {[true, false].map(value => {
                const selected = tasteEnabled === value
                return (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTasteProfileEnabled(value)}
                    className={`grid h-7 place-items-center rounded-full font-serif-zh text-[12px] italic leading-none transition-colors ${selected ? 'bg-rose-pale text-rose-deep' : 'text-ink-3 active:text-ink'}`}
                  >
                    {value ? t.tasteOn : t.tasteOff}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {loadingSearch ? (
          <ClusterCardSkeletons count={3} />
        ) : groups.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="t-meta mb-5">
              {isSearching
                ? t.noMatches
                : t.noEntitiesYet(entityLabel('prompt', { plural: true }, language))}
            </p>
          </div>
        ) : (
          <>
            <ul className="hairline-list mt-2 flex flex-col [&>li:first-child>a]:pt-5">
              {groups.map((group, index) => {
                const hasPieces = group.piece_count > 0
                const hasVariations = group.prompt_count > 1
                const hasStats = hasPieces || hasVariations || group.similar_count > 0

                return (
                  <li
                    key={group.id}
                    data-cluster-id={group.id}
                    className="list-item-reveal"
                    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                  >
                    <Link
                      to={
                        group.latest_prompt_id
                          ? `/worlds/${id}/prompt/${group.latest_prompt_id}`
                          : `/worlds/${id}/prompt/new`
                      }
                      state={{ fromWorldList: true }}
                      onClick={event => saveClusterReturnState(group.id, event)}
                      className="block py-7 transition-transform duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <RelativeTimeStatus
                          className=""
                          timestamp={group.latest_piece_at}
                          emptyLabel={t.noEntitiesYet(entityLabel('piece', { plural: true }, language))}
                        />
                        <div className="flex shrink-0 items-center gap-2">
                          {/* Which world version this cluster belongs to — only worth showing while
                              browsing across versions; redundant when scoped to one. */}
                          {allVersions && (group.version_name?.trim() || group.version_number != null) && (
                            <span className="inline-flex max-w-[8rem] items-center gap-1 rounded-full bg-paper-3 px-2 py-0.5 text-[11px] leading-none text-ink-3">
                              <History aria-hidden="true" className="h-3 w-3 shrink-0" />
                              <span className="truncate">{group.version_name?.trim() || `v${group.version_number}`}</span>
                            </span>
                          )}
                          {group.is_generated && (
                            <span className="rounded-full bg-paper-3 px-2 py-0.5 text-[11px] leading-none text-ink-3">
                              {t.autoGeneratedPrompt}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="font-serif-zh text-[16px] leading-7 text-ink-2 line-clamp-4">
                        {group.title}
                      </p>
                      {hasStats && (
                        <div className="t-meta mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                          {hasPieces && <CountIndicator count={group.piece_count} />}
                          {hasVariations && (
                            <div className="flex items-center gap-1.5">
                              <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
                              <span>{t.versionCount(group.prompt_count)}</span>
                            </div>
                          )}
                          {group.similar_count > 0 && (
                            <div
                              className="flex items-center gap-1.5"
                              title={t.similarCount(group.similar_count)}
                            >
                              <Lightbulb aria-hidden="true" className="h-3.5 w-3.5" />
                              <span>{group.similar_count}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {!isSearching && (
              <>
                <div
                  ref={loadMoreRef}
                  className={isFetchingNextPage ? 'mt-7 min-h-8 text-center text-sm text-ink-4' : 'h-px'}
                >
                  {isFetchingNextPage && (
                    <div className="-mt-8">
                      <ClusterCardSkeletons count={1} />
                    </div>
                  )}
                </div>
                {!hasNextPage && groups.length > 0 && (
                  <ListEndMarker label={t.endOfEntities(entityLabel('prompt', { plural: true }, language))} />
                )}
              </>
            )}
            {isSearching && groups.length > 0 && (
              <ListEndMarker label={t.endOfMatches} />
            )}
          </>
        )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-7 left-1/2 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-x-1/2 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20"
          aria-label={t.scrollToTop}
          title={t.scrollToTop}
        >
          <ArrowUp aria-hidden="true" className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
