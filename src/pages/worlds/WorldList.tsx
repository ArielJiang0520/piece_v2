import { useEffect, useState } from 'react'
import { ArrowUp, Plus, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import CountIndicator from '@/components/CountIndicator'
import RelativeTimeStatus from '@/components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
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

export default function WorldList() {
  const navigate = useNavigate()
  const sampleWorldTipDismissed = useSampleWorldTipDismissed()
  const [showScrollTop, setShowScrollTop] = useState(false)
  useTopNavConfig({})

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
  })
  const worlds = worldsQuery.data ?? []
  const showSampleWorldTip = !sampleWorldTipDismissed && worlds.some(world => world.is_example)

  useEffect(() => {
    const updateScrollTopVisibility = () => {
      setShowScrollTop(window.scrollY > 0)
    }

    updateScrollTopVisibility()
    window.addEventListener('scroll', updateScrollTopVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollTopVisibility)
  }, [])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="page-fade-in min-h-screen page-width">
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="px-6 pt-4">
          {!worldsQuery.isLoading && (
            <button
              type="button"
              onClick={() => navigate('/worlds/new')}
              className="mb-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
              aria-label={`New ${entityLabel('world', { capitalize: true })}`}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15">
                <Plus aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
              </span>
              New {entityLabel('world', { capitalize: true })}
            </button>
          )}

          {worldsQuery.isLoading ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <div className="t-eyebrow eyebrow-rule">
              <span>{worlds.length} {entityLabel('world', { plural: true, capitalize: true })}</span>
            </div>
          )}
          {showSampleWorldTip && (
            <div className="mt-5 flex gap-3 rounded-md border border-rose-line bg-rose-pale/35 px-4 py-3 shadow-(--shadow-feather)">
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
        ) : (
          <ul className="hairline-list flex flex-col px-6">
            {worlds.map((w, index) => {
              const timestamp = Math.max(w.latest_piece_at ?? 0, w.updated_at)
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
