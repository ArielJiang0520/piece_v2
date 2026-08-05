import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Sparkles } from 'lucide-react'
import { apiFetch } from '@/api'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { useWorldAdditions } from '../../shared/useWorldAdditions'

// AI help while editing a prompt, as an inspector over the editor rather than a screen of its own.
// The prompt stays on the page above this sheet the whole time, and a pass is written straight into
// it — so the writer watches their own text change instead of reading a draft in another room. There
// is nothing to "take" back, and nothing to hand over: the editor is the only copy of the text.
//
// One ask, one result. The sheet keeps no trail of its own: asking again works off whatever is in
// the editor now, and stepping back is the Revert action on the page, not a gallery in here.
const headerTextActionClass =
  'inline-flex h-8 shrink-0 items-center justify-center px-1 font-serif-zh text-[14px] italic leading-none text-ink-3 underline decoration-ink-4/50 underline-offset-4 transition-colors duration-200 active:text-ink disabled:pointer-events-none disabled:opacity-40'

interface ReworkSheetProps {
  worldId: string | undefined
  // The text as it stands in the editor right now, not the saved row — a half-typed edit is what
  // the writer wants worked on.
  text: string
  // A fresh pass: the editor takes the draft and keeps what it had, so it can be reverted to.
  onPass: (draft: string) => void
  // The same ask run again: the editor takes this draft in place of the one it just took, so the
  // two together are still a single step back.
  onTryAgain: (draft: string) => void
  onClose: () => void
}

export default function ReworkSheet({ worldId, text, onPass, onTryAgain, onClose }: ReworkSheetProps) {
  const t = useUiText()
  const language = useLanguageId()
  const entityLabelSingular = entityLabel('prompt', {}, language)
  // A pass reads the same world the piece will be written against, additions included.
  const { activeIds: additionIds } = useWorldAdditions(worldId)

  const [note, setNote] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The ask behind the text now on the page, so it can be run again. Held as the anchor it worked
  // from, not the draft it produced — running it again must start where it started.
  const [lastAsk, setLastAsk] = useState<{ text: string; note: string } | null>(null)

  // What this sheet last wrote into the editor. The moment the text differs from it the writer has
  // typed over the pass, and re-running the old ask would throw that away — so the offer goes.
  const passedTextRef = useRef<string | null>(null)
  useEffect(() => {
    if (passedTextRef.current === null || text === passedTextRef.current) return
    passedTextRef.current = null
    setLastAsk(null)
  }, [text])

  // The composer grows with the text instead of scrolling a one-line field out of sight, capped by
  // max-height so a long note can never push the prompt it is about off the screen.
  const noteRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = noteRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [note])

  const trimmedNote = note.trim()
  // Nothing need be typed: the writer tapped Rework on their own text, and that is the brief. A
  // note only says what to change about it — with none, the server stands in a first turn.
  const canSubmit = !!text.trim() && !isWorking

  async function requestPass(anchor: string, ask: string) {
    return (await apiFetch(`/api/worlds/${worldId}/rework`, {
      method: 'POST',
      body: JSON.stringify({
        text: anchor,
        notes: ask ? [ask] : [],
        drafts: [],
        additionIds,
      }),
    })) as { draft: string }
  }

  async function runPass() {
    if (!worldId || !canSubmit) return
    const anchor = text
    setError(null)
    setIsWorking(true)
    try {
      const res = await requestPass(anchor, trimmedNote)
      passedTextRef.current = res.draft
      setLastAsk({ text: anchor, note: trimmedNote })
      setNote('')
      onPass(res.draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.reworkError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  // The same ask, run again, in place of what it produced the first time. Nothing new is said, and
  // the editor's step back still lands on the text the ask started from.
  async function runTryAgain() {
    if (!worldId || isWorking || !lastAsk) return
    setError(null)
    setIsWorking(true)
    try {
      const res = await requestPass(lastAsk.text, lastAsk.note)
      passedTextRef.current = res.draft
      onTryAgain(res.draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.reworkError(entityLabelSingular))
    } finally {
      setIsWorking(false)
    }
  }

  const hasPassed = !!lastAsk
  const placeholder = hasPassed ? t.workshopNotePlaceholder : t.reworkSeedPlaceholder

  // Docked to the bottom with no backdrop: dimming the page would hide the one thing this sheet
  // exists to keep in view. It closes by its own Close action or by tapping Rework again.
  return createPortal(
    <div
      className="sheet-slide-up fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-rose-line bg-paper/95 shadow-[0_-24px_70px_rgba(26,18,16,0.22)] backdrop-blur"
      role="dialog"
      aria-label={t.rework}
    >
      <div className="page-width flex flex-col px-5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="t-eyebrow">{t.rework}</p>
          <button type="button" className={headerTextActionClass} onClick={onClose}>
            {t.close}
          </button>
        </div>

        {!hasPassed && (
          <p className="t-meta mt-1 mb-3 leading-6 text-ink-3">{t.reworkEmptyHint(entityLabelSingular)}</p>
        )}

        <textarea
          ref={noteRef}
          rows={1}
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`max-h-32 w-full resize-none overflow-y-auto rounded-2xl border border-rose-line bg-paper px-4 py-3 font-serif-zh text-[16px] italic leading-6 text-ink placeholder:text-ink-4 focus:border-rose/40 focus:outline-none focus:ring-2 focus:ring-rose/15 ${hasPassed ? 'mt-3' : ''}`}
        />

        <button
          type="button"
          onClick={runPass}
          disabled={!canSubmit}
          // Tinted, not solid rose: the page's own CTA ("First take") is right behind this sheet,
          // and two full-weight pink buttons on one screen read as rivals. This is the action
          // inside the sheet, so it carries the rose family at a lower weight.
          className="mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-rose/45 bg-rose-pale px-5 font-serif-zh text-[15px] italic leading-none text-rose-deep transition-all duration-200 active:translate-y-px active:bg-rose-tint/60 disabled:border-rose-line disabled:bg-paper-2 disabled:text-ink-4"
        >
          {isWorking ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" className="h-4 w-4" />
          )}
          <span>{isWorking ? t.workshopWorking : hasPassed ? t.workshopRevise : t.reworkDraftThis}</span>
        </button>

        {hasPassed && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={runTryAgain}
              disabled={isWorking}
              className={`${headerTextActionClass} mt-1.5`}
            >
              {t.workshopRegenerate}
            </button>
          </div>
        )}

        {error && <p className="t-meta mt-3 text-center text-rose">{error}</p>}
      </div>
    </div>,
    document.body,
  )
}
