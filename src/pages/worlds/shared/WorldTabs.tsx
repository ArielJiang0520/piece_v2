import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { Link } from 'react-router-dom'

export type WorldTab = 'prompts' | 'about'

interface Props {
  active: WorldTab
  worldId: string | number | undefined
  promptCount?: number
}

export default function WorldTabs({ active, worldId, promptCount }: Props) {
  const language = useLanguageId()
  const t = useUiText()
  const tabs: Array<{ id: WorldTab; label: string; path: (worldId: string | number | undefined) => string }> = [
    { id: 'about', label: t.about, path: worldId => `/worlds/${worldId}/about` },
    { id: 'prompts', label: entityLabel('prompt', { capitalize: true, plural: true }, language), path: worldId => `/worlds/${worldId}` },
  ]

  return (
    <nav
      className="page-width border-b border-rose-line/80"
      aria-label={t.yourEntities(entityLabel('world', { plural: true }, language))}
    >
      <div className="grid grid-cols-2 px-6">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <Link
              key={tab.id}
              to={tab.path(worldId)}
              className={`-mb-px inline-flex h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-1 t-eyebrow leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper ${isActive
                ? 'border-rose text-ink!'
                : 'border-transparent text-ink-3! hover:text-ink!'
                }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{tab.label}</span>
              {tab.id === 'prompts' && typeof promptCount === 'number' && (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                  {promptCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
