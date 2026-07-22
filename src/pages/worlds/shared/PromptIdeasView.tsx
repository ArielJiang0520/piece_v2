import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { SkeletonText } from '@/components/Skeleton'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import ModelSelector from '../prompt/components/ModelSelector'

// Shared presentation for the two brainstorming screens — "Similar prompts" (riff on one prompt) and
// "Spark ideas" (invent from the world). They share this whole layout: a pinned context header, a
// results area (generating skeleton / candidate list / empty hint), and a fixed steer-input + Generate
// bar. Everything that differs is passed in — the header node, the copy, and the data/handlers — so
// neither screen copies the other's markup.
export interface PromptIdeasCopy {
  resultsLabel: (count: number) => string
  tapToWrite: string
  emptyHint: string
  steerPlaceholder: string
  generate: string
  again: string
  generating: string
}

interface PromptIdeasViewProps {
  header: ReactNode
  candidates: string[]
  isGenerating: boolean
  error: string | null
  hint: string
  onHintChange: (value: string) => void
  onGenerate: () => void
  onPick: (text: string) => void
  canGenerate: boolean
  // When set, the body shows this message and the action bar is hidden (e.g. a source prompt that is
  // too long to riff on). Null/undefined = normal, generatable screen.
  blockedMessage?: string | null
  copy: PromptIdeasCopy
}

export default function PromptIdeasView({
  header,
  candidates,
  isGenerating,
  error,
  hint,
  onHintChange,
  onGenerate,
  onPick,
  canGenerate,
  blockedMessage,
  copy,
}: PromptIdeasViewProps) {
  const hasCandidates = candidates.length > 0
  const isBlocked = !!blockedMessage
  // The brainstorming model, shared with the story-generation model choice.
  const model = useGenerationModel()
  const [modelMenuOpen, setModelMenuOpen] = useState(false)

  function handleSteerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      onGenerate()
    }
  }

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      {header}

      <div className="page-width min-h-[60vh] px-6 pb-32 pt-6">
        {!isBlocked && (
          <div className={`relative mb-5 flex items-center justify-center ${modelMenuOpen ? 'z-50' : 'z-0'}`}>
            <ModelSelector
              model={model}
              onModelChange={setGenerationModel}
              onMenuOpenChange={setModelMenuOpen}
            />
          </div>
        )}
        {isBlocked ? (
          <p className="t-meta pt-16 text-center text-ink-3">{blockedMessage}</p>
        ) : isGenerating && !hasCandidates ? (
          <ul className="hairline-list flex flex-col">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="py-6">
                <SkeletonText lineClassName="h-4" lines={2} />
              </li>
            ))}
          </ul>
        ) : hasCandidates ? (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <p className="t-eyebrow">{copy.resultsLabel(candidates.length)}</p>
              <p className="t-meta shrink-0 text-ink-3">{copy.tapToWrite}</p>
            </div>
            <ul className="hairline-list mt-4 flex flex-col">
              {candidates.map((candidate, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => onPick(candidate)}
                    className="block w-full py-6 text-left transition-transform duration-150 active:scale-[0.99]"
                  >
                    <p className="font-serif-zh text-[16px] leading-7 text-ink-2">{candidate}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="t-meta mx-auto max-w-xs pt-16 text-center leading-6 text-ink-3">
            {copy.emptyHint}
          </p>
        )}

        {error && <p className="t-meta mt-8 text-center text-rose">{error}</p>}
      </div>

      {/* Fixed action bar: optional steer + generate, so a re-roll never needs a scroll. */}
      {!isBlocked && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rose-line bg-paper/95 backdrop-blur">
          <div className="page-width flex items-center gap-3 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            <input
              type="text"
              value={hint}
              onChange={event => onHintChange(event.target.value)}
              onKeyDown={handleSteerKeyDown}
              placeholder={copy.steerPlaceholder}
              aria-label={copy.steerPlaceholder}
              className="min-w-0 flex-1 rounded-full border border-rose-line bg-paper px-4 py-2.5 font-serif-zh text-[16px] italic text-ink placeholder:text-ink-4 focus:border-rose/40 focus:outline-none focus:ring-2 focus:ring-rose/15"
            />
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 active:translate-y-px disabled:bg-ink-4/40 disabled:shadow-none"
            >
              {isGenerating ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              )}
              <span>{isGenerating ? copy.generating : hasCandidates ? copy.again : copy.generate}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
