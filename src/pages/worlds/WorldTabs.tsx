import { entityLabel } from '@/config'
import { Link } from 'react-router-dom'

export type WorldTab = 'prompts' | 'about'

interface Props {
  active: WorldTab
  worldId: string | number | undefined
}

const tabs: Array<{ id: WorldTab; label: string; path: (worldId: string | number | undefined) => string }> = [
  { id: 'about', label: 'About', path: worldId => `/worlds/${worldId}/about` },
  { id: 'prompts', label: entityLabel('prompt', { capitalize: true, plural: true }), path: worldId => `/worlds/${worldId}` },
]

export default function WorldTabs({ active, worldId }: Props) {
  return (
    <nav
      className="-mx-6 mt-6 border-b border-rose-line/80"
      aria-label="World sections"
    >
      <div className="flex px-6">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <Link
              key={tab.id}
              to={tab.path(worldId)}
              className={`-mb-px inline-flex h-11 items-center border-b-2 px-1 font-serif-zh text-[15px] italic leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper ${isActive
                ? 'border-rose text-ink'
                : 'border-transparent text-ink-3 hover:text-ink'
                } ${tab.id === 'prompts' ? 'ml-7' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
