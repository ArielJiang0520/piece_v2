import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, Plus, Search, Sparkles, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel, formatEntityCount } from '@/config'
import { useUiText } from '@/i18n'
import { useAuth } from '@/auth'
import CountIndicator from '@/components/CountIndicator'
import ListEndMarker from '@/components/ListEndMarker'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TextField from '@/components/TextField'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import { dismissSampleWorldTip, useSampleWorldTipDismissed } from '@/preferences/sampleWorldTip'
import WorldSortMenu from '../shared/WorldSortMenu'
import { useScrollTopButton } from '../shared/useScrollTopButton'

interface World {
  id: number
  name: string
  body_summary: string
  is_example: boolean
  updated_at: number
  piece_count: number
}

const SORT_VALUES = ['latest', 'oldest', 'most_pieces'] as const

type SortKey = typeof SORT_VALUES[number]

export default function WorldList() {
  const language = useLanguageId()
  const t = useUiText()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const sampleWorldTipDismissed = useSampleWorldTipDismissed(user?.id)
  const { showScrollTop, scrollToTop } = useScrollTopButton()
  const sortParam = searchParams.get('sort')
  const sort: SortKey = SORT_VALUES.some(value => value === sortParam)
    ? sortParam as SortKey
    : 'latest'
  const queryParam = (searchParams.get('q') ?? '').trim()
  const [searchInput, setSearchInput] = useState(queryParam)
  const isSearching = queryParam.length > 0

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
  })
  const worlds = worldsQuery.data ?? []
  const showSampleWorldTip = !sampleWorldTipDismissed && worlds.some(world => world.is_example)
  const visibleWorlds = useMemo(() => {
    const query = queryParam.toLowerCase()
    const filtered = query
      ? worlds.filter(world => (
        world.name.toLowerCase().includes(query) ||
        (world.body_summary ?? '').toLowerCase().includes(query)
      ))
      : worlds

    return [...filtered].sort((a, b) => {
      const aActivity = a.updated_at
      const bActivity = b.updated_at

      if (sort === 'oldest') return aActivity - bActivity || a.id - b.id
      if (sort === 'most_pieces') return b.piece_count - a.piece_count || bActivity - aActivity || b.id - a.id
      return bActivity - aActivity || b.id - a.id
    })
  }, [queryParam, sort, worlds])
  const sortOptions = useMemo(() => [
    { value: 'latest', label: t.latest },
    { value: 'oldest', label: t.oldest },
    { value: 'most_pieces', label: t.mostEntities(entityLabel('piece', { plural: true }, language)) },
  ] as const, [language, t])
  const worldListNavSlot = useMemo(() => (
    <div className="page-width border-b border-rose-line/80">
      <div className="px-6 pb-3 pt-1">
        {worldsQuery.isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <div className="flex items-center gap-4">
            <div className="t-eyebrow min-w-0">
              <span className="truncate">{formatEntityCount(worlds.length, 'world', language)}</span>
            </div>
          </div>
        )}
      </div>

      {!worldsQuery.isLoading && worlds.length > 0 && (
        <div className="border-t border-rose-line/70 px-6">
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <TextField
                type="text"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder={t.searchEntities(entityLabel('world', { plural: true }, language))}
                aria-label={t.searchEntities(entityLabel('world', { plural: true }, language))}
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
            <WorldSortMenu options={sortOptions} value={sort} onChange={handleSortChange} />
          </div>
        </div>
      )}
    </div>
  ), [language, searchInput, sort, sortOptions, t, worlds.length, worldsQuery.isLoading])
  useTopNavConfig({ bottomSlot: worldListNavSlot })

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

  function handleSortChange(next: SortKey) {
    if (next === sort) return
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (next === 'latest') params.delete('sort')
      else params.set('sort', next)
      return params
    }, { replace: true })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="page-fade-in page-width">
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="px-6 pt-5">
          {showSampleWorldTip && (
            <div className="flex gap-3 rounded-md border border-rose-line bg-rose-pale/35 px-4 py-3 shadow-(--shadow-feather)">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-rose-deep">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                {/* <p className="font-serif-zh text-[15px] italic leading-snug text-ink">
                  Sample {entityLabel('world', { plural: true, capitalize: true })}
                </p> */}
                <p className="mt-1 font-serif-zh text-[14px] leading-6 text-ink-2">
                  {t.sampleWorldTip}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissSampleWorldTip(user?.id)}
                className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                aria-label={t.hideSampleWorldTip}
                title={t.hideTip}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {isSearching && !worldsQuery.isLoading && worlds.length > 0 && (
          <div className="mt-5 flex items-baseline justify-between gap-4 px-6">
            <div className="t-eyebrow">
              <span className="text-rose">{visibleWorlds.length}</span>{' '}
              {t.matchCount(visibleWorlds.length).replace(String(visibleWorlds.length), '').trim()}
            </div>
          </div>
        )}

        {worldsQuery.isLoading ? (
          <div className="hairline-list flex flex-col px-6">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="py-7">
                <Skeleton className="mb-4 h-3 w-32" />
                <Skeleton className="h-7 w-2/3" />
                <SkeletonText className="mt-3" lineClassName="h-3" lines={1} />
              </div>
            ))}
          </div>
        ) : worlds.length === 0 ? (
          <p className="t-meta px-6">{t.noEntitiesYetCreate(entityLabel('world', { plural: true }, language))}</p>
        ) : visibleWorlds.length === 0 ? (
          <p className="t-meta px-6 pt-16 text-center">{t.noMatches}</p>
        ) : (
          <>
            <ul className="hairline-list flex flex-col px-6">
              {visibleWorlds.map((w, index) => {
                const timestamp = w.updated_at
                const bodySummary = (w.body_summary ?? '').trim()

                return (
                  <li
                    key={w.id}
                    className="list-item-reveal"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <button
                      className="group block w-full py-7 text-left transition-transform duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
                      onClick={() => navigate(`/worlds/${w.id}`)}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <RelativeTimeStatus className="min-w-0" timestamp={timestamp} prefix={t.updatedPrefix} />
                        {w.is_example && (
                          <span className="shrink-0 rounded-full bg-rose-pale px-2.5 py-1 font-serif-zh text-xs italic leading-none text-rose-deep">
                            {t.sampleEntity(entityLabel('world', {}, language))}
                          </span>
                        )}
                      </div>

                      <div className="t-headline">
                        {w.name}
                      </div>

                      {bodySummary && (
                        <p className="mt-3 font-serif-zh text-[15px] leading-7 text-ink-2 whitespace-pre-line line-clamp-3">
                          {bodySummary}
                        </p>
                      )}

                      <div className="mt-5 transition-opacity duration-200 group-hover:opacity-90">
                        <CountIndicator
                          count={w.piece_count}
                          entity="piece"
                          maxDots={20}
                          unitsPerDot={25}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
            <ListEndMarker
              className="mx-6"
              label={isSearching ? t.endOfMatches : t.endOfEntities(entityLabel('world', { plural: true }, language))}
            />
          </>
        )}
      </main>

      <button
        type="button"
        onClick={() => navigate('/worlds/new')}
        className="fixed bottom-[calc(1.75rem+env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-11 w-auto items-center justify-center gap-1.5 rounded-full bg-rose pl-2 pr-4 font-serif-zh text-[14px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 sm:right-7"
        aria-label={t.newEntity(entityLabel('world', { capitalize: true }, language))}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full">
          <Plus aria-hidden="true" className="h-5 w-5 stroke-[1.8]" />
        </span>
        <span>{t.newEntity(entityLabel('world', { capitalize: true }, language))}</span>
      </button>

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
