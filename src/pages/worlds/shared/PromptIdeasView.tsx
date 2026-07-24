import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { SkeletonText } from '@/components/Skeleton'
import { useUiText } from '@/i18n'
import { setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import type { PromptSession } from '@/preferences/promptSession'
import ModelSelector from '../prompt/components/ModelSelector'

// Shared presentation for the two brainstorming screens — "More like this" (build off one prompt)
// and "Ideas" (build out of the world). Both run the same session: type a fragment, get five
// candidates, tap the ones worth pursuing, add a note, roll again. Everything that differs is
// passed in — the header node, the copy, and the data/handlers.
//
// Two taps mean two different things on a candidate, and the split is deliberate. Tapping the card
// KEEPS it, which happens many times a session and so gets the whole-card target. Deciding to
// actually write one is the end of the session, a much bigger commitment, so it gets its own
// action — and that action only appears once a candidate is kept, which keeps the board quiet and
// makes the first tap the same everywhere.
const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 active:text-ink'

export interface PromptIdeasCopy {
  tapToKeep: string
  emptyHint: string
  // The box says two different things over a session's life: the opening fragment ("what do you
  // want?") and, once a board exists, what to change about it.
  seedPlaceholder: string
  notePlaceholder: string
  generate: string
  again: string
  generating: string
}

interface PromptIdeasViewProps {
  // Left side of the thin top bar (the model choice sits on the right). "Ideas" for the world
  // screen; the "More like this" tab has no title, so its bar carries only the model choice.
  title?: string
  header: ReactNode
  session: PromptSession
  isGenerating: boolean
  error: string | null
  note: string
  onNoteChange: (value: string) => void
  onToggleKeep: (text: string) => void
  onGenerate: () => void
  onWrite: (text: string) => void
  onClear: () => void
  canGenerate: boolean
  // When set, the body shows this message and the action bar is hidden (e.g. a source prompt that is
  // too long to riff on). Null/undefined = normal, generatable screen.
  blockedMessage?: string | null
  copy: PromptIdeasCopy
}

export default function PromptIdeasView({
  title,
  header,
  session,
  isGenerating,
  error,
  note,
  onNoteChange,
  onToggleKeep,
  onGenerate,
  onWrite,
  onClear,
  canGenerate,
  blockedMessage,
  copy,
}: PromptIdeasViewProps) {
  const t = useUiText()
  const { notes, candidates, kept, fresh, round } = session
  const hasCandidates = candidates.length > 0
  const isBlocked = !!blockedMessage
  // Every candidate kept means nothing left to replace — the writer has to free a slot before the
  // next round has anywhere to put a new idea.
  const boardIsFull = hasCandidates && kept.length >= candidates.length
  const hasSession = notes.length > 0 || hasCandidates
  // The brainstorming model, shared with the story-generation model choice.
  const model = useGenerationModel()
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  // The instruction trail is folded away by default — it grows every round, and the board is what
  // the writer is here to look at. Tapping the round line opens it.
  const [trailOpen, setTrailOpen] = useState(false)

  // The composer grows with the text instead of scrolling a one-line field out of sight — a
  // fragment is short, but "what to change" after three rounds rarely is. Capped by max-height so
  // a long note can never eat the board it is about.
  const noteRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = noteRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [note])

  return (
    <div className="page-fade-in min-h-screen bg-paper">
      {/* Pinned header, all on hairline rows under the top nav: what this screen is + the model
          choice, then — once a board exists — the round, the folded-away instruction trail, and the
          standing tap hint. The world's name already lives in the nav above, so it isn't repeated. */}
      {!isBlocked && (
        <div className={`sticky top-12 border-b border-rose-line bg-paper/95 backdrop-blur ${modelMenuOpen ? 'z-50' : 'z-20'}`}>
          <div className="page-width px-6">
            <div className="flex items-center justify-between gap-3 py-2">
              {title ? <p className="t-eyebrow">{title}</p> : <span aria-hidden="true" />}
              <ModelSelector
                model={model}
                onModelChange={setGenerationModel}
                onMenuOpenChange={setModelMenuOpen}
                align="end"
              />
            </div>

            {hasCandidates && (
              <div className="border-t border-rose-line/60 pb-2.5 pt-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="t-eyebrow">{t.sessionRound(round)}</p>
                  <button type="button" onClick={onClear} className={headerTextActionClass}>
                    {t.sessionStartOver}
                  </button>
                </div>
                {notes.length > 0 && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => setTrailOpen(open => !open)}
                      aria-expanded={trailOpen}
                      className="flex w-full items-center justify-between gap-3 py-1 text-left transition-colors active:text-ink"
                    >
                      <span className="font-serif-zh text-[14px] italic leading-none text-ink-3">{t.sessionTrail}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 shrink-0 text-ink-4 transition-transform ${trailOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {trailOpen && (
                      <div className="mt-2 border-l-2 border-rose-line pl-4">
                        <p className="font-serif-zh text-[15px] leading-7 text-ink-2">{notes[0]}</p>
                        {notes.slice(1).map((line, index) => (
                          <p key={index} className="mt-1.5 font-serif-zh text-[14px] italic leading-6 text-ink-3">
                            {`+ ${line}`}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {header}

      <div className="page-width min-h-[60vh] px-6 pb-48 pt-6">
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
            <p className="t-meta leading-6 text-ink-3">{copy.tapToKeep}</p>
            <ul className="hairline-list mt-4 flex flex-col">
              {candidates.map((candidate, index) => {
                const isKept = kept.includes(candidate)
                // New = the model wrote it this round. It stays green through the round even after
                // the writer keeps it (a card can carry both pills); next round it survives unmarked.
                const isNew = fresh.includes(candidate)
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => onToggleKeep(candidate)}
                      aria-pressed={isKept}
                      className={`block w-full text-left transition-transform duration-150 active:scale-[0.99] ${isKept ? 'pb-3 pt-6' : 'py-6'}`}
                    >
                      {(isNew || isKept) && (
                        <span className="mb-2.5 flex flex-wrap items-center gap-1.5">
                          {isNew && (
                            <span className="inline-flex items-center rounded-full bg-signal-green/12 px-2.5 py-1 font-sans text-[11px] font-semibold leading-none tracking-normal text-signal-green">
                              {t.sessionNew}
                            </span>
                          )}
                          {isKept && (
                            <span className="inline-flex items-center rounded-full bg-rose/12 px-2.5 py-1 font-sans text-[11px] font-semibold leading-none tracking-normal text-rose">
                              {t.sessionKept}
                            </span>
                          )}
                        </span>
                      )}
                      <p className={`font-serif-zh text-[16px] leading-7 ${isKept ? 'text-ink' : 'text-ink-2'}`}>
                        {candidate}
                      </p>
                    </button>
                    {isKept && (
                      <div className="pb-5">
                        <button type="button" onClick={() => onWrite(candidate)} className={headerTextActionClass}>
                          {t.sessionWriteThis}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="t-meta mx-auto max-w-xs pt-16 text-center leading-6 text-ink-3">
            {copy.emptyHint}
          </p>
        )}

        {error && <p className="t-meta mt-8 text-center text-rose">{error}</p>}
      </div>

      {/* Fixed composer: the note on its own full-width row so it can wrap instead of squeezing the
          button, and the button full-width beneath it — within reach of a thumb wherever it sits,
          rather than stranded in a corner. */}
      {!isBlocked && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rose-line bg-paper/95 backdrop-blur">
          <div className="page-width flex flex-col gap-2.5 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {boardIsFull && <p className="t-meta px-1 text-ink-3">{t.sessionBoardFull}</p>}
            <textarea
              ref={noteRef}
              rows={1}
              value={note}
              onChange={event => onNoteChange(event.target.value)}
              placeholder={hasSession ? copy.notePlaceholder : copy.seedPlaceholder}
              aria-label={hasSession ? copy.notePlaceholder : copy.seedPlaceholder}
              className="max-h-32 w-full resize-none overflow-y-auto rounded-2xl border border-rose-line bg-paper px-4 py-3 font-serif-zh text-[16px] italic leading-6 text-ink placeholder:text-ink-4 focus:border-rose/40 focus:outline-none focus:ring-2 focus:ring-rose/15"
            />
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate || boardIsFull}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 active:translate-y-px disabled:bg-ink-4/40 disabled:shadow-none"
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
