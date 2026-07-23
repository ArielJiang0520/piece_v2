import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

export type WorldTab = 'prompts' | 'about'

interface Props {
  active: WorldTab
  worldId: string | number | undefined
}

interface PromptCountResponse {
  total: number
}

interface CachedPromptPages {
  pages?: Array<{ total?: number }>
}

export default function WorldTabs({ active, worldId }: Props) {
  const language = useLanguageId()
  const t = useUiText()
  const queryClient = useQueryClient()
  const id = worldId === undefined ? undefined : String(worldId)

  // The tabs own the count rather than taking it from whichever page happens to have a prompt
  // list handy — otherwise it blinks out on About and Discover, and the row's width jumps as the
  // reader moves between tabs. The cached prompt list still answers instantly when it's there.
  const promptCountQuery = useQuery({
    queryKey: ['world-clusters-count', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/clusters?page=1&limit=1`) as Promise<PromptCountResponse>,
    enabled: !!id,
    placeholderData: () => {
      const cachedEntries = queryClient.getQueriesData<CachedPromptPages>({ queryKey: ['world-clusters', id] })
      for (const [, data] of cachedEntries) {
        const total = data?.pages?.[0]?.total
        if (typeof total === 'number') return { total }
      }
      return undefined
    },
  })
  const promptCount = promptCountQuery.data?.total

  const tabs: Array<{ id: WorldTab; label: string; path: (worldId: string | number | undefined) => string }> = [
    { id: 'about', label: t.about, path: worldId => `/worlds/${worldId}/about` },
    { id: 'prompts', label: entityLabel('prompt', { capitalize: true, plural: true }, language), path: worldId => `/worlds/${worldId}` },
  ]

  return (
    <nav
      className="page-width border-b border-rose-line/80"
      aria-label={t.yourEntities(entityLabel('world', { plural: true }, language))}
    >
      <div className="flex items-stretch px-6">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <Link
              key={tab.id}
              to={tab.path(worldId)}
              className={`-mb-px inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 border-b-2 t-eyebrow leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper ${isActive
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
