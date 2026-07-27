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

export default function WorldIdeasScreen() {
  const t = useUiText()
  const language = useLanguageId()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const worldId = Number(id)

  const entityLabelSingular = entityLabel('prompt', {}, language)

  useTopNavConfig({ backHref: id ? `/worlds/${id}` : '/worlds' })

  const [note, setNote] = useState('')
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
        body: JSON.stringify({ notes: [...history.notes, trimmedNote], drafts: history.drafts }),
      })) as { draft: string }
      persist(withDraft(workshop, trimmedNote, res.draft, from))
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t.workshopError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  // The same ask, run again, replacing the draft on screen. Nothing new is said and no round is
  // added — the conversation sent is the one that produced what is already there.
  async function runRegenerate() {
    if (!id || isWorking || !worldQuery.isSuccess) return
    const at = workshop.viewing
    const request = regenerationRequest(workshop, at)
    if (!request) return
    setError(null)
    setIsWorking(true)
    try {
      const res = (await apiFetch(`/api/worlds/${id}/ideas`, {
        method: 'POST',
        body: JSON.stringify({ notes: request.notes, drafts: request.drafts }),
      })) as { draft: string }
      persist(withRegeneratedDraft(workshop, res.draft, at))
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
      onViewDraft={index => persist({ ...workshop, viewing: index })}
      onSubmit={runDraft}
      onRegenerate={runRegenerate}
      onWrite={write}
      onClear={() => {
        persist(EMPTY_PROMPT_WORKSHOP)
        setNote('')
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
