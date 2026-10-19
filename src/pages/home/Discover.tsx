import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Search, SearchX, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import ListEndMarker from '@/components/ListEndMarker'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TagPills from '@/components/TagPills'
import TextField from '@/components/TextField'
import { useTopNavConfig } from '@/components/topNavConfig'
import { normalizePairings, PAIRINGS, type Pairing } from '@/pairings'
import { useLanguageId } from '@/preferences/language'
import WorldSortMenu from '../worlds/shared/WorldSortMenu'
import { useScrollTopButton } from '../worlds/shared/useScrollTopButton'
import type { TagCount, WorldCard } from '../worlds/shared/worldTypes'
import WorldCardItem from './WorldCardItem'

interface FeedPage {
  worlds: WorldCard[]
  page: number
  hasMore: boolean
}

const SORT_VALUES = ['popular', 'new'] as const
type SortKey = typeof SORT_VALUES[number]

// The front page: every published world written in the UI language (detected, never chosen by the
// author; worlds in a language the UI lacks show nowhere here), searchable, filtered first by
// pairing (any of the selected) and then by tag (every selected). Search, sort and both selections
// live in the URL so back returns to the same view.
export default function Discover() {
  const t = useUiText()
  const language = useLanguageId()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showScrollTop, scrollToTop } = useScrollTopButton()
  const sortParam = searchParams.get('sort')
  const sort: SortKey = sortParam === 'new' ? 'new' : 'popular'
  const queryParam = (searchParams.get('q') ?? '').trim()
  const tagsParam = searchParams.get('tags') ?? ''
  const selectedTags = useMemo(() => tagsParam.split(',').filter(Boolean), [tagsParam])
  const selectedPairings = useMemo(() => normalizePairings((searchParams.get('pairings') ?? '').split(',')), [searchParams])
  const pairingsParam = selectedPairings.join(',')
  const [searchInput, setSearchInput] = useState(queryParam)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const feedQuery = useInfiniteQuery({
    queryKey: ['feed', language, queryParam, pairingsParam, tagsParam, sort],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), sort, language })
      if (queryParam) params.set('q', queryParam)
      if (pairingsParam) params.set('pairings', pairingsParam)
      if (tagsParam) params.set('tags', tagsParam)
      return apiFetch(`/api/worlds/feed?${params}`) as Promise<FeedPage>
    },
    initialPageParam: 1,
    getNextPageParam: last => (last.hasMore ? last.page + 1 : undefined),
  })
  const worlds = feedQuery.data?.pages.flatMap(page => page.worlds) ?? []
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQuery

  const tagsQuery = useQuery({
    queryKey: ['tags', '', language],
    queryFn: () => apiFetch(`/api/tags?language=${language}`) as Promise<TagCount[]>,
  })
  const popularTags = (tagsQuery.data ?? []).map(tag => tag.name)

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '400px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useEffect(() => {
    if (searchInput.trim() === queryParam) return
    const timer = setTimeout(() => updateParams(params => {
      const trimmed = searchInput.trim()
      if (trimmed) params.set('q', trimmed)
      else params.delete('q')
    }), 300)
    return () => clearTimeout(timer)
  }, [searchInput, queryParam])

  function updateParams(edit: (params: URLSearchParams) => void) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      edit(params)
      return params
    }, { replace: true })
  }

  function setSelectedTags(next: string[]) {
    updateParams(params => {
      if (next.length > 0) params.set('tags', next.join(','))
      else params.delete('tags')
    })
  }

  function toggleTag(tag: string) {
    setSelectedTags(selectedTags.includes(tag)
      ? selectedTags.filter(existing => existing !== tag)
      : [...selectedTags, tag])
  }

  function togglePairing(pairing: Pairing) {
    const next = PAIRINGS.filter(p => p === pairing ? !selectedPairings.includes(p) : selectedPairings.includes(p))
    updateParams(params => {
      if (next.length > 0) params.set('pairings', next.join(','))
      else params.delete('pairings')
    })
  }

  function handleSortChange(next: SortKey) {
    if (next === sort) return
    updateParams(params => {
      if (next === 'popular') params.delete('sort')
      else params.set('sort', next)
    })
    window.scrollTo({ top: 0 })
  }

  const sortOptions = useMemo(() => [
    { value: 'popular', label: t.popular },
    { value: 'new', label: t.latest },
  ] as const, [t])

  const navSlot = useMemo(() => (
    <div className="border-b border-line bg-surface">
      <div className="page-width flex items-center gap-2 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <TextField
            type="text"
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder={t.searchWorlds}
            aria-label={t.searchWorlds}
            variant="search"
            leadingAdornment={<Search aria-hidden="true" className="h-4.5 w-4.5 text-ink-3" />}
            trailingAdornment={searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="grid h-6 w-6 place-items-center rounded-full bg-ink-4 text-surface active:bg-ink-3"
                aria-label={t.clearSearch}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          />
        </div>
        <WorldSortMenu options={sortOptions} value={sort} onChange={handleSortChange} />
      </div>
    </div>
  ), [language, searchInput, sort, sortOptions, t])
  useTopNavConfig({ bottomSlot: navSlot })

  const filtering = queryParam.length > 0 || selectedPairings.length > 0 || selectedTags.length > 0

  return (
    <div className="page-fade-in page-width">
      <main className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            aria-pressed={selectedPairings.length === 0}
            onClick={() => updateParams(params => params.delete('pairings'))}
            className="chip"
          >
            {t.allTags}
          </button>
          {PAIRINGS.map(pairing => (
            <button
              key={pairing}
              type="button"
              aria-pressed={selectedPairings.includes(pairing)}
              onClick={() => togglePairing(pairing)}
              className="chip"
            >
              {t.pairingLabels[pairing]}
            </button>
          ))}
        </div>
        <div className="pt-2.5">
          <TagPills
            tags={popularTags}
            selected={selectedTags}
            onToggle={toggleTag}
            onClear={() => setSelectedTags([])}
          />
        </div>

        {feedQuery.isLoading ? (
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="card p-4">
                <Skeleton className="h-5 w-2/3" />
                <SkeletonText className="mt-3" lineClassName="h-3" lines={2} />
                <Skeleton className="mt-4 h-3 w-32" />
              </div>
            ))}
          </div>
        ) : worlds.length === 0 ? (
          <div className="card mt-3 flex flex-col items-center px-6 py-12 text-center">
            <SearchX aria-hidden="true" className="h-8 w-8 text-ink-4" />
            <p className="t-body mt-3">
              {filtering ? t.noMatches : t.noWorldsYet}
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-3">
              {worlds.map(world => (
                <WorldCardItem key={world.id} world={world} />
              ))}
            </ul>
            <div ref={loadMoreRef} className="h-px" />
            {isFetchingNextPage && (
              <div className="card mt-3 p-4">
                <Skeleton className="h-5 w-2/3" />
              </div>
            )}
            {!hasNextPage && (
              <ListEndMarker
                label={filtering ? t.endOfMatches : t.endOfWorlds}
              />
            )}
          </>
        )}
      </main>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-4 z-30 grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-ink shadow-(--shadow-float) active:bg-paper-2"
          aria-label={t.scrollToTop}
        >
          <ArrowUp aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
