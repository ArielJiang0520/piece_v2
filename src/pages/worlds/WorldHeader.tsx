import { Sparkles } from 'lucide-react'
import { entityLabel } from '../../config'
import WorldTabs, { type WorldTab } from './WorldTabs'

interface Props {
  active: WorldTab
  isExample: boolean
  name: string
  worldId: string | number | undefined
}

export default function WorldHeader({ active, isExample, name, worldId }: Props) {
  return (
    <header>
      <h1 className="t-display min-w-0">{name}</h1>
      {isExample && (
        <div className="mt-5 flex gap-3 rounded-md border border-rose-line bg-rose-pale/35 px-4 py-3 shadow-(--shadow-feather)">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-rose-deep">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-serif-zh text-[15px] italic leading-snug text-ink">
              Sample {entityLabel('world')}
            </p>
            <p className="mt-1 font-serif-zh text-[14px] leading-6 text-ink-2">
              You're viewing a sample {entityLabel('world')}. Feel free to explore it, then delete it when you're done.
            </p>
          </div>
        </div>
      )}
      <WorldTabs active={active} worldId={worldId} />
    </header>
  )
}
