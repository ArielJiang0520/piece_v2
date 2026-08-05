import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ArrowUp, Sparkles } from 'lucide-react'
import { entityLabel, formatEndOfPiece } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import ProseBody, { proseTextClass, proseTextStyle } from '../../shared/ProseBody'
import MarkerRail, { revealMarker, type MarkerTick } from '../../shared/MarkerRail'
import { annotateParagraphs } from '../../generate/paragraphs'
import type { PieceAction, PieceStructure } from '../../shared/pieceStructure'

const END_REVEAL_DELAY_MS = 900

interface PieceViewProps {
  body: string
  // Recorded action history; when present the body renders as annotated paragraph blocks
  // with a marker at each action's paragraph. Null for legacy plain-text pieces.
  structure?: PieceStructure | null
  complete: boolean
  pieceMetaLabel: string | null
  pieceModelLabel: string | null
  // Non-null when the reader's taste profile shaped this piece; rendered as a meta line.
  pieceTasteLabel: string | null
  // Non-null when this piece was written with world additions switched on; names them, and says
  // so when that set no longer matches what is on (or has been deleted since).
  pieceAdditionsLabel: string | null
  pieceFooterStatsLabel: string | null
  pieceNumber: number | null
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
  // Pixels of sticky chrome (nav + tabs) above the reading area; the marker rail starts
  // below it so its ticks never sit under the header.
  railTopOffset: number
  onResume?: () => void
}

