import { useEffect, useMemo, type MouseEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useScrollReturn } from '@/hooks/useScrollReturn'
import { diffPromptInlineEdits } from '@/utils/promptDiff'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import PromptVariationCard from './PromptVariationCard'

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
  const location = useLocation()
  const stateBackHref = (location.state as { backHref?: string } | null)?.backHref
  const backHref = stateBackHref ?? (id ? `/worlds/${id}` : '/worlds')
  const {
    stateRef: restoreStateRef,
    scheduledRef: restoreScheduledRef,
    clear: clearClusterReturnState,
    save: saveClusterReturnState,
  } = useScrollReturn(
    id && clusterId ? `cluster-return:${id}:${clusterId}` : null,
    parseClusterReturnState,
  )

  useTopNavConfig({ secondaryTitle: `${entityLabel('prompt', { capitalize: true })} history`, backHref })

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
        editMarks: previousPrompt ? diffPromptInlineEdits(previousPrompt.text, prompt.text) : null,
        isLatest: index === prompts.length - 1,
        number: index + 1,
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
    return (
      <div className="page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-8">
        <div className="hairline-list">
          {Array.from({ length: 4 }, (_, index) => (
            <section
              key={index}
              className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-4 py-8 first:pt-2 last:pb-2"
            >
              <div className="relative flex justify-center">
                {index < 3 && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-1/2 top-12 w-px -translate-x-1/2 bg-rose-line"
                  />
                )}
                <Skeleton className="relative z-10 h-12 w-12 rounded-full" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <SkeletonText className="mt-4" lineClassName="h-4" lines={3} />
                <Skeleton className="mt-5 h-4 w-32" />
              </div>
            </section>
          ))}
        </div>
      </div>
    )
  }
  if (!cluster) return null

  return (
    <div className="page-fade-in page-width min-h-svh px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-8">
      <div className="t-eyebrow eyebrow-rule mb-6">
        <span>{prompts.length} {entityLabel('prompt', { plural: prompts.length !== 1 })} variations</span>
      </div>
      {prompts.length === 0 ? (
        <p className="t-meta">No variations yet.</p>
      ) : (
        <div className="hairline-list">
          {variations.map(({ prompt, editMarks, isLatest, number }, index) => (
            <PromptVariationCard
              key={prompt.id}
              prompt={prompt}
              worldId={id}
              number={number}
              isLatest={isLatest}
              isLast={index === variations.length - 1}
              showEdits
              editMarks={editMarks}
              onOpenPrompt={savePromptReturnState}
            />
          ))}
        </div>
      )}
    </div>
  )
}
