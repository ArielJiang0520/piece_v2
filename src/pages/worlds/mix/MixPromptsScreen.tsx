import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import {
  EMPTY_MIX_STATE,
  getMixPromptsState,
  setMixPromptsState,
  useMixPromptsState,
} from '@/preferences/mixPromptsState'

interface ClusterGroup {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  latest_prompt_id: number | null
  latest_piece_at: number | null
}

interface ClustersResponse {
  items: ClusterGroup[]
  page: number
  limit: number
  hasMore: boolean
}

const PAGE_SIZE = 50

const actionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 active:text-ink focus:outline-none disabled:pointer-events-none disabled:opacity-50'

export default function MixPromptsScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const worldId = Number(id)

  const entityPlural = entityLabel('prompt', { plural: true }, language)
  const entitySingular = entityLabel('prompt', {}, language)

  useTopNavConfig({ backHref: id ? `/worlds/${id}` : '/worlds' })

  // The persisted store may hold another world's leftovers; treat those as empty here.
  const persisted = useMixPromptsState()
  const state = persisted.worldId === worldId ? persisted : EMPTY_MIX_STATE
  const { selectedPromptIds, candidates } = state

  const [stage, setStage] = useState<'select' | 'candidates'>(() => {
    const initial = getMixPromptsState()
    return initial.worldId === worldId && initial.candidates.length > 0 ? 'candidates' : 'select'
  })
  const [isMixing, setIsMixing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clustersQuery = useInfiniteQuery({
    queryKey: ['world-clusters-mix', id],
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/worlds/${id}/clusters?page=${pageParam}&limit=${PAGE_SIZE}&sort=latest`) as Promise<ClustersResponse>,
    enabled: !!id,
    initialPageParam: 1,
    getNextPageParam: lastPage => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  })
  const groups = clustersQuery.data?.pages.flatMap(page => page.items) ?? []

  function persist(next: { selectedPromptIds?: number[]; candidates?: string[] }) {
    setMixPromptsState({
      worldId,
      selectedPromptIds: next.selectedPromptIds ?? selectedPromptIds,
      candidates: next.candidates ?? candidates,
    })
  }

  function clearSelection() {
    persist({ selectedPromptIds: [] })
  }

  function toggle(promptId: number) {
    const next = selectedPromptIds.includes(promptId)
      ? selectedPromptIds.filter(value => value !== promptId)
      : [...selectedPromptIds, promptId]
    persist({ selectedPromptIds: next })
  }

  async function runMix() {
    if (selectedPromptIds.length < 1 || isMixing) return
    setError(null)
    setIsMixing(true)
    try {
      const res = (await apiFetch(`/api/worlds/${id}/mix`, {
        method: 'POST',
        body: JSON.stringify({ promptIds: selectedPromptIds }),
      })) as { candidates: string[] }
      persist({ candidates: res.candidates })
      setStage('candidates')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.mixError(entityPlural))
    } finally {
      setIsMixing(false)
    }
  }

  function pick(text: string) {
    navigate(`/worlds/${id}/prompt/new`, { state: { draftPrompt: text } })
  }

  const canMix = selectedPromptIds.length >= 1

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      <div className="page-width min-h-screen px-6 pb-40 pt-6">
        <h1 className="font-serif-zh text-[22px] italic leading-tight text-ink">
          {t.mixEntities(entityLabel('prompt', { capitalize: true, plural: true }, language))}
        </h1>

        {stage === 'select' ? (
          <>
            <p className="t-meta mt-3">{t.mixSelectHint(entityPlural)}</p>

            {clustersQuery.isLoading ? (
              <div className="hairline-list mt-6 flex flex-col">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="py-6">
                    <SkeletonText lineClassName="h-4" lines={2} />
                  </div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="t-meta pt-16 text-center">{t.mixEmpty(entityPlural)}</p>
            ) : (
              <ul className="hairline-list mt-6 flex flex-col">
                {groups.map(group => {
                  const promptId = group.latest_prompt_id
                  if (!promptId) return null
                  const selected = selectedPromptIds.includes(promptId)
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => toggle(promptId)}
                        aria-pressed={selected}
                        className="flex w-full items-start gap-3 py-6 text-left transition-transform duration-150 active:scale-[0.99]"
                      >
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${
                            selected ? 'bg-rose text-white' : 'bg-rose-line/50 text-transparent'
                          }`}
                        >
                          <Check aria-hidden="true" className="h-3 w-3 stroke-[2.5]" />
                        </span>
                        <span
                          className={`font-serif-zh text-[16px] leading-7 line-clamp-4 ${
                            selected ? 'text-ink' : 'text-ink-2'
                          }`}
                        >
                          {group.title}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {clustersQuery.hasNextPage && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => clustersQuery.fetchNextPage()}
                  disabled={clustersQuery.isFetchingNextPage}
                  className={actionClass}
                >
                  {t.loadMore}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="t-meta mt-3">
              {t.mixFromCount(
                selectedPromptIds.length,
                entityLabel('prompt', { plural: selectedPromptIds.length !== 1 }, language),
              )}
            </p>
            <p className="t-meta mt-1">{t.mixCandidatesHint(entitySingular)}</p>

            <ul className="hairline-list mt-6 flex flex-col">
              {candidates.map((candidate, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => pick(candidate)}
                    className="block w-full py-6 text-left transition-transform duration-150 active:scale-[0.99]"
                  >
                    <p className="font-serif-zh text-[16px] leading-7 text-ink-2">{candidate}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="t-meta mt-6 text-center text-rose">{error}</p>}
      </div>

      {stage === 'select' && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 bg-gradient-to-t from-paper via-paper/95 to-transparent px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-8">
          {canMix && (
            <button
              type="button"
              onClick={clearSelection}
              disabled={isMixing}
              className="inline-flex h-12 items-center justify-center rounded-full bg-rose-line/40 px-6 font-serif-zh text-[15px] italic leading-none text-ink-2 transition-all duration-200 active:translate-y-px disabled:opacity-50"
            >
              {t.mixClear}
            </button>
          )}
          <button
            type="button"
            onClick={runMix}
            disabled={!canMix || isMixing}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rose px-8 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 active:translate-y-px disabled:bg-ink-4/40 disabled:shadow-none"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            <span>{isMixing ? t.mixGenerating : canMix ? t.mix : t.mixNeedTwo}</span>
          </button>
        </div>
      )}

      {stage === 'candidates' && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 bg-gradient-to-t from-paper via-paper/95 to-transparent px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-8">
          <button
            type="button"
            onClick={() => setStage('select')}
            disabled={isMixing}
            className="inline-flex h-12 items-center justify-center rounded-full bg-rose-line/40 px-6 font-serif-zh text-[15px] italic leading-none text-ink-2 transition-all duration-200 active:translate-y-px disabled:opacity-50"
          >
            {t.mixEditSelection}
          </button>
          <button
            type="button"
            onClick={runMix}
            disabled={isMixing}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rose px-8 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 active:translate-y-px disabled:bg-ink-4/40 disabled:shadow-none"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            <span>{isMixing ? t.mixGenerating : t.mixAgain}</span>
          </button>
        </div>
      )}
    </div>
  )
}
