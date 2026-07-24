import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { useGenerationModel } from '@/preferences/generationModel'
import { estimateTokens } from '@/utils/textUnits'
import {
  EMPTY_PROMPT_SESSION,
  nextRound,
  toggleKept,
  trailWith,
  type PromptSession,
} from '@/preferences/promptSession'
import { setSimilarPromptsState, useSimilarPromptsState } from '@/preferences/similarPromptsState'
import PromptIdeasView from '../../shared/PromptIdeasView'

// A long prompt swamps the muse and burns the budget, so we don't riff on it.
const MAX_SIMILAR_PROMPT_TOKENS = 500

interface MoreLikeThisPanelProps {
  worldId: string | undefined
  sourcePromptId: number
  // The prompt this tab builds off. Already shown on the "prompt" tab, so this panel omits it —
  // it only needs the text to gate over-long prompts and to seed the request.
  sourceText: string
  // The version the world currently has checked out, so a session started on another one is not
  // carried across the switch.
  worldVersionId: number | null
}

// The "More like this" tab: builds new prompts off a saved one. Not a similarity machine — the
// writer says what they want to make out of this prompt, and steers it over as many rounds as they
// like. Same session mechanics as the Ideas screen, anchored to a source prompt instead of a world.
export default function MoreLikeThisPanel({ worldId, sourcePromptId, sourceText, worldVersionId }: MoreLikeThisPanelProps) {
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const entityPlural = entityLabel('prompt', { plural: true }, language)

  // The persisted store may hold another prompt's leftovers, or a session built on a version the
  // world has since moved off; treat either as empty here.
  const persisted = useSimilarPromptsState()
  const isForeign = persisted.promptId !== sourcePromptId
    || (persisted.worldVersionId != null && worldVersionId != null && persisted.worldVersionId !== worldVersionId)
  const session = isForeign ? EMPTY_PROMPT_SESSION : persisted.session

  const [note, setNote] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const model = useGenerationModel()

  const tooLong = sourceText !== '' && estimateTokens(sourceText) > MAX_SIMILAR_PROMPT_TOKENS

  function persist(next: PromptSession) {
    setSimilarPromptsState({ promptId: sourcePromptId, worldVersionId, session: next })
  }

  async function runGenerate() {
    if (!worldId || isGenerating || tooLong || !sourceText) return
    setError(null)
    setIsGenerating(true)
    const trail = trailWith(session, note)
    try {
      const res = (await apiFetch(`/api/worlds/${worldId}/similar`, {
        method: 'POST',
        body: JSON.stringify({ promptId: sourcePromptId, notes: trail, kept: session.kept, model }),
      })) as { candidates: string[] }
      persist(nextRound(session, trail, res.candidates))
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.similarError(entityPlural))
    } finally {
      setIsGenerating(false)
    }
  }

  // The session is left standing: writing one candidate is not a verdict on the rest, and the
  // writer can come straight back to the board it came from.
  function write(text: string) {
    navigate(`/worlds/${worldId}/prompt/new`, {
      state: { draftPrompt: text, similarToPromptId: sourcePromptId },
    })
  }

  return (
    <PromptIdeasView
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
      canGenerate={!!sourceText && !tooLong && !isGenerating}
      blockedMessage={tooLong ? t.similarTooLong : null}
      copy={{
        tapToKeep: t.similarTapToKeep,
        emptyHint: t.similarEmptyHint(entityPlural),
        seedPlaceholder: t.similarSeedPlaceholder,
        notePlaceholder: t.similarNotePlaceholder,
        generate: t.similarGenerate,
        again: t.similarAgain,
        generating: t.similarGenerating,
      }}
    />
  )
}
