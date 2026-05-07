import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import CountIndicator from '../../components/CountIndicator'
import RelativeTimeStatus from '../../components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '../../components/Skeleton'
import { useTopNavConfig } from '../../components/topNavConfig'

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
  useTopNavConfig({})

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
  })
  const worlds = worldsQuery.data ?? []

  return (
    <div className="page-fade-in min-h-screen page-width">
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="px-6 pb-6 pt-4">
          {worldsQuery.isLoading ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <div className="t-eyebrow eyebrow-rule">
              <span>{worlds.length} {entityLabel('world', { plural: true, capitalize: true })}</span>
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
                    <RelativeTimeStatus className="mb-4" timestamp={timestamp} prefix="Updated " />

                    <div className="t-headline">
                      {w.name}
                    </div>

                    {bodySummary && (
                      <p className="mt-3 font-serif-zh text-[15px] leading-7 text-ink-2 whitespace-pre-line line-clamp-3">
                        {bodySummary}
                      </p>
                    )}

                    {/* {tags.length > 0 && (
                      <div className="t-meta mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {tags.map((tag, i) => (
                          <span key={tag} className="flex items-center gap-2 capitalize">
                            {i > 0 && <span aria-hidden="true" className="text-ink-4">—</span>}
                            <span>{tag}</span>
                          </span>
                        ))}
                      </div>
                    )} */}

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

      <button
        type="button"
        onClick={() => navigate('/worlds/new')}
        className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] inline-flex items-center gap-3 rounded-full bg-rose py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
        aria-label={`New ${entityLabel('world', { capitalize: true })}`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
          <Plus aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
        </span>
        New {entityLabel('world', { capitalize: true })}
      </button>
    </div>
  )
}
