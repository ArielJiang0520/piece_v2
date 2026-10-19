import { Link, useLocation } from 'react-router-dom'

export interface TabBarItem {
  id: string
  label: string
  to: string
  count?: number
}

interface TabBarProps {
  tabs: TabBarItem[]
  active: string
  label?: string
  // Swap tabs in place rather than stacking history entries. The page's router state (e.g. where
  // it was opened from) carries over, since it's still the same page.
  replace?: boolean
}

// The one tab strip under the top bar: equal-width tabs, the active one in ink with a brand
// underline. Used for a world's About/Scenes, the creator center's World/Scenes, and a profile's Created/Bookmarked.
export default function TabBar({ tabs, active, label, replace = false }: TabBarProps) {
  const location = useLocation()
  return (
    <nav className="border-b border-line bg-surface" aria-label={label}>
      <div className="page-width grid grid-flow-col auto-cols-fr px-2">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <Link
              key={tab.id}
              to={tab.to}
              replace={replace}
              state={replace ? location.state : undefined}
              className={`relative inline-flex h-11 min-w-0 items-center justify-center gap-1.5 px-2 text-[15px] font-semibold transition-colors ${isActive ? 'text-ink' : 'text-ink-3 active:text-ink-2'}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="truncate">{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-paper-2 px-1.5 text-[11px] font-semibold leading-none text-ink-3">
                  {tab.count}
                </span>
              )}
              {isActive && <span aria-hidden="true" className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-rose" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
