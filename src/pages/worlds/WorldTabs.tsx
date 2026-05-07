import { Link } from 'react-router-dom'

export type WorldTab = 'scenes' | 'about'

interface Props {
  active: WorldTab
  worldId: string | number | undefined
}

const tabs: Array<{ id: WorldTab; label: string; path: (worldId: string | number | undefined) => string }> = [
  { id: 'about', label: 'About', path: worldId => `/worlds/${worldId}/about` },
  { id: 'scenes', label: 'Scenes', path: worldId => `/worlds/${worldId}` },
]

export default function WorldTabs({ active, worldId }: Props) {
  return (
    <nav className="mt-6 flex rounded-full border border-rose-line p-1" aria-label="World sections">
      {tabs.map(tab => {
        const isActive = active === tab.id
        return (
          <Link
            key={tab.id}
            to={tab.path(worldId)}
            className={`flex-1 rounded-full px-4 py-2 text-center font-serif-zh text-[15px] italic leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 ${isActive
                ? 'bg-rose text-white shadow-(--shadow-feather)'
                : 'text-ink-3 hover:text-ink'
              }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
