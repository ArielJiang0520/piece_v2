import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReadingFont } from '@/preferences/readingFont'
import { READING_FONT_BY_ID } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import { READING_FONT_SIZE_BY_ID } from '@/preferences/readingFontSize'
import { entityLabel } from '@/config'

const END_REVEAL_DELAY_MS = 900
const OUTPUT_TOKEN_RE = /\s+|[^\s]+/g

interface OutputPanelProps {
  output: string
  streaming: boolean
  displayComplete: boolean
  pieceMetaLabel: string | null
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
}

export default function OutputPanel({
  output,
  streaming,
  displayComplete,
  pieceMetaLabel,
  readingFont,
  readingFontSize,
}: OutputPanelProps) {
  const [endRevealed, setEndRevealed] = useState(false)
  const [outputRun, setOutputRun] = useState(0)
  const previousOutputRef = useRef('')
  const previousTokenCountRef = useRef(0)
  const outputTokens = useMemo(() => output.match(OUTPUT_TOKEN_RE) ?? [], [output])

  useEffect(() => {
    if (output && previousOutputRef.current && !output.startsWith(previousOutputRef.current)) {
      setOutputRun(run => run + 1)
    }
    previousOutputRef.current = output
    previousTokenCountRef.current = outputTokens.length
  }, [output, outputTokens.length])

  useEffect(() => {
    if (!displayComplete) {
      setEndRevealed(false)
      return
    }
    const timer = setTimeout(() => setEndRevealed(true), END_REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [displayComplete])

  const wrapperClass = [
    'min-h-[55vh] px-2 pt-4 text-sm transition-[padding-bottom] duration-200 ease-out',
    streaming ? 'pb-[45vh]' : 'pb-2',
  ].join(' ')
  const previousTokenCount = previousTokenCountRef.current
  const outputTextClass = [
    'whitespace-pre-wrap',
    READING_FONT_BY_ID[readingFont].outputClass,
  ].join(' ')
  const outputTextStyle = READING_FONT_SIZE_BY_ID[readingFontSize].outputStyle

  if (!output) {
    return <div className={wrapperClass} />
  }

  return (
    <div className={wrapperClass}>
      <div>
        {displayComplete && pieceMetaLabel && (
          <div className="fade-in-up t-meta mb-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-rose-line" />
            <span>{pieceMetaLabel}</span>
            <span className="h-px flex-1 bg-rose-line" />
          </div>
        )}
        <p className={outputTextClass} style={outputTextStyle}>
          {outputTokens.map((token, index) => {
            if (/^\s+$/.test(token)) return token
            const animationDelay = index >= previousTokenCount
              ? `${Math.min(index - previousTokenCount, 12) * 35}ms`
              : undefined
            return (
              <span
                key={`${outputRun}-${index}`}
                className="streamed-word-fade"
                style={animationDelay ? { animationDelay } : undefined}
              >
                {token}
              </span>
            )
          })}
        </p>
        {endRevealed && (
          <div className="fade-in-up mt-10">
            <div className="t-meta flex items-center gap-3">
              <span className="h-px flex-1 bg-rose-line" />
              <span>End</span>
              <span className="h-px flex-1 bg-rose-line" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
