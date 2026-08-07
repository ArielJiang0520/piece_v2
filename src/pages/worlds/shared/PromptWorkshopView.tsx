import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Pencil, RotateCcw, Sparkles } from 'lucide-react'
import { SkeletonText } from '@/components/Skeleton'
import { useUiText } from '@/i18n'
import type { PromptWorkshop } from '@/preferences/promptWorkshop'

// Presentation for the "More like this" workshop — build a new prompt off one that already exists.
// The loop: say what you are after, get ONE prompt back, say what to change, get it revised. The
// copy and the data/handlers are passed in rather than reached for, so the loop stays the file's
// only subject.
//
// The screen shows exactly one draft, because that is what the writer is working on. Earlier
// drafts are reachable through the stepper, and revising from one of them throws away everything
// after it: the trail is the writer's path to the prompt, not a gallery of options.
//
// A step of that path can also be rewritten in place — tap the trail line you are on and the
// composer changes that ask instead of adding another one. It is the same operation as "try this
// again", with the question changed rather than repeated, so a badly worded round gets fixed
// rather than argued with over two more rounds.
const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 active:text-ink disabled:opacity-40'

export interface PromptWorkshopCopy {
  emptyHint: string
  // The box says two different things over a workshop's life: the opening brief ("what do you
  // want?") and, once a draft exists, what to change about it.
  seedPlaceholder: string
  notePlaceholder: string
  draftThis: string
  revise: string
  working: string
}

interface PromptWorkshopViewProps {
  // Names the workshop on its own thin row. The "More like this" tab passes none — it sits under a
  // tab that already says so — and shows no such row.
  title?: string
  workshop: PromptWorkshop
  isWorking: boolean
  error: string | null
  note: string
  onNoteChange: (value: string) => void
  onViewDraft: (index: number) => void
  // Which round's ask the composer is currently rewriting, or null while it is writing the next
  // one. Always the round on screen — stepping anywhere else leaves the rewrite.
  editingRound: number | null
  onEditRound: (index: number) => void
  onCancelEdit: () => void
  // Adds the next round, or — while a round is being rewritten — redoes that one in place.
  onSubmit: () => void
  // Run the draft on screen again, same note, same model — it replaces what is there rather than
  // adding a round. The only way to see what else the same ask produces.
  onRegenerate: () => void
  onWrite: (text: string) => void
  onClear: () => void
  canSubmit: boolean
  // When set, the body shows this message and the composer is hidden (e.g. a source prompt that is
  // too long to riff on). Null/undefined = normal, workable screen.
  blockedMessage?: string | null
  copy: PromptWorkshopCopy
}

