import { useMemo } from 'react'
import { Heart, RotateCw } from 'lucide-react'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { useUiText } from '@/i18n'
import type { GenerationPhase } from '@/hooks/useGeneration'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import ProseBody, { ProseText, proseTextClass, proseTextStyle } from '../../shared/ProseBody'
import { annotateParagraphs } from '../paragraphs'
import type { PieceAction, PieceSegment } from '../../shared/pieceStructure'

interface GenerateOutputProps {
  output: string
  // Live decomposition of `output` into action segments. The first is the origin; each
  // later one begins where an action was performed and drives a boundary marker.
  segments: PieceSegment[]
  phase: GenerationPhase
  streaming: boolean
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
  // When selectable, the body renders as individually tappable paragraph blocks
  // (for "Expand") instead of the streaming token-fade.
  selectable: boolean
  selectedParagraphIndex: number | null
  onSelectParagraph: (index: number | null) => void
  // Snippets liked this session (trimmed paragraph text) — a liked paragraph shows a badge.
  // The action controls themselves live in the docked bar below, keyed to the selection.
  likedSnippets: Set<string>
  // Re-run the action recorded at a boundary marker (segment index), replacing downstream.
  onRerunSegment: (segmentIndex: number) => void
}

// The live generation surface inside the overlay: the streaming body (token-fade, or
// selectable paragraphs while paused/finished), with a marker at each action boundary so
// the reader sees in real time where they expanded/continued. Provider/model meta lives in
// the pinned top bar. It ends silently — no meta header, stats, footer, or back-to-top.
export default function GenerateOutput({
  output,
  segments,
  phase,
  streaming,
  readingFont,
  readingFontSize,
  selectable,
  selectedParagraphIndex,
  onSelectParagraph,
  likedSnippets,
  onRerunSegment,
}: GenerateOutputProps) {
  const t = useUiText()
  const annotated = useMemo(
    () => (selectable ? annotateParagraphs(output, segments) : []),
    [output, selectable, segments],
  )

  // Keep the trailing room constant whether streaming or finished. While streaming the
  // view is pinned to scrollHeight, so collapsing this pad when generation stops would
  // shrink scrollHeight and yank the text down to the bottom edge (an abrupt scroll +
  // jitter). A steady pad leaves room underneath the last line and never jumps. The pad
  // also sets where the live line sits: since the content bottom (pad included) is pinned
  // to the viewport bottom, a smaller pad lets the newest line ride lower on screen.
  const wrapperClass = 'relative min-h-[55vh] px-2 pt-2 pb-[25vh] text-sm'

  if (phase === 'waiting_provider' && streaming && !output) {
    return (
      <div className={wrapperClass} aria-busy="true">
        <div className="pt-2">
          <Skeleton className="mb-5 h-3 w-28" />
          <SkeletonText className="max-w-3xl" lineClassName="h-4" lines={4} />
          <SkeletonText className="mt-6 max-w-2xl" lineClassName="h-4" lines={3} />
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <div>
        {selectable ? (
          <div>
            {annotated.map(paragraph => {
              const selected = selectedParagraphIndex === paragraph.index
              const liked = likedSnippets.has(paragraph.text.trim())
              return (
                <div key={paragraph.index} data-paragraph-index={paragraph.index} className="mb-4 last:mb-0">
                  {paragraph.action && paragraph.segmentIndex != null && (
                    <ActionMarker
                      segmentIndex={paragraph.segmentIndex}
                      action={paragraph.action}
                      direction={paragraph.direction ?? ''}
                      onRerun={() => onRerunSegment(paragraph.segmentIndex!)}
                    />
                  )}
                  <p
                    className={`${proseTextClass(readingFont)} -mx-2 cursor-pointer rounded-md px-2 py-1 transition-colors ${selected ? 'bg-paper-2' : 'active:bg-paper-2'}`}
                    style={proseTextStyle(readingFontSize)}
                    onClick={() => onSelectParagraph(selected ? null : paragraph.index)}
                  >
                    <ProseText text={paragraph.text} />
                  </p>
                  {liked && (
                    <div className="mt-1 flex items-center gap-1 text-ink-4">
                      <Heart aria-hidden="true" className="h-3 w-3 fill-current" />
                      <span className="t-meta">{t.tasteYouLiked}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          // One ProseBody per segment so the streaming tail keeps fading its new tokens while
          // earlier segments sit static beneath their markers. A single-segment (fresh) run
          // is just one ProseBody over the whole body — the original behavior.
          <div>
            {segments.map((segment, i) => (
              <div key={i}>
                {i > 0 && (
                  <ActionMarker segmentIndex={i} action={segment.action} direction={segment.direction} onRerun={() => onRerunSegment(i)} />
                )}
                <ProseBody text={segment.text} readingFont={readingFont} readingFontSize={readingFontSize} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// A tappable chip marking where an action was performed: tapping re-runs that action with
// its saved direction. The rotate icon signals it's re-runnable (no hover on touch).
// `data-marker-index` (the segment index) lets the marker rail resolve this chip to scroll
// to and briefly flash it when its tick is tapped.
function ActionMarker({ segmentIndex, action, direction, onRerun }: { segmentIndex: number; action: PieceAction; direction: string; onRerun: () => void }) {
  const t = useUiText()
  const label = action === 'expand' ? t.markerExpanded : action === 'regenerate' ? t.markerContinuedFrom : t.markerContinued
  return (
    <div className="mb-1.5">
      <button
        type="button"
        data-marker-index={segmentIndex}
        aria-label={`${t.rerun} · ${label}`}
        onClick={onRerun}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 font-serif-zh text-[12px] italic leading-none text-ink-3 transition-[box-shadow,background-color] active:bg-paper-3"
      >
        <span className="shrink-0 text-ink-4">{label}</span>
        {direction && <span className="truncate">“{direction}”</span>}
        <RotateCw aria-hidden="true" className="h-3 w-3 shrink-0 text-ink-4" />
      </button>
    </div>
  )
}
