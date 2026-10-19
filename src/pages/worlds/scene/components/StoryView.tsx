import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ArrowUp, FileText, History } from 'lucide-react'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import ProseBody, { ProseText, proseTextClass, proseTextStyle } from '../../shared/ProseBody'
import MarkerRail, { revealMarker, type MarkerTick } from '../../shared/MarkerRail'
import { annotateParagraphs } from '../../generate/paragraphs'
import type { StoryAction, StoryStructure } from '../../shared/storyStructure'

const END_REVEAL_DELAY_MS = 900

interface StoryViewProps {
  body: string
  // Recorded action history; when present the body renders as annotated paragraph blocks
  // with a marker at each action's paragraph. Null for legacy plain-text stories.
  structure?: StoryStructure | null
  complete: boolean
  storyMetaLabel: string | null
  storyModelLabel: string | null
  storyFooterStatsLabel: string | null
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
  // Pixels of sticky chrome (nav + tabs) above the reading area; the marker rail starts
  // below it so its ticks never sit under the header.
  railTopOffset: number
  onResume?: () => void
  // The scene changed after this story was written: it reads as usual, but Resume is greyed out.
  outdated?: boolean
}

// The static reader for a saved (or empty) story: meta header, prose body, and the
// end-of-story footer with a back-to-top. No streaming, provider, or selection.
export default function StoryView({
  body,
  structure,
  complete,
  storyMetaLabel,
  storyModelLabel,
  storyFooterStatsLabel,
  readingFont,
  readingFontSize,
  railTopOffset,
  onResume,
  outdated = false,
}: StoryViewProps) {
  const language = useLanguageId()
  const t = useUiText()
  const [endRevealed, setEndRevealed] = useState(false)

  const annotated = useMemo(
    () => annotateParagraphs(body, structure?.segments ?? []),
    [structure, body],
  )
  const actionLabel = (action: StoryAction): string =>
    action === 'expand' ? t.markerExpanded
      : action === 'regenerate' ? t.markerContinuedFrom
        : t.markerContinued

  // Marker rail: this page scrolls with the window (not an internal container like the
  // generate overlay), so ticks are measured against the document and the rail is a fixed
  // overlay that only appears while the story actually fills the viewport.
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

  // Show the rail once the story has scrolled up into the reading area and hide it again
  // above/below — so it never floats over the scene card or the end-of-story footer. Also
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

  const wrapperClass = 'relative min-h-[55vh] px-2 pb-4 pt-4 text-sm'

  if (!body) {
    return (
      <div className={wrapperClass}>
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-6 text-center">
          <FileText aria-hidden="true" className="h-8 w-8 text-ink-4" />
          <p className="t-body mt-3 text-ink-3">{t.outputEmpty}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <div>
        {complete && (storyMetaLabel || onResume || outdated) && (
          <div className="fade-in-up mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
            <div className="min-w-0">
              {storyMetaLabel && (
                <div className="text-[13px] font-semibold text-ink-2">
                  {storyMetaLabel}
                </div>
              )}
              {storyModelLabel && (
                <div className="t-meta">
                  {storyModelLabel}
                </div>
              )}
            </div>
            {outdated ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled>
                <History aria-hidden="true" />
                {t.outdated}
              </button>
            ) : onResume && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onResume}>
                <ArrowRight aria-hidden="true" />
                {t.resume}
              </button>
            )}
          </div>
        )}
        {complete && outdated && (
          <p className="t-hint -mt-2 mb-4">{t.outdatedHint}</p>
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
                      className="badge max-w-full font-medium text-ink-3 transition-[box-shadow]"
                    >
                      <span className="shrink-0 font-semibold text-ink-2">{actionLabel(paragraph.action)}</span>
                      {paragraph.direction && <span className="truncate">“{paragraph.direction}”</span>}
                    </span>
                  </div>
                )}
                <p
                  className={proseTextClass(readingFont)}
                  style={proseTextStyle(readingFontSize)}
                >
                  <ProseText text={paragraph.text} />
                </p>
              </div>
            ))}
          </div>
        ) : (
          <ProseBody text={body} readingFont={readingFont} readingFontSize={readingFontSize} />
        )}
        {endRevealed && (
          <div className="fade-in-up mt-10">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
              <span className="flex shrink-0 flex-col items-center gap-0.5 text-center">
                <span className="text-[13px] font-semibold text-ink-2">{t.end}</span>
                {storyFooterStatsLabel && (
                  <span className="t-meta">{storyFooterStatsLabel}</span>
                )}
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <ArrowUp aria-hidden="true" />
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