export default function PromptWorkshopView({
  title,
  workshop,
  isWorking,
  error,
  note,
  onNoteChange,
  onViewDraft,
  editingRound,
  onEditRound,
  onCancelEdit,
  onSubmit,
  onRegenerate,
  onWrite,
  onClear,
  canSubmit,
  blockedMessage,
  copy,
}: PromptWorkshopViewProps) {
  const t = useUiText()
  const { notes, drafts, viewing } = workshop
  const hasDrafts = drafts.length > 0
  const isBlocked = !!blockedMessage
  const draft = drafts[viewing] ?? null
  // Stepping back past the newest draft: the next revision starts from the one on screen, so
  // everything after it goes. Said plainly on screen rather than discovered afterward.
  const isRevisingFromEarlier = hasDrafts && viewing < drafts.length - 1
  const isEditing = editingRound !== null
  // The trail is folded away by default — it grows every round, and the draft is what the writer
  // is here to read. Tapping it opens the list of what they have asked for so far. It opens itself
  // for a rewrite, since that is where the ask being rewritten is.
  const [trailOpen, setTrailOpen] = useState(false)
  useEffect(() => {
    if (isEditing) setTrailOpen(true)
  }, [isEditing])

  // Rewriting round 0 is rewriting the opening brief, so the box asks for one again rather than
  // for a change to something.
  const placeholder = editingRound === 0 || !hasDrafts ? copy.seedPlaceholder : copy.notePlaceholder

  // The composer grows with the text instead of scrolling a one-line field out of sight — an
  // opening brief is short, but "what to change" after three rounds rarely is. Capped by
  // max-height so a long note can never eat the draft it is about.
  const noteRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = noteRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [note])

  return (
    <div className="page-fade-in bg-paper">
      {/* Pinned header, on hairline rows under the top nav: what this screen is, then — once a draft
          exists — which draft is on screen and the folded-away trail. The world's name already lives
          in the nav above, so it isn't repeated. Which model writes these prompts is a fixture of
          the feature, not a choice, so it isn't offered here. */}
      {!isBlocked && (title || hasDrafts) && (
        <div className="sticky top-12 z-20 border-b border-rose-line bg-paper/95 backdrop-blur">
          <div className="page-width px-6">
            {title && (
              <div className="flex items-center py-2">
                <p className="t-eyebrow">{title}</p>
              </div>
            )}

            {hasDrafts && (
              <div className={`pb-2.5 pt-2 ${title ? 'border-t border-rose-line/60' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  {/* Stepper on the left, where a left thumb reaches it. */}
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onViewDraft(viewing - 1)}
                      disabled={viewing <= 0}
                      aria-label={t.workshopPreviousDraft}
                      className="grid h-8 w-7 shrink-0 place-items-center text-ink-3 transition-colors active:text-ink disabled:opacity-25"
                    >
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewDraft(viewing + 1)}
                      disabled={viewing >= drafts.length - 1}
                      aria-label={t.workshopNextDraft}
                      className="grid h-8 w-7 shrink-0 place-items-center text-ink-3 transition-colors active:text-ink disabled:opacity-25"
                    >
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <p className="t-eyebrow truncate">{t.workshopDraftOf(viewing + 1, drafts.length)}</p>
                  </div>
                  {/* The bar keeps only what is about the workshop as a whole. What to do with the
                      draft on screen — take it, or ask again — sits with the draft itself. */}
                  <div className="flex shrink-0 items-center gap-3">
                    <button type="button" onClick={onClear} className={headerTextActionClass}>
                      {t.workshopStartOver}
                    </button>
                  </div>
                </div>
                {notes.length > 0 && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => setTrailOpen(open => !open)}
                      aria-expanded={trailOpen}
                      className="flex w-full items-center justify-between gap-3 py-1 text-left transition-colors active:text-ink"
                    >
                      <span className="font-serif-zh text-[14px] italic leading-none text-ink-3">{t.workshopTrail}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 shrink-0 text-ink-4 transition-transform ${trailOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {/* Each line is the note that produced the draft of the same index, so tapping
                        one jumps to what it made. Tapping the line you are already on opens it for
                        rewriting instead — the pencil marks the one that does that — and tapping it
                        again backs out. */}
                    {trailOpen && (
                      <div className="mt-2 border-l-2 border-rose-line pl-4">
                        {notes.map((line, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              if (editingRound === index) onCancelEdit()
                              else if (index === viewing) onEditRound(index)
                              else onViewDraft(index)
                            }}
                            aria-current={index === viewing}
                            aria-label={index === viewing ? `${line} — ${t.workshopEditAsk}` : undefined}
                            className={`flex w-full items-start gap-2 py-1 text-left font-serif-zh leading-6 transition-colors active:text-ink ${
                              index === viewing ? 'text-ink' : 'text-ink-3'
                            } ${index === 0 ? 'text-[15px]' : 'text-[14px] italic'}`}
                          >
                            <span className="min-w-0 flex-1">{index === 0 ? line : `+ ${line}`}</span>
                            {index === viewing && (
                              <Pencil
                                aria-hidden="true"
                                className={`mt-1 size-3.5 shrink-0 ${editingRound === index ? 'text-rose' : 'text-ink-4'}`}
                              />
                            )}
                          </button>
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

      <div className="page-width min-h-[60vh] px-6 pb-48 pt-6">
        {isBlocked ? (
          <p className="t-meta pt-16 text-center text-ink-3">{blockedMessage}</p>
        ) : isWorking ? (
          <SkeletonText lineClassName="h-4" lines={4} />
        ) : draft ? (
          <>
            {isEditing ? (
              <p className="t-meta mb-4 leading-6 text-ink-3">{t.workshopRedoNotice}</p>
            ) : isRevisingFromEarlier ? (
              <p className="t-meta mb-4 leading-6 text-ink-3">{t.workshopRevisingFromEarlier}</p>
            ) : null}
            <p className="whitespace-pre-wrap font-serif-zh text-[16px] leading-7 text-ink">{draft}</p>
            {/* Attached to the draft, because both are about this draft: take it to the builder, or
                spend the same ask again and see what else comes back. While the ask is being
                rewritten, running it again is the button in the composer — the same re-run, with
                the changed question — so the unchanged one steps aside rather than sitting there
                ready to throw the edit away. */}
            <div className="mt-6 flex items-center gap-2 border-t border-rose-line/60 pt-4">
              <button
                type="button"
                onClick={() => onWrite(draft)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-rose/50 bg-rose-pale px-4 font-serif-zh text-[15px] italic leading-none text-rose-deep transition-transform duration-200 active:translate-y-px"
              >
                {t.workshopWriteThis}
              </button>
              {!isEditing && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-line/80 px-4 font-serif-zh text-[15px] italic leading-none text-ink-2 transition-transform duration-200 active:translate-y-px active:bg-rose-tint/45"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4 text-ink-3" />
                  <span>{t.workshopRegenerate}</span>
                </button>
              )}
            </div>
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
            {/* The box looks the same whichever job it is doing, and the two differ in whether they
                add a round or overwrite one — so while it is rewriting, it says so, with the way
                back out beside it. */}
            {editingRound !== null && (
              <div className="flex items-center justify-between gap-3">
                <p className="t-eyebrow truncate">{t.workshopEditingRound(editingRound + 1)}</p>
                <button type="button" onClick={onCancelEdit} className={headerTextActionClass}>
                  {t.workshopCancelEdit}
                </button>
              </div>
            )}
            <textarea
              ref={noteRef}
              rows={1}
              value={note}
              onChange={event => onNoteChange(event.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="max-h-32 w-full resize-none overflow-y-auto rounded-2xl border border-rose-line bg-paper px-4 py-3 font-serif-zh text-[16px] italic leading-6 text-ink placeholder:text-ink-4 focus:border-rose/40 focus:outline-none focus:ring-2 focus:ring-rose/15"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 active:translate-y-px disabled:bg-ink-4/40 disabled:shadow-none"
            >
              {isWorking ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : isEditing ? (
                // The same mark the unchanged re-run carries, because it is the same operation.
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              )}
              <span>
                {isWorking ? copy.working : isEditing ? t.workshopRedo : hasDrafts ? copy.revise : copy.draftThis}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
