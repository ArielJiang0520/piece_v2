import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import CountIndicator from '@/components/CountIndicator'
import { entityLabel, formatEntityCount } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { useGenerationModel } from '@/preferences/generationModel'
import { relativeTime } from '@/utils/time'
import { estimateTokens } from '@/utils/textUnits'
import {
  EMPTY_SIMILAR_STATE,
  setSimilarPromptsState,
  useSimilarPromptsState,
} from '@/preferences/similarPromptsState'
import PromptIdeasView from '../../shared/PromptIdeasView'
import type { ClusterPrompt } from '../../shared/types'

// A long prompt swamps the muse and burns the budget, so we don't riff on it.
const MAX_SIMILAR_PROMPT_TOKENS = 500

const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 active:text-ink'

interface MoreLikeThisPanelProps {
  worldId: string | undefined
  sourcePromptId: number
  // The prompt this tab riffs on. Already shown on the "prompt" tab, so this panel omits it —
  // it only needs the text to gate over-long prompts and to seed the request.
  sourceText: string
}

// The "More like this" tab: riffs new prompts off a saved one. Same generation/caching as the
// former standalone screen (candidates persisted per source prompt), minus the pinned prompt text.
export default function MoreLikeThisPanel({ worldId, sourcePromptId, sourceText }: MoreLikeThisPanelProps) {
  const t = useUiText()
  const language = useLanguageId()
  const navigate = useNavigate()
  const entityPlural = entityLabel('prompt', { plural: true }, language)

  // The persisted store may hold another prompt's leftovers; treat those as empty here.
  const persisted = useSimilarPromptsState()
  const state = persisted.promptId === sourcePromptId ? persisted : EMPTY_SIMILAR_STATE
  const { candidates } = state

  const [hint, setHint] = useState(state.hint)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inspiredOpen, setInspiredOpen] = useState(false)
  const model = useGenerationModel()

  const tooLong = sourceText !== '' && estimateTokens(sourceText) > MAX_SIMILAR_PROMPT_TOKENS

  // Prompts already spun off this one (their `similar_to_prompt_id` points here). Surfaced in the
  // top bar / sheet so the writer can jump back to what this prompt has already inspired.
  const inspiredQuery = useQuery({
    queryKey: ['prompt-inspired', worldId, sourcePromptId],
    queryFn: () =>
      apiFetch(`/api/worlds/${worldId}/similar/${sourcePromptId}/children`) as Promise<{ children: ClusterPrompt[] }>,
    enabled: !!worldId && Number.isInteger(sourcePromptId) && sourcePromptId > 0,
  })
  const inspired = inspiredQuery.data?.children ?? []

  // Lock background scroll while the inspired-prompts sheet is open.
  useEffect(() => {
    if (!inspiredOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [inspiredOpen])

  function persist(next: { hint?: string; candidates?: string[] }) {
    setSimilarPromptsState({
      promptId: sourcePromptId,
      hint: next.hint ?? hint,
      candidates: next.candidates ?? candidates,
    })
  }

  async function runGenerate() {
    if (!worldId || isGenerating || tooLong || !sourceText) return
    setError(null)
    setIsGenerating(true)
    const currentHint = hint.trim()
    try {
      const res = (await apiFetch(`/api/worlds/${worldId}/similar`, {
        method: 'POST',
        body: JSON.stringify({ promptId: sourcePromptId, hint: currentHint || undefined, model }),
      })) as { candidates: string[] }
      persist({ hint: currentHint, candidates: res.candidates })
    } catch (e) {
      setError(e instanceof Error ? e.message : t.similarError(entityPlural))
    } finally {
      setIsGenerating(false)
    }
  }

  function pick(text: string) {
    navigate(`/worlds/${worldId}/prompt/new`, {
      state: { draftPrompt: text, similarToPromptId: sourcePromptId },
    })
  }

  function openInspiredPrompt(promptId: number) {
    setInspiredOpen(false)
    navigate(`/worlds/${worldId}/prompt/${promptId}`)
  }

  // Only worth a top bar once this prompt has actually inspired something.
  const inspiredBar = inspired.length > 0
    ? (
      <button
        type="button"
        onClick={() => setInspiredOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 border-b border-rose-line/70 bg-paper-2/40 px-4 py-4 font-serif-zh text-[13px] italic leading-none text-ink-3 transition-colors active:text-ink"
      >
        <span>{t.inspiredPromptsLabel(formatEntityCount(inspired.length, 'prompt', language), entityLabel('prompt', {}, language))}</span>
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </button>
    )
    : null

  return (
    <>
      <PromptIdeasView
        header={inspiredBar}
        candidates={candidates}
        isGenerating={isGenerating}
        error={error}
        hint={hint}
        onHintChange={setHint}
        onGenerate={runGenerate}
        onPick={pick}
        canGenerate={!!sourceText && !tooLong && !isGenerating}
        blockedMessage={tooLong ? t.similarTooLong : null}
        copy={{
          resultsLabel: count => t.similarResultsLabel(count, entityPlural),
          tapToWrite: t.similarTapToWrite,
          emptyHint: t.similarEmptyHint(entityPlural),
          steerPlaceholder: t.similarSteerPlaceholder,
          generate: t.similarGenerate,
          again: t.similarAgain,
          generating: t.similarGenerating,
        }}
      />

      {inspiredOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t.inspiredPrompts}>
          <button
            type="button"
            aria-label={t.close}
            className="sheet-backdrop-in absolute inset-0 bg-ink/35"
            onClick={() => setInspiredOpen(false)}
          />
          <div className="sheet-slide-up relative flex h-[85vh] flex-col rounded-t-2xl border-t border-rose-line bg-paper shadow-[0_-24px_70px_rgba(26,18,16,0.22)]">
            <div className="flex items-center justify-between gap-3 border-b border-rose-line/70 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <span className="t-eyebrow">{t.inspiredPrompts}</span>
                <span className="inline-flex min-w-5 justify-center rounded-full bg-paper-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 ring-1 ring-paper-3/70">
                  {inspired.length}
                </span>
              </div>
              <button type="button" className={headerTextActionClass} onClick={() => setInspiredOpen(false)}>
                {t.close}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <ul className="hairline-list flex flex-col">
                {inspired.map(child => (
                  <li key={child.id}>
                    <button
                      type="button"
                      onClick={() => openInspiredPrompt(child.id)}
                      className="block w-full py-6 text-left transition-transform duration-150 active:scale-[0.99]"
                    >
                      <div className="t-meta flex items-center justify-between gap-3">
                        <span className="truncate not-italic text-ink-3">{relativeTime(child.updated_at, language)}</span>
                        <CountIndicator count={child.piece_count} className="shrink-0 justify-end gap-x-2" />
                      </div>
                      <p className="mt-3 whitespace-pre-wrap font-serif-zh text-[16px] leading-7 text-ink-2">{child.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
