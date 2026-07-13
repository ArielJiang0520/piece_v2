import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, History, Loader2, Pencil } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { relativeTime } from '@/utils/time'
import WorldTabs from '../shared/WorldTabs'

const ONE_HOUR_MS = 60 * 60 * 1e3

interface World {
  id: number
  name: string
  body: string
  is_example: boolean
  current_version_id: number | null
  updated_at: number
}

interface WorldVersionListItem {
  id: number
  name: string | null
  created_at: number
}

interface PromptCountResponse {
  total: number
}

interface CachedPromptPages {
  pages?: Array<{ total?: number }>
}

export default function WorldAbout() {
  const language = useLanguageId()
  const t = useUiText()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const versionMenuRef = useRef<HTMLDivElement | null>(null)

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<World>,
    enabled: !!id,
  })

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

  const versionsQuery = useQuery({
    queryKey: ['world-versions', id],
    queryFn: () => apiFetch(`/api/worlds/${id}/versions`) as Promise<WorldVersionListItem[]>,
    enabled: !!id,
  })

  const switchMutation = useMutation({
    mutationFn: (versionId: number) =>
      apiFetch(`/api/worlds/${id}/versions/${versionId}/switch`, { method: 'POST' }),
    onSuccess: () => {
      setVersionMenuOpen(false)
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-versions', id] })
    },
  })

  useEffect(() => {
    if (worldQuery.isError) navigate('/worlds')
  }, [navigate, worldQuery.isError])

  useEffect(() => {
    if (!versionMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (versionMenuRef.current && !versionMenuRef.current.contains(target)) setVersionMenuOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setVersionMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [versionMenuOpen])

  const world = worldQuery.data
  const promptCount = promptCountQuery.data?.total
  const worldTabs = useMemo(
    () => <WorldTabs active="about" worldId={id} promptCount={promptCount} />,
    [id, promptCount],
  )
  useTopNavConfig({ backHref: '/worlds', bottomSlot: worldTabs })

  const versions = versionsQuery.data ?? []
  const versionEntries = versions.map((version, index) => ({
    version,
    number: versions.length - index,
  }))
  const currentVersionId = world?.current_version_id ?? null
  const currentEntry = versionEntries.find(entry => entry.version.id === currentVersionId) ?? versionEntries[0]
  const body = world?.body ?? ''
  const hasBody = body.trim().length > 0
  const switchingId = switchMutation.isPending ? switchMutation.variables : null

  function versionTitle(version: { name: string | null }, number: number) {
    const trimmed = version.name?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : t.versionLabel(number)
  }
  const currentVersionTitle = currentEntry ? versionTitle(currentEntry.version, currentEntry.number) : null
  const versionDropdownLoading = versionsQuery.isLoading && currentVersionTitle === null

  function switchVersion(versionId: number) {
    if (versionId === currentVersionId) {
      setVersionMenuOpen(false)
      return
    }
    if (switchMutation.isPending) return
    switchMutation.mutate(versionId)
  }

  function versionDotClass(timestamp: number) {
    return Date.now() - timestamp < ONE_HOUR_MS ? 'bg-rose' : 'bg-ink-4/50'
  }

  if (!world) {
    return (
      <div className="page-fade-in min-h-screen bg-paper">
        <div className="page-width min-h-screen px-6 pb-32 pt-0">
          <Skeleton className="mt-6 h-11 w-48" />
          <Skeleton className="mt-6 h-11 w-full rounded-full" />
          <div className="mt-8 flex items-center justify-between">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
          </div>
          <SkeletonText className="mt-10" lineClassName="h-4" lines={8} />
        </div>
      </div>
    )
  }

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      <div className="page-width min-h-screen px-6 pb-32 pt-0">
        <div className="sticky top-23 z-10 -mx-6 border-b border-rose-line/70 bg-paper/90 px-6 backdrop-blur">
          <div className="flex items-center justify-between gap-3 py-3">
            <div ref={versionMenuRef} className="relative min-w-0 flex-1">
              <button
                type="button"
                className="group flex h-12 w-full min-w-0 items-center justify-between gap-3 rounded-full border border-rose-line/80 bg-paper/60 py-2 pl-2 pr-3.5 text-left shadow-[inset_0_0_24px_rgba(205,83,106,0.035)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 hover:shadow-(--shadow-feather) focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                onClick={() => setVersionMenuOpen(open => !open)}
                aria-haspopup="menu"
                aria-expanded={versionMenuOpen}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-pale text-rose-deep transition-colors group-hover:bg-paper">
                  <History aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block t-eyebrow truncate leading-none">{t.versionHistory}</span>
                  {versionDropdownLoading ? (
                    <Skeleton className="mt-1.5 h-4 w-20" />
                  ) : (
                    <span className="mt-1 block truncate font-serif-zh text-[15px] italic leading-none text-ink">
                      {currentVersionTitle ?? t.version}
                    </span>
                  )}
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 group-aria-expanded:rotate-180" />
              </button>

              {versionMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-10 mt-2 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
                >
                  {versionsQuery.isLoading ? (
                    <div className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                    </div>
                  ) : versionEntries.length === 0 ? (
                    <div className="t-meta px-4 py-3">{t.noVersionsYet}</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto py-1">
                      {versionEntries.map(({ version, number }) => {
                        const isCurrent = version.id === currentVersionId
                        const isSwitching = switchingId === version.id
                        return (
                          <button
                            key={version.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isCurrent}
                            disabled={switchMutation.isPending}
                            className="group/item flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-rose-tint/50 focus:outline-none focus:bg-rose-tint disabled:cursor-default"
                            onClick={() => switchVersion(version.id)}
                          >
                            <span
                              className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full font-serif-zh text-xs italic transition-colors ${isCurrent
                                ? 'bg-rose text-white shadow-(--shadow-cta)'
                                : 'border border-rose-line bg-paper text-ink-3 group-hover/item:border-rose/40 group-hover/item:text-rose-deep'
                                }`}
                            >
                              v{number}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2 font-serif-zh text-[15px] italic leading-snug text-ink">
                                <span className="truncate">{versionTitle(version, number)}</span>
                                {isCurrent && (
                                  <span className="shrink-0 font-serif-zh text-xs italic text-rose-deep">
                                    {t.current}
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 flex min-w-0 items-center gap-2 font-serif-zh text-xs italic leading-none text-ink-3">
                                <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${versionDotClass(version.created_at)}`} />
                                <span className="truncate">{relativeTime(version.created_at, language)}</span>
                              </span>
                            </span>
                            {isSwitching ? (
                              <Loader2 aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 animate-spin text-rose" />
                            ) : isCurrent ? (
                              <Check aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-rose" />
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Link
              to={`/worlds/${id}/edit`}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-full border border-rose-line/80 bg-paper/60 py-2.5 pl-2.5 pr-5 font-serif-zh text-[15px] italic leading-none text-rose-deep shadow-[inset_0_0_24px_rgba(205,83,106,0.03)] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-pale text-rose-deep">
                <Pencil aria-hidden="true" className="h-4 w-4 stroke-[1.8]" />
              </span>
              <span className="text-ink">{t.edit}</span>
            </Link>
          </div>
        </div>

        <header className="mt-8 border-b border-rose-line/70 pb-6">
          <span className="t-eyebrow eyebrow-rule">{entityLabel('world', { capitalize: true }, language)}</span>
          <h1 className="t-headline mt-4 wrap-break-word">
            {world.name}
          </h1>
        </header>

        <article className="mt-7 whitespace-pre-wrap font-serif-zh text-[17px] leading-8 text-ink-2">
          {hasBody ? body : <p className="t-meta">{t.noBodyYet}</p>}
        </article>

      </div>
    </div>
  )
}
