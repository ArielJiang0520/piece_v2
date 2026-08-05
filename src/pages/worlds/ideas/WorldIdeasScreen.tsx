import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { useTopNavConfig } from '@/components/topNavConfig'
import {
  EMPTY_PROMPT_WORKSHOP,
  historyFor,
  regenerationRequest,
  withDraft,
  withRegeneratedDraft,
  type PromptWorkshop,
} from '@/preferences/promptWorkshop'
import { setWorldIdeasState, useWorldIdeasState } from '@/preferences/worldIdeasState'
import PromptWorkshopView from '../shared/PromptWorkshopView'
import { useWorkshopComposer } from '../shared/useWorkshopComposer'
import { useWorldAdditions } from '../shared/useWorldAdditions'

export default function WorldIdeasScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const worldId = Number(id)
  // Ideas are worked up against the same world a piece would be written against. No indicator
  // here: this screen has its own pinned header, and the prompt it hands off to shows the line.
  const { activeIds: additionIds } = useWorldAdditions(id)

  const entityLabelSingular = entityLabel('prompt', {}, language)

  useTopNavConfig({ backHref: id ? `/worlds/${id}` : '/worlds' })

  const { note, setNote, editingRound, beginEdit, leaveEdit, reset } = useWorkshopComposer()
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string; current_version_id: number | null }>,
    enabled: !!id,
  })
  const worldVersionId = worldQuery.data?.current_version_id ?? null

  // The persisted store may hold another world's leftovers, or a workshop built on a version the
  // world has since moved off — the draft there was written from a setting that is no longer the
  // one on screen. Either way, treat it as empty here.
  const persisted = useWorldIdeasState()
  const isForeign = persisted.worldId !== worldId
    || (persisted.worldVersionId != null && worldVersionId != null && persisted.worldVersionId !== worldVersionId)
  const workshop = isForeign ? EMPTY_PROMPT_WORKSHOP : persisted.workshop

  function persist(next: PromptWorkshop) {
    setWorldIdeasState({ worldId, worldVersionId, workshop: next })
  }

  // The writer always says what they are after here — a prompt drawn from a blank brief is off
  // the mark often enough that there is nothing worth revising.
  const trimmedNote = note.trim()
  const canSubmit = !isWorking && worldQuery.isSuccess && trimmedNote.length > 0

  async function runDraft() {
    if (!id || !canSubmit) return
    setError(null)
    setIsWorking(true)
    // Everything up to the draft on screen: revising from an earlier one leaves the drafts after
    // it out of the conversation, and out of the workshop it comes back to.
    const from = workshop.viewing
    const history = historyFor(workshop, from)
    try {
      const res = (await apiFetch(`/api/worlds/${id}/ideas`, {
        method: 'POST',
        body: JSON.stringify({ notes: [...history.notes, trimmedNote], drafts: history.drafts, additionIds }),
      })) as { draft: string }
      persist(withDraft(workshop, trimmedNote, res.draft, from))
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.workshopError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  // The ask run again, replacing the draft on screen — with `asked` when the writer rewrote it,
  // and with the note that produced the draft when they only want another go at the same one. No
  // round is added either way.
  async function runRegenerate(asked?: string) {
    if (!id || isWorking || !worldQuery.isSuccess) return
    const at = editingRound ?? workshop.viewing
    const request = regenerationRequest(workshop, at, asked)
    if (!request) return
    setError(null)
    setIsWorking(true)
    try {
      const res = (await apiFetch(`/api/worlds/${id}/ideas`, {
        method: 'POST',
        body: JSON.stringify({ notes: request.notes, drafts: request.drafts, additionIds }),
      })) as { draft: string }
      persist(withRegeneratedDraft(workshop, res.draft, at, asked))
      leaveEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.workshopError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  function write(text: string) {
    // World-native ideas: no source prompt, so no ancestry to carry forward — but still an
    // AI-generated prompt, so mark it so it earns the "Generated" tag once saved. The workshop is
    // left standing: taking one draft to the writing screen is not the end of it, and the writer
    // can come straight back to the trail it came from.
    navigate(`/worlds/${id}/prompt/new`, { state: { draftPrompt: text, generated: true } })
  }

  return (
    <PromptWorkshopView
      title={t.workshopTitle(entityLabelSingular)}
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
      copy={{
        emptyHint: t.workshopEmptyHint(entityLabelSingular),
        seedPlaceholder: t.workshopSeedPlaceholder,
        notePlaceholder: t.workshopNotePlaceholder,
        draftThis: t.workshopDraftThis,
        revise: t.workshopRevise,
        working: t.workshopWorking,
      }}
    />
  )
}
