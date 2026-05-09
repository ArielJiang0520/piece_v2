import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowUpDown, Check, Plus, Search, Sparkles, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import CountIndicator from '@/components/CountIndicator'
import ListEndMarker from '@/components/ListEndMarker'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import TextField from '@/components/TextField'
import { useTopNavConfig } from '@/components/topNavConfig'
import { dismissSampleWorldTip, useSampleWorldTipDismissed } from '@/preferences/sampleWorldTip'

interface World {
  id: number
  name: string
  body_summary: string
  is_example: boolean
  updated_at: number
  latest_piece_at: number | null
  prompt_cluster_count: number
  piece_count: number
}

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most_prompts', label: `Most ${entityLabel('prompt', { plural: true })}` },
  { value: 'most_pieces', label: `Most ${entityLabel('piece', { plural: true })}` },
] as const

type SortKey = typeof SORT_OPTIONS[number]['value']

function worldActivityTimestamp(world: World) {
  return Math.max(world.latest_piece_at ?? 0, world.updated_at)
}

export default function WorldList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const sampleWorldTipDismissed = useSampleWorldTipDismissed()
  const [showScrollTop, setShowScrollTop] = useState(false)
  const sortParam = searchParams.get('sort')
  const sort: SortKey = SORT_OPTIONS.some(option => option.value === sortParam)
    ? sortParam as SortKey
    : 'latest'
  const [sortOpen, setSortOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
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
      const aActivity = worldActivityTimestamp(a)
      const bActivity = worldActivityTimestamp(b)

      if (sort === 'oldest') return aActivity - bActivity || a.id - b.id
      if (sort === 'most_prompts') return b.prompt_cluster_count - a.prompt_cluster_count || bActivity - aActivity || b.id - a.id
      if (sort === 'most_pieces') return b.piece_count - a.piece_count || bActivity - aActivity || b.id - a.id
      return bActivity - aActivity || b.id - a.id
    })
  }, [queryParam, sort, worlds])
  const worldListNavSlot = useMemo(() => (
    <div className="page-width border-b border-rose-line/80">
      <div className="px-6 pb-3 pt-1">
        {worldsQuery.isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="t-eyebrow min-w-0">
              <span className="truncate">{worlds.length} {entityLabel('world', { plural: true, capitalize: true })}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/worlds/new')}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-line bg-paper px-3 font-serif-zh text-[14px] italic leading-none text-rose transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
              aria-label={`New ${entityLabel('world', { capitalize: true })}`}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5 stroke-[1.8]" />
              New {entityLabel('world', { capitalize: true })}
            </button>
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
                placeholder={`Search ${entityLabel('world', { plural: true })}...`}
                aria-label={`Search ${entityLabel('world', { plural: true })}`}
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
            <div ref={sortMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setSortOpen(open => !open)}
                className="grid h-12 w-12 place-items-center rounded-full border border-rose-line/80 bg-paper/60 text-ink-3 shadow-[inset_0_0_24px_rgba(205,83,106,0.03)] transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                aria-label={`Sort by ${SORT_OPTIONS.find(option => option.value === sort)?.label}`}
                title={`Sort by ${SORT_OPTIONS.find(option => option.value === sort)?.label}`}
                aria-haspopup="menu"
                aria-expanded={sortOpen}
              >
                <ArrowUpDown aria-hidden="true" className="h-4.5 w-4.5" />
              </button>
              {sortOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
                >
                  {SORT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sort === option.value}
                      onClick={() => handleSortChange(option.value)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left font-serif-zh text-sm italic text-ink-2 transition-colors hover:bg-rose-tint/50 hover:text-ink focus:outline-none focus:bg-rose-tint"
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
          </div>
        </div>
      )}
    </div>
  ), [navigate, searchInput, sort, sortOpen, worlds.length, worldsQuery.isLoading])
  useTopNavConfig({ bottomSlot: worldListNavSlot })

  useEffect(() => {
    const updateScrollTopVisibility = () => {
      setShowScrollTop(window.scrollY > 0)
    }

    updateScrollTopVisibility()
    window.addEventListener('scroll', updateScrollTopVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollTopVisibility)
  }, [])

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
    window.scrollTo({ top: 0 })
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="page-fade-in min-h-screen page-width">
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="px-6 pt-5">
          {showSampleWorldTip && (
            <div className="flex gap-3 rounded-md border border-rose-line bg-rose-pale/35 px-4 py-3 shadow-(--shadow-feather)">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-rose-deep">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="font-serif-zh text-[15px] italic leading-snug text-ink">
                  Sample {entityLabel('world', { plural: true, capitalize: true })}
                </p>
                <p className="mt-1 font-serif-zh text-[14px] leading-6 text-ink-2">
                  Some samples are included so you can explore the app. Feel free to delete them or create your own {entityLabel('world', { plural: true })}!
                </p>
              </div>
              <button
                type="button"
                onClick={dismissSampleWorldTip}
                className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                aria-label="Hide sample world tip"
                title="Hide tip"
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
              {visibleWorlds.length === 1 ? 'match' : 'matches'}
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
          <p className="t-meta px-6">No {entityLabel('world', { plural: true })} yet. Create one to get started.</p>
        ) : visibleWorlds.length === 0 ? (
          <p className="t-meta px-6 pt-16 text-center">No matches.</p>
        ) : (
          <>
            <ul className="hairline-list flex flex-col px-6">
              {visibleWorlds.map((w, index) => {
                const timestamp = worldActivityTimestamp(w)
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
                        <RelativeTimeStatus className="min-w-0" timestamp={timestamp} prefix="Updated " />
                        {w.is_example && (
                          <span className="shrink-0 rounded-full bg-rose-pale px-2.5 py-1 font-serif-zh text-xs italic leading-none text-rose-deep">
                            sample {entityLabel('world')}
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
                          count={w.prompt_cluster_count}
                          entity="prompt"
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
              label={isSearching ? 'End of matches' : `End of ${entityLabel('world', { plural: true })}`}
            />
          </>
        )}
      </main>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-7 left-1/2 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-x-1/2 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ArrowUp aria-hidden="true" className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
