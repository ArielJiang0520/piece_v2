import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { estimateTokens } from '@/utils/textUnits'
import {
  EMPTY_PROMPT_WORKSHOP,
  historyFor,
  regenerationRequest,
  withDraft,
  withRegeneratedDraft,
  type PromptWorkshop,
} from '@/preferences/promptWorkshop'
import { setSimilarPromptsState, useSimilarPromptsState } from '@/preferences/similarPromptsState'
import PromptWorkshopView from '../../shared/PromptWorkshopView'
import { useWorkshopComposer } from '../../shared/useWorkshopComposer'
import { useWorldAdditions } from '../../shared/useWorldAdditions'

// A long prompt swamps the muse and burns the budget, so we don't riff on it.
const MAX_SIMILAR_PROMPT_TOKENS = 500

interface MoreLikeThisPanelProps {
  worldId: string | undefined
  sourcePromptId: number
  // The prompt this tab builds off. Already shown on the "prompt" tab, so this panel omits it —
  // it only needs the text to gate over-long prompts and to seed the request.
  sourceText: string
  // The version the world currently has checked out, so a workshop started on another one is not
  // carried across the switch.
  worldVersionId: number | null
}

// The "More like this" tab: works up a new prompt off a saved one. Not a similarity machine — the
// writer says what they want to make out of this prompt and revises it over as many rounds as they
// like. A workshop of its own, with its own trail — unlike the editor's AI sheet, there is no
// editor here holding the draft, so the drafts live in the panel.
export default function MoreLikeThisPanel({ worldId, sourcePromptId, sourceText, worldVersionId }: MoreLikeThisPanelProps) {
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const entityLabelSingular = entityLabel('prompt', {}, language)
  // A riff reads the same world the piece will be written against, additions included.
  const { activeIds: additionIds } = useWorldAdditions(worldId)

  // The persisted store may hold another prompt's leftovers, or a workshop built on a version the
  // world has since moved off; treat either as empty here.
  const persisted = useSimilarPromptsState()
  const isForeign = persisted.promptId !== sourcePromptId
    || (persisted.worldVersionId != null && worldVersionId != null && persisted.worldVersionId !== worldVersionId)
  const workshop = isForeign ? EMPTY_PROMPT_WORKSHOP : persisted.workshop

  const { note, setNote, editingRound, beginEdit, leaveEdit, reset } = useWorkshopComposer()
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooLong = sourceText !== '' && estimateTokens(sourceText) > MAX_SIMILAR_PROMPT_TOKENS

  function persist(next: PromptWorkshop) {
    setSimilarPromptsState({ promptId: sourcePromptId, worldVersionId, workshop: next })
  }

  // The writer need not type anything to start: they got here by tapping
  // "more like this" ON a prompt, and that prompt is the brief. A note only steers it.
  const trimmedNote = note.trim()
  // Rewriting an ask is the one case that needs words: an empty box is "run it again", which is
  // already the button on the draft.
  const canSubmit = !!sourceText && !tooLong && !isWorking && (editingRound === null || trimmedNote.length > 0)

  async function runDraft() {
    if (!worldId || !canSubmit) return
    setError(null)
    setIsWorking(true)
    // Everything up to the draft on screen: revising from an earlier one leaves the drafts after
    // it out of the conversation, and out of the workshop it comes back to.
    const from = workshop.viewing
    const history = historyFor(workshop, from)
    // A revision with nothing typed asks for another pass at the same brief; the server stands in
    // a first turn when there is no trail at all.
    const outgoingNote = trimmedNote || (history.drafts.length > 0 ? t.workshopAnotherPass : '')
    try {
      const res = (await apiFetch(`/api/worlds/${worldId}/similar`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: sourcePromptId,
          notes: outgoingNote ? [...history.notes, outgoingNote] : history.notes,
          drafts: history.drafts,
          additionIds,
        }),
      })) as { draft: string }
      persist(withDraft(workshop, outgoingNote || t.workshopFirstPass, res.draft, from))
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.similarError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  // The ask run again, replacing the draft on screen — with `asked` when the writer rewrote it,
  // and with the note that produced the draft when they only want another go at the same one. No
  // round is added either way.
  async function runRegenerate(asked?: string) {
    if (!worldId || isWorking || !sourceText || tooLong) return
    const at = editingRound ?? workshop.viewing
    const request = regenerationRequest(workshop, at, asked)
    if (!request) return
    setError(null)
    setIsWorking(true)
    try {
      const res = (await apiFetch(`/api/worlds/${worldId}/similar`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: sourcePromptId,
          notes: request.notes,
          drafts: request.drafts,
          additionIds,
        }),
      })) as { draft: string }
      persist(withRegeneratedDraft(workshop, res.draft, at, asked))
      leaveEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.similarError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  // The workshop is left standing: taking one draft to the writing screen is not the end of it,
  // and the writer can come straight back to the trail it came from.
  function write(text: string) {
    navigate(`/worlds/${worldId}/prompt/new`, {
      state: { draftPrompt: text, similarToPromptId: sourcePromptId },
    })
  }

  return (
    <PromptWorkshopView
      workshop={workshop}
      isWorking={isWorking}
      error={error}
      note={note}
      onNoteChange={setNote}
      onViewDraft={index => {
        // Moving off the draft being rewritten ends the rewrite: the ask in the box belongs to the
        // round it came from, not to whichever one is now on screen.
        leaveEdit()
        persist({ ...workshop, viewing: index })
      }}
      editingRound={editingRound}
      onEditRound={index => beginEdit(index, workshop.notes[index] ?? '')}
      onCancelEdit={leaveEdit}
      onSubmit={() => (editingRound === null ? runDraft() : runRegenerate(trimmedNote))}
      onRegenerate={() => runRegenerate()}
      onWrite={write}
      onClear={() => {
        persist(EMPTY_PROMPT_WORKSHOP)
        reset()
      }}
      canSubmit={canSubmit}
      blockedMessage={tooLong ? t.similarTooLong : null}
      copy={{
        emptyHint: t.similarEmptyHint(entityLabelSingular),
        seedPlaceholder: t.similarSeedPlaceholder,
        notePlaceholder: t.workshopNotePlaceholder,
        draftThis: t.workshopDraftThis,
        revise: t.workshopRevise,
        working: t.workshopWorking,
      }}
    />
  )
}