// The static reader for a saved (or empty) piece: meta header, prose body, and the
// end-of-piece footer with a back-to-top. No streaming, provider, or selection.
export default function PieceView({
  body,
  structure,
  complete,
  pieceMetaLabel,
  pieceModelLabel,
  pieceTasteLabel,
  pieceAdditionsLabel,
  pieceFooterStatsLabel,
  pieceNumber,
  readingFont,
  readingFontSize,
  railTopOffset,
  onResume,
}: PieceViewProps) {
  const language = useLanguageId()
  const t = useUiText()
  const [endRevealed, setEndRevealed] = useState(false)

  const annotated = useMemo(
    () => annotateParagraphs(body, structure?.segments ?? []),
    [structure, body],
  )
  const actionLabel = (action: PieceAction): string =>
    action === 'expand' ? t.markerExpanded
      : action === 'regenerate' ? t.markerContinuedFrom
        : t.markerContinued

  // Marker rail: this page scrolls with the window (not an internal container like the
  // generate overlay), so ticks are measured against the document and the rail is a fixed
  // overlay that only appears while the piece actually fills the viewport.
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hasMarkers = !!structure && structure.segments.length > 1
  const [railVisible, setRailVisible] = useState(false)
  const [railTicks, setRailTicks] = useState<MarkerTick[]>([])
  const [railView, setRailView] = useState({ top: 0, height: 1 })

  const measureRail = useCallback(() => {
    const root = wrapperRef.current
    if (!root || !structure) return
    const total = document.documentElement.scrollHeight || 1
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-marker-index]'))
    setRailTicks(
      els.map(el => {
        const segmentIndex = Number(el.dataset.markerIndex)
        const top = el.getBoundingClientRect().top + window.scrollY
        return {
          segmentIndex,
          label: actionLabel(structure.segments[segmentIndex]?.action ?? 'continue'),
          fraction: Math.min(1, Math.max(0, top / total)),
        }
      }),
    )
    setRailView({ top: window.scrollY / total, height: Math.min(1, window.innerHeight / total) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure])

  // Show the rail once the piece has scrolled up into the reading area and hide it again
  // above/below — so it never floats over the prompt card or the end-of-piece footer. Also
  // tracks the viewport band as the reader scrolls.
  useEffect(() => {
    if (!hasMarkers || !complete) {
      setRailVisible(false)
      return
    }
    const onScroll = () => {
      const el = wrapperRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const reading = rect.top < window.innerHeight * 0.4 && rect.bottom > railTopOffset + 60
      setRailVisible(reading)
      if (reading) {
        const total = document.documentElement.scrollHeight || 1
        setRailView({ top: window.scrollY / total, height: Math.min(1, window.innerHeight / total) })
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [hasMarkers, complete, railTopOffset])

  // Re-place the ticks against the real laid-out marker positions whenever the rail shows or
  // the rendered text/size changes.
  // `endRevealed` grows the document (the footer), which shifts every tick's fraction.
  useLayoutEffect(() => {
    if (railVisible) measureRail()
  }, [railVisible, body, structure, readingFont, readingFontSize, endRevealed, measureRail])

  const jumpToMarker = (segmentIndex: number) => {
    const el = wrapperRef.current?.querySelector<HTMLElement>(`[data-marker-index="${segmentIndex}"]`)
    if (el) revealMarker(el)
  }

  useEffect(() => {
    if (!complete) {
      setEndRevealed(false)
      return
    }
    const timer = setTimeout(() => setEndRevealed(true), END_REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [complete])

  const wrapperClass = 'relative min-h-[55vh] px-2 pb-2 pt-2 text-sm'

  if (!body) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-3 pb-5 text-ink-3">
          <span className="t-eyebrow shrink-0">{t.outputLabel}</span>
          <span aria-hidden="true" className="h-px flex-1 bg-rose-line/70" />
        </div>
        <div className="min-h-72 border-l border-rose-line/70 pl-5">
          <p
            className={proseTextClass(readingFont)}
            style={{ ...proseTextStyle(readingFontSize), color: 'var(--color-ink-4)' }}
          >
            {t.outputEmpty(entityLabel('piece', {}, language))}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <div>
        {complete && (pieceMetaLabel || onResume) && (
          <div className="fade-in-up mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {pieceMetaLabel && (
                <div className="t-meta flex items-center gap-3">
                  {pieceMetaLabel}
                </div>
              )}
              {pieceModelLabel && (
                <div className="t-meta mt-0.5 text-ink-4">
                  {pieceModelLabel}
                </div>
              )}
              {pieceTasteLabel && (
                <div className="t-meta mt-0.5 flex items-center gap-1 text-ink-4">
                  <Sparkles aria-hidden="true" className="h-3 w-3" />
                  {pieceTasteLabel}
                </div>
              )}
              {pieceAdditionsLabel && (
                <div className="t-meta mt-0.5 text-ink-4">
                  {pieceAdditionsLabel}
                </div>
              )}
            </div>
            {onResume && (
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-rose-line/80 bg-paper/80 px-3 font-serif-zh text-[13px] italic leading-none text-ink-3 transition-opacity active:opacity-70"
                onClick={onResume}
              >
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                {t.resume}
              </button>
            )}
          </div>
        )}
        {structure ? (
          <div>
            {annotated.map(paragraph => (
              // The index is read off the DOM on Resume so the generate screen opens on the
              // paragraph the reader was actually looking at.
              <div key={paragraph.index} data-paragraph-index={paragraph.index} className="mb-4 last:mb-0">
                {paragraph.action && paragraph.segmentIndex != null && (
                  <div className="mb-1.5">
                    <span
                      data-marker-index={paragraph.segmentIndex}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 font-serif-zh text-[12px] italic leading-none text-ink-3 transition-[box-shadow]"
                    >
                      <span className="shrink-0 text-ink-4">{actionLabel(paragraph.action)}</span>
                      {paragraph.direction && <span className="truncate">“{paragraph.direction}”</span>}
                    </span>
                  </div>
                )}
                <p
                  className={proseTextClass(readingFont)}
                  style={proseTextStyle(readingFontSize)}
                >
                  {paragraph.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <ProseBody text={body} readingFont={readingFont} readingFontSize={readingFontSize} />
        )}
        {endRevealed && (
          <div className="fade-in-up mt-10">
            <div className="t-meta flex justify-center">
              <span className="flex shrink-0 flex-col items-center gap-1 text-center">
                <span>{formatEndOfPiece(pieceNumber, language)}</span>
                {pieceFooterStatsLabel && (
                  <span className="text-[12px] leading-none text-ink-4">
                    {pieceFooterStatsLabel}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-line bg-paper px-4 font-serif-zh text-[15px] italic text-rose-deep transition-colors hover:border-rose/40 hover:bg-rose-pale focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
                <span>{t.backToTop}</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {railVisible && railTicks.length > 0 && createPortal(
        <MarkerRail
          ticks={railTicks}
          view={railView}
          onJump={jumpToMarker}
          // Fixed over the page, below the sticky nav/controls (which mask its top) and
          // starting under the header chrome so ticks never land on the nav.
          containerClassName="pointer-events-none fixed left-0 bottom-3 z-[5] w-8 pl-[env(safe-area-inset-left)]"
          containerStyle={{ top: railTopOffset }}
        />,
        document.body,
      )}
    </div>
  )
}
