import { useEffect, useMemo, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { useScrollReturn } from '../../hooks/useScrollReturn'
import { diffPromptText } from '../../utils/promptDiff'
import PieceCountIndicator from '../../ui/PieceCountIndicator'
import RelativeTimeStatus from '../../ui/RelativeTimeStatus'
import { useTopNavConfig } from '../../ui/TopNav'

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

  useTopNavConfig({ title: 'Prompt Variations', backHref })

  useEffect(() => {
    if (!restoreStateRef.current) window.scrollTo({ top: 0 })
  }, [id, clusterId])

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

  const promptDiffs = useMemo(
    () => prompts.map((prompt, index) => {
      const previousPrompt = prompts[index - 1]
      return previousPrompt ? diffPromptText(previousPrompt.text, prompt.text) : null
    }),
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
        <div className="flex flex-col gap-4">
          {prompts.map((prompt, index) => {
            const diff = promptDiffs[index]

            return (
              <section
                key={prompt.id}
                data-prompt-id={prompt.id}
                className="overflow-hidden rounded-md border border-paper-3 bg-paper shadow-[0_1px_0_rgba(26,18,16,0.02)]"
              >
                <Link
                  to={`/worlds/${id}/prompts/${prompt.id}`}
                  onClick={event => savePromptReturnState(prompt.id, event)}
                  className="block px-5 py-5 transition-colors hover:bg-paper-2/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-4/35"
                >
                  <div className="flex items-center justify-between gap-4 text-xs leading-none text-ink-4">
                    <RelativeTimeStatus timestamp={prompt.updated_at} emptyLabel="No pieces" />
                    <PieceCountIndicator count={prompt.piece_count} className="shrink-0" />
                  </div>
                  <h2 className="mt-3 font-serif-zh text-sm font-normal leading-6 text-ink-2">
                    {prompt.text}
                  </h2>

                  {diff && (
                    <div className="mt-4 space-y-1 rounded-sm border border-paper-3 bg-paper-2 px-3 py-2 font-mono text-xs leading-5">
                      {diff.removed && (
                        <div className="text-red-800/70">
                          <span className="select-none">- </span>
                          {diff.removed}
                        </div>
                      )}
                      {diff.added && (
                        <div className="text-green-800/70">
                          <span className="select-none">+ </span>
                          {diff.added}
                        </div>
                      )}
                    </div>
                  )}
                </Link>

                <Link
                  to={`/worlds/${id}/generate?promptId=${prompt.id}`}
                  className="block w-full border-t border-paper-3 text-paper-2 px-4 py-2 text-center text-xs font-medium bg-ink-3/80 transition-colors hover:bg-paper-2 hover:text-rose-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-4/35"
                >
                  Use this prompt
                </Link>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
