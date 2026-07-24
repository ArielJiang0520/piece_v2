import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { useGenerationModel } from '@/preferences/generationModel'
import { useTopNavConfig } from '@/components/topNavConfig'
import {
  EMPTY_PROMPT_SESSION,
  nextRound,
  toggleKept,
  trailWith,
  type PromptSession,
} from '@/preferences/promptSession'
import { setWorldIdeasState, useWorldIdeasState } from '@/preferences/worldIdeasState'
import PromptIdeasView from '../shared/PromptIdeasView'

export default function WorldIdeasScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const worldId = Number(id)

  const entityPlural = entityLabel('prompt', { plural: true }, language)

  useTopNavConfig({ backHref: id ? `/worlds/${id}` : '/worlds' })

  const [note, setNote] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const model = useGenerationModel()

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string; current_version_id: number | null }>,
    enabled: !!id,
  })
  const worldVersionId = worldQuery.data?.current_version_id ?? null

  // The persisted store may hold another world's leftovers, or a session built on a version the
  // world has since moved off — the candidates there were spun out of a setting that is no longer
  // the one on screen. Either way, treat it as empty here.
  const persisted = useWorldIdeasState()
  const isForeign = persisted.worldId !== worldId
    || (persisted.worldVersionId != null && worldVersionId != null && persisted.worldVersionId !== worldVersionId)
  const session = isForeign ? EMPTY_PROMPT_SESSION : persisted.session

  function persist(next: PromptSession) {
    setWorldIdeasState({ worldId, worldVersionId, session: next })
  }

  async function runGenerate() {
    if (!id || isGenerating || !worldQuery.isSuccess) return
    setError(null)
    setIsGenerating(true)
    const trail = trailWith(session, note)
    try {
      const res = (await apiFetch(`/api/worlds/${id}/ideas`, {
        method: 'POST',
        body: JSON.stringify({ notes: trail, kept: session.kept, model }),
      })) as { candidates: string[] }
      persist(nextRound(session, trail, res.candidates))
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.sparkError(entityPlural))
    } finally {
      setIsGenerating(false)
    }
  }

  function write(text: string) {
    // World-native ideas: no source prompt, so no ancestry to carry forward — but still an
    // AI-generated prompt, so mark it so it earns the "Generated" tag once saved. The session is
    // left standing: writing one candidate is not a verdict on the rest, and the writer can come
    // straight back to the board it came from.
    navigate(`/worlds/${id}/prompt/new`, { state: { draftPrompt: text, generated: true } })
  }

  return (
    <PromptIdeasView
      title={t.sparkTitle}
      header={null}
      session={session}
      isGenerating={isGenerating}
      error={error}
      note={note}
      onNoteChange={setNote}
      onToggleKeep={text => persist(toggleKept(session, text))}
      onGenerate={runGenerate}
      onWrite={write}
      onClear={() => {
        persist(EMPTY_PROMPT_SESSION)
        setNote('')
      }}
      canGenerate={!isGenerating && worldQuery.isSuccess}
      copy={{
        tapToKeep: t.sparkTapToKeep,
        emptyHint: t.sparkEmptyHint(entityPlural),
        seedPlaceholder: t.sparkSeedPlaceholder,
        notePlaceholder: t.sparkNotePlaceholder,
        generate: t.sparkGenerate,
        again: t.sparkAgain,
        generating: t.sparkGenerating,
      }}
    />
  )
}
