import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import CountIndicator from '../../components/CountIndicator'
import RelativeTimeStatus from '../../components/RelativeTimeStatus'
import Skeleton, { SkeletonText } from '../../components/Skeleton'
import { useTopNavConfig } from '../../components/TopNav'

interface World {
  id: number
  name: string
  summary: string
  origin: string
  register_id: number | null
  register_title: string | null
  updated_at: number
  latest_piece_at: number | null
  prompt_cluster_count: number
  piece_count: number
}

export default function WorldList() {
  const navigate = useNavigate()
  useTopNavConfig({ title: `Your ${entityLabel('world', { plural: true, capitalize: true })}` })

  const worldsQuery = useQuery({
    queryKey: ['worlds'],
    queryFn: () => apiFetch('/api/worlds') as Promise<World[]>,
  })
  const worlds = worldsQuery.data ?? []

  return (
    <div className="min-h-screen page-width">
      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 px-6 pb-4 pt-2">
          {worldsQuery.isLoading ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
              {worlds.length} {entityLabel('world', { plural: true, capitalize: true })}
            </div>
          )}
        </div>

        {worldsQuery.isLoading ? (
          <div className="flex flex-col gap-3 px-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="rounded-md border border-paper-3 bg-paper px-5 py-4"
              >
                <Skeleton className="mb-3 h-3 w-24" />
                <Skeleton className="h-6 w-2/3" />
                <div className="mt-2 flex items-center gap-1.5">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <SkeletonText className="mt-4" lineClassName="h-3" lines={1} />
              </div>
            ))}
          </div>
        ) : worlds.length === 0 ? (
          <p className="px-6 text-sm text-ink-3">No {entityLabel('world', { plural: true })} yet. Create one to get started.</p>
        ) : (
          <div className="flex flex-col gap-3 px-4">
            {worlds.map(w => {
              const timestamp = w.latest_piece_at ?? w.updated_at

              return (
                <button
                  key={w.id}
                  className="relative overflow-hidden rounded-md border border-paper-3 bg-paper px-5 py-4 text-left transition-colors before:absolute before:bottom-6 before:left-0 before:top-6 before:w-0.5 before:rounded-r-sm before:bg-rose before:opacity-0 before:transition-opacity hover:border-ink-4 hover:bg-paper-2 hover:before:opacity-100"
                  onClick={() => navigate(`/worlds/${w.id}`)}
                >
                  <RelativeTimeStatus timestamp={timestamp} prefix="Updated " />
                  <div className="font-serif-zh text-[21px] font-normal leading-snug text-ink">{w.name}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {w.origin && (
                      <span className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                        {w.origin}
                      </span>
                    )}
                    {w.register_title && (
                      <span className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                        {w.register_title}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 text-xs text-ink-4">
                    <CountIndicator
                      count={w.prompt_cluster_count}
                      entity="prompt"
                      maxDots={20}
                      unitsPerDot={25}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={() => navigate('/worlds/new')}
        className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] inline-flex items-center gap-2 rounded-full border border-rose bg-rose px-5 py-3 text-base font-medium text-white shadow-[0_16px_34px_rgba(205,83,106,0.34)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.42)] focus:outline-none focus:ring-4 focus:ring-rose/25"
        aria-label={`New ${entityLabel('world', { capitalize: true })}`}
      >
        <Plus aria-hidden="true" className="h-5 w-5" />
        New {entityLabel('world', { capitalize: true })}
      </button>
    </div>
  )
}
