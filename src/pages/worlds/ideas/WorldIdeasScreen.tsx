import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import Skeleton from '@/components/Skeleton'
import { useTopNavConfig } from '@/components/topNavConfig'
import {
  EMPTY_WORLD_IDEAS_STATE,
  setWorldIdeasState,
  useWorldIdeasState,
} from '@/preferences/worldIdeasState'
import PromptIdeasView from '../shared/PromptIdeasView'

export default function WorldIdeasScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const worldId = Number(id)

  const entityPlural = entityLabel('prompt', { plural: true }, language)

  useTopNavConfig({ backHref: id ? `/worlds/${id}` : '/worlds' })

  // The persisted store may hold another world's leftovers; treat those as empty here.
  const persisted = useWorldIdeasState()
  const state = persisted.worldId === worldId ? persisted : EMPTY_WORLD_IDEAS_STATE
  const { candidates } = state

  const [hint, setHint] = useState(state.hint)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })
  const worldName = worldQuery.data?.name ?? ''

  function persist(next: { hint?: string; candidates?: string[] }) {
    setWorldIdeasState({
      worldId,
      hint: next.hint ?? hint,
      candidates: next.candidates ?? candidates,
    })
  }

  async function runGenerate() {
    if (!id || isGenerating) return
    setError(null)
    setIsGenerating(true)
    const currentHint = hint.trim()
    try {
      const res = (await apiFetch(`/api/worlds/${id}/ideas`, {
        method: 'POST',
        body: JSON.stringify({ hint: currentHint || undefined }),
      })) as { candidates: string[] }
      persist({ hint: currentHint, candidates: res.candidates })
    } catch (e) {
      setError(e instanceof Error ? e.message : t.sparkError(entityPlural))
    } finally {
      setIsGenerating(false)
    }
  }

  function pick(text: string) {
    // World-native ideas: no source prompt, so no ancestry to carry forward — but still an
    // AI-generated prompt, so mark it so it earns the "Generated" tag once saved.
    navigate(`/worlds/${id}/prompt/new`, { state: { draftPrompt: text, generated: true } })
  }

  return (
    <PromptIdeasView
      header={
        // Pinned context: which world these ideas are drawn from.
        <div className="sticky top-12 z-10 border-b border-rose-line bg-paper/95 backdrop-blur">
          <div className="page-width px-6 py-4">
            <p className="t-eyebrow">{t.sparkTitle}</p>
            {worldQuery.isLoading ? (
              <Skeleton className="mt-2 h-5 w-40" />
            ) : (
              <p className="mt-2 font-serif-zh text-[15px] leading-7 text-ink-2 line-clamp-2">{worldName}</p>
            )}
          </div>
        </div>
      }
      candidates={candidates}
      isGenerating={isGenerating}
      error={error}
      hint={hint}
      onHintChange={setHint}
      onGenerate={runGenerate}
      onPick={pick}
      canGenerate={!isGenerating}
      copy={{
        resultsLabel: count => t.sparkResultsLabel(count, entityPlural),
        tapToWrite: t.sparkTapToWrite,
        emptyHint: t.sparkEmptyHint(entityPlural),
        steerPlaceholder: t.sparkSteerPlaceholder,
        generate: t.sparkGenerate,
        again: t.sparkAgain,
        generating: t.sparkGenerating,
      }}
    />
  )
}
