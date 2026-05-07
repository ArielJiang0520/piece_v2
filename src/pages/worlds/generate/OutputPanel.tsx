import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { entityLabel } from '../../../config'
import type { ReadingFont } from '../../../preferences/readingFont'
import { READING_FONT_BY_ID } from '../../../preferences/readingFont'
import type { ReadingFontSize } from '../../../preferences/readingFontSize'
import { READING_FONT_SIZE_BY_ID } from '../../../preferences/readingFontSize'

const END_REVEAL_DELAY_MS = 900
const OUTPUT_TOKEN_RE = /\s+|[^\s]+/g
const CJK_CHARACTER_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu
const WORD_RE = /[\p{Letter}\p{Number}]+(?:'[\p{Letter}\p{Number}]+)*/gu

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface SaveResponse {
  promptId: number
  pieceId: number
  pieceCount: number
  isNewPrompt: boolean
}

interface OutputPanelProps {
  output: string
  streaming: boolean
  displayComplete: boolean
  pieceNumber: number
  isFirstTake: boolean
  saveState: SaveState
  saveResult: SaveResponse | null
  restoredSavedDisplay?: boolean
  readingFont: ReadingFont
  readingFontSize: ReadingFontSize
}

export default function OutputPanel({
  output,
  streaming,
  displayComplete,
  pieceNumber,
  isFirstTake,
  saveState,
  saveResult,
  restoredSavedDisplay = false,
  readingFont,
  readingFontSize,
}: OutputPanelProps) {
  const [endRevealed, setEndRevealed] = useState(false)
  const [outputRun, setOutputRun] = useState(0)
  const [displayElapsedMs, setDisplayElapsedMs] = useState<number | null>(null)
  const previousOutputRef = useRef('')
  const previousTokenCountRef = useRef(0)
  const displayStartedAtRef = useRef<number | null>(null)
  const lastRecordedElapsedMsRef = useRef<{ pieceId: number; elapsedMs: number } | null>(null)
  const outputTokens = useMemo(() => output.match(OUTPUT_TOKEN_RE) ?? [], [output])

  useEffect(() => {
    if (output && previousOutputRef.current && !output.startsWith(previousOutputRef.current)) {
      setOutputRun(run => run + 1)
    }
    previousOutputRef.current = output
    previousTokenCountRef.current = outputTokens.length
  }, [output, outputTokens.length])

  useEffect(() => {
    if (!output) {
      displayStartedAtRef.current = null
      setDisplayElapsedMs(null)
      return
    }

    displayStartedAtRef.current ??= Date.now()

    if (displayComplete && displayStartedAtRef.current !== null) {
      setDisplayElapsedMs(Date.now() - displayStartedAtRef.current)
    } else {
      setDisplayElapsedMs(null)
    }
  }, [displayComplete, output])

  useEffect(() => {
    if (!displayComplete) {
      setEndRevealed(false)
      return
    }
    const timer = setTimeout(() => setEndRevealed(true), END_REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [displayComplete])

  useEffect(() => {
    if (restoredSavedDisplay || saveState !== 'saved' || !saveResult || displayElapsedMs === null) return
    lastRecordedElapsedMsRef.current = { pieceId: saveResult.pieceId, elapsedMs: displayElapsedMs }
  }, [displayElapsedMs, restoredSavedDisplay, saveResult, saveState])

  const wrapperClass = [
    'min-h-[55vh] rounded-md px-1 pt-2 text-sm transition-[padding-bottom] duration-200 ease-out',
    streaming ? 'pb-[45vh]' : 'pb-2',
  ].join(' ')
  const previousTokenCount = previousTokenCountRef.current
  const outputTextClass = [
    'whitespace-pre-wrap',
    READING_FONT_BY_ID[readingFont].outputClass,
  ].join(' ')
  const outputTextStyle = READING_FONT_SIZE_BY_ID[readingFontSize].outputStyle
  const placeholderTextStyle: CSSProperties = { ...outputTextStyle, color: 'var(--color-ink-4)' }
  const recordedTextCount = getRecordedTextCount(output)
  const recordedTextCountDisplay = recordedTextCount.count.toLocaleString('en-US')
  const restoredElapsedMs =
    restoredSavedDisplay && saveResult && lastRecordedElapsedMsRef.current?.pieceId === saveResult.pieceId
      ? lastRecordedElapsedMsRef.current.elapsedMs
      : null
  const recordedElapsed = formatElapsedTime(restoredElapsedMs ?? displayElapsedMs)

  if (!output) {
    return (
      <div className={wrapperClass}>
        <div>
          <p className={outputTextClass} style={placeholderTextStyle}>
            {isFirstTake ? 'Set your scene and take it.' : 'Ready when you are.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <div>
        {displayComplete && (
          <div className="fade-in-up mb-6 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-4">
            <span className="h-px flex-1 bg-paper-3" />
            <span>{`${entityLabel('piece', { capitalize: true })} #${pieceNumber}`}</span>
            <span className="h-px flex-1 bg-paper-3" />
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
            <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-4">
              <span className="h-px flex-1 bg-paper-3" />
              <span>{`End of ${entityLabel('piece', { capitalize: true })} #${pieceNumber}`}</span>
              <span className="h-px flex-1 bg-paper-3" />
            </div>
            <div className="mt-4 text-center text-xs text-ink-4">
              {saveState === 'saving' && <span className="italic">Recording...</span>}
              {saveState === 'error' && <span className="text-rose-deep">Could not record this {entityLabel('piece')}</span>}
              {saveState === 'saved' && saveResult && recordedElapsed && (
                <div className="space-y-3">
                  <div>
                    {recordedTextCountDisplay}
                    {` ${recordedTextCount.label} written in `}
                    {recordedElapsed}
                    .
                  </div>
                  <Link
                    to={`/pieces/${saveResult.pieceId}`}
                    className="inline-block font-medium text-ink-3 underline decoration-paper-3 underline-offset-4 transition-colors hover:text-rose-deep hover:decoration-rose"
                  >
                    {`View ${entityLabel('piece')}`}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getRecordedTextCount(text: string) {
  const cjkCharacterCount = (text.match(CJK_CHARACTER_RE) ?? []).length
  const textWithoutCjk = text.replace(CJK_CHARACTER_RE, ' ')
  const wordCount = (textWithoutCjk.match(WORD_RE) ?? []).length
  const count = cjkCharacterCount + wordCount
  const label =
    cjkCharacterCount > 0 && wordCount > 0 ? 'words/characters'
      : cjkCharacterCount > 0 ? count === 1 ? 'character' : 'characters'
        : count === 1 ? 'word' : 'words'

  return { count, label }
}

function formatElapsedTime(milliseconds: number | null) {
  if (milliseconds === null) return null

  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes'
  const secondLabel = seconds === 1 ? 'second' : 'seconds'

  if (minutes === 0) return `${seconds} ${secondLabel}`

  return `${minutes} ${minuteLabel} ${seconds} ${secondLabel}`
}
