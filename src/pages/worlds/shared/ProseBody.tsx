import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReadingFont } from '@/preferences/readingFont'
import { READING_FONT_BY_ID } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'
import { READING_FONT_SIZE_BY_ID } from '@/preferences/readingFontSize'

const OUTPUT_TOKEN_RE = /\s+|[^\s]+/g
// Models write markdown emphasis into prose — a boat's name, a line the character remembers.
// Render it as emphasis instead of showing the asterisks. Only a closed pair counts, so a marker
// still streaming in reads literally until its partner arrives rather than swallowing the words
// behind it, and a run never crosses a line break (a lone asterisk on its own line is not emphasis).
const EMPHASIS_RE = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g

interface ProseSegment {
  text: string
  emphasis: boolean
}

function splitEmphasis(text: string): ProseSegment[] {
  const segments: ProseSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  EMPHASIS_RE.lastIndex = 0
  while ((match = EMPHASIS_RE.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), emphasis: false })
    segments.push({ text: match[1] ?? match[2] ?? '', emphasis: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), emphasis: false })

  return segments
}

function tokenize(text: string): ProseSegment[] {
  const tokens: ProseSegment[] = []
  for (const segment of splitEmphasis(text)) {
    for (const token of segment.text.match(OUTPUT_TOKEN_RE) ?? []) {
      tokens.push({ text: token, emphasis: segment.emphasis })
    }
  }
  return tokens
}

// The same emphasis, without the per-word fade: for prose that is already on screen — a saved
// take's paragraphs, or a finished run's — rather than text arriving token by token. Both of
// those render their own <p> (they carry tap targets and markers), so this fills one in.
export function ProseText({ text }: { text: string }) {
  const segments = useMemo(() => splitEmphasis(text), [text])
  return (
    <>
      {segments.map((segment, index) =>
        segment.emphasis ? <em key={index}>{segment.text}</em> : segment.text,
      )}
    </>
  )
}

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
  const tokens = useMemo(() => tokenize(text), [text])

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
        if (/^\s+$/.test(token.text)) return token.text
        const animationDelay = index >= previousTokenCount
          ? `${Math.min(index - previousTokenCount, 12) * 35}ms`
          : undefined
        const Tag = token.emphasis ? 'em' : 'span'
        return (
          <Tag
            key={`${outputRun}-${index}`}
            className="streamed-word-fade"
            style={animationDelay ? { animationDelay } : undefined}
          >
            {token.text}
          </Tag>
        )
      })}
    </p>
  )
}
