import { memo, useEffect, useMemo, useRef, useState } from 'react'
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

// One line of slack before text is frozen into its settled form: a line's words have to
// finish fading before the line stops being rendered as animatable spans.
const SETTLE_HOLD_LINES = 1

/**
 * Index at which the still-settling region begins — the start of the line `hold` lines above
 * the one currently being written.
 *
 * Text before it can no longer change: a token never spans whitespace, and an emphasis run
 * never crosses a line (see EMPHASIS_RE), so nothing arriving later can alter how it parses.
 * That makes it safe to render as plain text rather than per-word spans.
 *
 * Searched backwards from the end, so the cost tracks the tail rather than the whole piece.
 */
function settledEnd(text: string, hold: number): number {
  let i = text.length
  for (let n = 0; n <= hold; n++) {
    if (i <= 0) return 0
    const newline = text.lastIndexOf('\n', i - 1)
    if (newline === -1) return 0
    // Step back over the entire whitespace run this newline belongs to, so the boundary is
    // never placed inside one — a whitespace token split across the two halves would render
    // the same but shift every token index behind it.
    i = newline
    while (i > 0 && /\s/.test(text[i - 1])) i--
  }
  let end = i
  while (end < text.length && /\s/.test(text[end])) end++
  return end
}

// The same emphasis, without the per-word fade: for prose that is already on screen — a saved
// take's paragraphs, or a finished run's — rather than text arriving token by token. Both of
// those render their own <p> (they carry tap targets and markers), so this fills one in.
// Memoized for the same reason ProseBody is: it carries the settled body of a streaming
// piece, which changes only when a line settles, not on every render of the screen around it.
export const ProseText = memo(function ProseText({ text }: { text: string }) {
  const segments = useMemo(() => splitEmphasis(text), [text])
  return (
    <>
      {segments.map((segment, index) =>
        segment.emphasis ? <em key={index}>{segment.text}</em> : segment.text,
      )}
    </>
  )
})

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
//
// Memoized because the generate screen re-renders on every arriving SSE chunk, while the
// text here only changes at the (much slower) paced reveal. Without this, each chunk
// rebuilds and re-diffs one element per word of the whole story for no visual change. All
// three props are primitives, so the shallow compare is exact.
const ProseBody = memo(function ProseBody({ text, readingFont, readingFontSize }: ProseBodyProps) {
  const [outputRun, setOutputRun] = useState(0)
  const previousTextRef = useRef('')
  const previousLengthRef = useRef(0)

  // Read before the effect updates them: what was on screen as of the last render.
  const previousText = previousTextRef.current
  const previousLength = previousLengthRef.current

  // A body that arrived whole rather than streaming in — a saved piece, a resumed take, a
  // different piece replacing this one — has no arrival to animate, so all of it is settled.
  const arrivedWhole = previousLength === 0 || !text.startsWith(previousText)
  const boundary = arrivedWhole ? text.length : settledEnd(text, SETTLE_HOLD_LINES)
  const settled = text.slice(0, boundary)

  // Only the couple of lines still settling are tokenized, and only they become spans. This
  // is the work that used to run across the whole piece on every tick of the paced reveal:
  // the settled body is a handful of text nodes, so neither React nor the layout engine walks
  // it again to put one more character on screen.
  const tail = useMemo(() => {
    let at = boundary
    return tokenize(text.slice(boundary)).map(token => {
      const start = at
      at += token.text.length
      return { ...token, start }
    })
  }, [text, boundary])

  useEffect(() => {
    // A buffer that isn't a continuation of the last one (e.g. a different piece)
    // re-keys the spans so nothing inherits a previous body's element.
    if (text && previousTextRef.current && !text.startsWith(previousTextRef.current)) {
      setOutputRun(run => run + 1)
    }
    previousTextRef.current = text
    previousLengthRef.current = text.length
  }, [text])

  // The first token that wasn't on screen last render — the entrance stagger counts from it.
  const firstNew = tail.findIndex(token => token.start >= previousLength)

  return (
    <p className={proseTextClass(readingFont)} style={proseTextStyle(readingFontSize)}>
      {boundary > 0 && <ProseText text={settled} />}
      {tail.map((token, index) => {
        if (/^\s+$/.test(token.text)) return token.text
        const animationDelay = firstNew !== -1 && index >= firstNew
          ? `${Math.min(index - firstNew, 12) * 35}ms`
          : undefined
        const Tag = token.emphasis ? 'em' : 'span'
        return (
          <Tag
            // Keyed by absolute offset, not position in the tail: the tail's start moves
            // forward as lines settle, so a positional key would hand a word that is still
            // fading over to a different word's element.
            key={`${outputRun}-${token.start}`}
            className="streamed-word-fade"
            style={animationDelay ? { animationDelay } : undefined}
          >
            {token.text}
          </Tag>
        )
      })}
    </p>
  )
})

export default ProseBody
