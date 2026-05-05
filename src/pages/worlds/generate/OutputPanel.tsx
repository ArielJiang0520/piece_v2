import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { entityLabel } from '../../../config'

const END_REVEAL_DELAY_MS = 900

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
  hasMatchedPrompt: boolean
  worldId: string | undefined
}

export default function OutputPanel({
  output,
  streaming,
  displayComplete,
  pieceNumber,
  isFirstTake,
  saveState,
  saveResult,
  hasMatchedPrompt,
  worldId,
}: OutputPanelProps) {
  const [endRevealed, setEndRevealed] = useState(false)

  useEffect(() => {
    if (!displayComplete) {
      setEndRevealed(false)
      return
    }
    const timer = setTimeout(() => setEndRevealed(true), END_REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [displayComplete])

  const wrapperClass = [
    'min-h-[55vh] rounded-md px-1 pt-2 text-sm transition-[padding-bottom] duration-200 ease-out',
    streaming ? 'pb-[45vh]' : 'pb-2',
  ].join(' ')

  if (!output) {
    return (
      <div className={wrapperClass}>
        <div className="text-ink-4 leading-10">
          <p>{isFirstTake ? 'Set your scene and take it.' : 'Ready when you are.'}</p>
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
        <p className="prose whitespace-pre-wrap text-[15px]!">{output}</p>
        {endRevealed && (
          <div className="fade-in-up mt-10">
            <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-4">
              <span className="h-px flex-1 bg-paper-3" />
              <span>{`End of ${entityLabel('piece', { capitalize: true })} #${pieceNumber}`}</span>
              <span className="h-px flex-1 bg-paper-3" />
            </div>
            <div className="mt-4 text-center text-xs text-ink-4">
              {saveState === 'saving' && <span className="italic">Recording…</span>}
              {saveState === 'error' && <span className="text-rose-deep">Could not record this {entityLabel('piece')}</span>}
              {saveState === 'saved' && saveResult && hasMatchedPrompt && (
                <span>
                  {saveResult.isNewPrompt
                    ? `Recorded as a new ${entityLabel('prompt')} · `
                    : `Added to existing ${entityLabel('prompt')} · `}
                  <Link
                    to={`/worlds/${worldId}/prompts/${saveResult.promptId}`}
                    className="font-medium text-ink-3 underline decoration-paper-3 underline-offset-4 transition-colors hover:text-rose-deep hover:decoration-rose"
                  >
                    {`View ${entityLabel('prompt')}`}
                  </Link>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
