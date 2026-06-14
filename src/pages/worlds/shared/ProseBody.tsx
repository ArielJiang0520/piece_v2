import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReadingFont } from '@/preferences/readingFont'
import { READING_FONT_BY_ID } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import { READING_FONT_SIZE_BY_ID } from '@/preferences/readingFontSize'

const OUTPUT_TOKEN_RE = /\s+|[^\s]+/g

export function proseTextClass(readingFont: ReadingFont): string {
  return ['whitespace-pre-wrap', READING_FONT_BY_ID[readingFont].outputClass].join(' ')
}

export function proseTextStyle(readingFontSize: ReadingFontSize) {
  return READING_FONT_SIZE_BY_ID[readingFontSize].outputStyle
}

interface ProseBodyProps {
  text: string
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
}

// Prose rendered as word tokens that fade in: while streaming, only the
// newly-arrived tokens animate; a freshly-loaded body fades in once. Shared by the
// live generate output and the static piece reader so both read identically.
export default function ProseBody({ text, readingFont, readingFontSize }: ProseBodyProps) {
  const [outputRun, setOutputRun] = useState(0)
  const previousTextRef = useRef('')
  const previousTokenCountRef = useRef(0)
  const tokens = useMemo(() => text.match(OUTPUT_TOKEN_RE) ?? [], [text])

  useEffect(() => {
    // A buffer that isn't a continuation of the last one (e.g. a different piece)
    // re-keys the spans so the whole body fades in afresh.
    if (text && previousTextRef.current && !text.startsWith(previousTextRef.current)) {
      setOutputRun(run => run + 1)
    }
    previousTextRef.current = text
    previousTokenCountRef.current = tokens.length
  }, [text, tokens.length])

  // Read before the effect updates it: holds the previous render's token count, so
  // only tokens beyond it (the ones that just streamed in) get an entrance delay.
  const previousTokenCount = previousTokenCountRef.current

  return (
    <p className={proseTextClass(readingFont)} style={proseTextStyle(readingFontSize)}>
      {tokens.map((token, index) => {
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
  )
}
