import { useMemo } from 'react'
import { PenLine, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useLanguageId } from '@/preferences/language'
import WorldCardItem from '../home/WorldCardItem'
import type { WorldCard } from '../worlds/shared/worldTypes'

// The creator center's front door, /creator center, reached only from the menu: the creator's own worlds in any
// state. A world opens its creator center; New world opens an empty one, created once something is typed.
// Nothing on the reading side links here, and nothing here links out to the reading side.
export default function CreatorCenterHome() {
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const worldsQuery = useQuery({
    queryKey: ['creator-worlds'],
    queryFn: () => apiFetch('/api/worlds/mine') as Promise<{ worlds: WorldCard[] }>,
  })
  const worlds = worldsQuery.data?.worlds ?? []

  useTopNavConfig({ mainTitle: t.creatorCenter })

  const newWorldLabel = useMemo(
    () => t.newWorld,
    [language, t],
  )

  return (
    <div className="page-fade-in page-width">
      <main className="px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5">
        {worldsQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            <div className="card p-4"><Skeleton className="h-5 w-2/3" /></div>
            <div className="card p-4"><Skeleton className="h-5 w-1/2" /></div>
          </div>
        ) : worlds.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <PenLine aria-hidden="true" className="h-8 w-8 text-ink-4" />
            <p className="t-body mt-3">{t.noWorldsYet}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {worlds.map(world => (
              <WorldCardItem key={world.id} world={world} showPublishState />
            ))}
          </ul>
        )}
      </main>

      {/* Bottom-left: the app is held one-handed with the left thumb. */}
      <button
        type="button"
        onClick={() => navigate('/worlds/new/edit')}
        className="fab"
      >
        <Plus aria-hidden="true" />
        <span>{newWorldLabel}</span>
      </button>
    </div>
  )
}
