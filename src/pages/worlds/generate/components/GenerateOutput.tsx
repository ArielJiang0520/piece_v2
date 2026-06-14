import { useMemo, type ReactNode } from 'react'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import type { GenerationPhase } from '@/hooks/useGeneration'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import ProseBody, { proseTextClass, proseTextStyle } from '../../shared/ProseBody'
import { splitParagraphs } from '../paragraphs'

interface GenerateOutputProps {
  output: string
  phase: GenerationPhase
  streaming: boolean
  provider: string
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
  // When selectable, the body renders as individually tappable paragraph blocks
  // (for "Expand") instead of the streaming token-fade.
  selectable: boolean
  selectedParagraphIndex: number | null
  onSelectParagraph: (index: number | null) => void
  renderParagraphAction: (index: number) => ReactNode
}

// The live generation surface inside the overlay: a provider line and the streaming
// body (token-fade, or selectable paragraphs while paused/finished). It ends
// silently — no meta header, stats, footer, or back-to-top.
export default function GenerateOutput({
  output,
  phase,
  streaming,
  provider,
  readingFont,
  readingFontSize,
  selectable,
  selectedParagraphIndex,
  onSelectParagraph,
  renderParagraphAction,
}: GenerateOutputProps) {
  const paragraphs = useMemo(() => (selectable ? splitParagraphs(output) : []), [output, selectable])

  // Keep the trailing room constant whether streaming or finished. While streaming the
  // view is pinned to scrollHeight, so collapsing this pad when generation stops would
  // shrink scrollHeight and yank the text down to the bottom edge (an abrupt scroll +
  // jitter). A steady pad leaves room underneath the last line and never jumps.
  const wrapperClass = 'relative min-h-[55vh] px-2 pt-2 pb-[45vh] text-sm'

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
        {provider && (
          <div className="fade-in-up t-meta mb-4 flex items-center gap-3">
            Provider: {provider}
          </div>
        )}
        {selectable ? (
          <div>
            {paragraphs.map(paragraph => {
              const selected = selectedParagraphIndex === paragraph.index
              return (
                <div key={paragraph.index} className="mb-4 last:mb-0">
                  <p
                    className={`${proseTextClass(readingFont)} -mx-2 cursor-pointer rounded-md px-2 py-1 transition-colors ${selected ? 'bg-rose-pale' : 'active:bg-paper-2'}`}
                    style={proseTextStyle(readingFontSize)}
                    onClick={() => onSelectParagraph(selected ? null : paragraph.index)}
                  >
                    {paragraph.text}
                  </p>
                  {selected && renderParagraphAction(paragraph.index)}
                </div>
              )
            })}
          </div>
        ) : (
          <ProseBody text={output} readingFont={readingFont} readingFontSize={readingFontSize} />
        )}
      </div>
    </div>
  )
}
