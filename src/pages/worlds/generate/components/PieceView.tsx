import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { entityLabel, formatEndOfPiece } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import ProseBody, { proseTextClass, proseTextStyle } from './ProseBody'

const END_REVEAL_DELAY_MS = 900

interface PieceViewProps {
  body: string
  complete: boolean
  pieceMetaLabel: string | null
  pieceModelLabel: string | null
  pieceFooterStatsLabel: string | null
  pieceNumber: number | null
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
}

// The static reader for a saved (or empty) piece: meta header, prose body, and the
// end-of-piece footer with a back-to-top. No streaming, provider, or selection.
export default function PieceView({
  body,
  complete,
  pieceMetaLabel,
  pieceModelLabel,
  pieceFooterStatsLabel,
  pieceNumber,
  readingFont,
  readingFontSize,
}: PieceViewProps) {
  const language = useLanguageId()
  const t = useUiText()
  const [endRevealed, setEndRevealed] = useState(false)

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
    <div className={wrapperClass}>
      <div>
        {complete && pieceMetaLabel && (
          <div className="fade-in-up mb-4">
            <div className="t-meta flex items-center gap-3">
              {pieceMetaLabel}
            </div>
            {pieceModelLabel && (
              <div className="t-meta mt-0.5 text-ink-4">
                {pieceModelLabel}
              </div>
            )}
          </div>
        )}
        <ProseBody text={body} readingFont={readingFont} readingFontSize={readingFontSize} />
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
            <div className="mt-8 flex justify-center">
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
    </div>
  )
}
