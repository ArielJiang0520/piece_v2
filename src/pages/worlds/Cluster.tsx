import { useEffect, useMemo, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { entityLabel } from '../../config'
import { useScrollReturn } from '../../hooks/useScrollReturn'
import { diffPromptText } from '../../utils/promptDiff'
import { relativeTime } from '../../utils/time'
import CountIndicator from '../../components/CountIndicator'
import { useTopNavConfig } from '../../components/TopNav'
import { RotateCw } from 'lucide-react'

interface ClusterReturnState {
  promptId: number
  cardTop: number
}

function parseClusterReturnState(value: unknown) {
  const parsed = value as Partial<ClusterReturnState>
  if (typeof parsed.promptId !== 'number' || typeof parsed.cardTop !== 'number') return null
  return { promptId: parsed.promptId, cardTop: parsed.cardTop }
}

interface Cluster {
  id: number
  title: string
  prompt_count: number
  piece_count: number
  updated_at: number
}

interface ClusterPrompt {
  id: number
  text: string
  piece_count: number
  created_at: number
  updated_at: number
}

interface ClusterResponse {
  cluster: Cluster
  prompts: ClusterPrompt[]
}

export default function Cluster() {
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const navigate = useNavigate()
  const backHref = id ? `/worlds/${id}` : '/worlds'
  const {
    stateRef: restoreStateRef,
    scheduledRef: restoreScheduledRef,
    clear: clearClusterReturnState,
    save: saveClusterReturnState,
  } = useScrollReturn(
    id && clusterId ? `cluster-return:${id}:${clusterId}` : null,
    parseClusterReturnState,
  )

  useTopNavConfig({ title: `${entityLabel('prompt', { capitalize: true })} variations`, backHref })

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })

  const clusterQuery = useQuery({
    queryKey: ['cluster', id, clusterId],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/clusters/${clusterId}`) as Promise<ClusterResponse>,
    enabled: !!id && !!clusterId,
  })

  const errored = worldQuery.isError || clusterQuery.isError
  useEffect(() => {
    if (errored) navigate(backHref)
  }, [errored, navigate, backHref])

  const cluster = clusterQuery.data?.cluster ?? null
  const prompts = clusterQuery.data?.prompts ?? []

  const variations = useMemo(
    () => prompts.map((prompt, index) => {
      const previousPrompt = prompts[index - 1]
      return {
        prompt,
        diff: previousPrompt ? diffPromptText(previousPrompt.text, prompt.text) : null,
        isLatest: index === prompts.length - 1,
        version: index + 1,
      }
    }).reverse(),
    [prompts],
  )

  useEffect(() => {
    const restoreState = restoreStateRef.current
    if (!clusterQuery.data || !restoreState || restoreScheduledRef.current) return

    const hasPrompt = prompts.some(p => p.id === restoreState.promptId)
    if (!hasPrompt) {
      clearClusterReturnState()
      return
    }

    restoreScheduledRef.current = true
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-prompt-id="${restoreState.promptId}"]`)
      if (card) {
        window.scrollBy({ top: card.getBoundingClientRect().top - restoreState.cardTop })
      }
      clearClusterReturnState()
    })
  }, [clusterQuery.data, prompts, clearClusterReturnState])

  function savePromptReturnState(promptId: number, event: MouseEvent<HTMLAnchorElement>) {
    if (!id || !clusterId) return
    const card = event.currentTarget.closest('[data-prompt-id]') as HTMLElement | null
    const cardTop = card?.getBoundingClientRect().top ?? 0
    saveClusterReturnState({ promptId, cardTop })
  }

  if (!worldQuery.data || !clusterQuery.data) {
    return <div className="page-width p-6 text-ink-3">Loading...</div>
  }
  if (!cluster) return null

  return (
    <div className="page-width min-h-svh px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
      {prompts.length === 0 ? (
        <p className="text-ink-3 text-sm">No variations yet.</p>
      ) : (
        <div className="divide-y divide-rose/20">
          {variations.map(({ prompt, diff, isLatest, version }, index) => {
            const isLast = index === variations.length - 1

            return (
              <section
                key={prompt.id}
                data-prompt-id={prompt.id}
                className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 py-7 first:pt-2 last:pb-2"
              >
                <div className="relative flex justify-center">
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-1/2 top-12 w-px -translate-x-1/2 bg-rose/25"
                    />
                  )}
                  <div
                    className={[
                      'relative z-10 grid h-12 w-12 place-items-center rounded-full border text-sm font-semibold',
                      isLatest
                        ? 'border-transparent bg-rose text-white'
                        : 'border-rose/30 bg-paper text-rose-deep/70',
                    ].join(' ')}
                  >
                    v{version}
                  </div>
                </div>

                <div className="min-w-0">
                  <Link
                    to={`/worlds/${id}/prompts/${prompt.id}`}
                    onClick={event => savePromptReturnState(prompt.id, event)}
                    className="block rounded-sm transition-colors hover:bg-paper-2/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-4/35"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs leading-5 text-ink-4">
                      <div className="flex min-w-0 items-center gap-2">
                        {isLatest && (
                          <span className="shrink-0 rounded-sm bg-rose px-2 py-1 text-[10px] font-semibold leading-none text-white">
                            LATEST
                          </span>
                        )}
                        <span className="truncate">{relativeTime(prompt.updated_at)}</span>
                      </div>
                      <CountIndicator count={prompt.piece_count} className="shrink-0 justify-end" />
                    </div>

                    <h2 className="mt-4 font-serif-zh text-[15px] font-normal leading-7 text-ink-2">
                      {prompt.text}
                    </h2>

                    {diff && (
                      <div className="mt-5 space-y-2 border-l-2 border-rose/30 pl-4 font-mono text-xs leading-5">
                        {diff.removed && (
                          <div className="text-red-800/70">
                            <span className="select-none">- </span>
                            {diff.removed}
                          </div>
                        )}
                        {diff.added && (
                          <div className="text-emerald-800/70">
                            <span className="select-none">+ </span>
                            {diff.added}
                          </div>
                        )}
                      </div>
                    )}
                  </Link>

                  <Link
                    to={`/worlds/${id}/generate?promptId=${prompt.id}`}
                    className="mt-5 inline-flex items-center gap-2 rounded-md border border-rose/80 bg-paper px-4 py-2 text-sm font-medium leading-none text-rose/80 transition-colors hover:border-ink-4 hover:bg-paper-2 hover:text-rose-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                  >
                    <RotateCw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span>Another {entityLabel('piece')}</span>
                  </Link>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
