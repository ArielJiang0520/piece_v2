import Skeleton from '../../../components/Skeleton'
import { entityLabel } from '../../../config'

const pillClass = 'rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-medium uppercase leading-none text-ink-4'

interface PromptCardProps {
  prompt: string
  onPromptChange: (value: string) => void
  loading: boolean
  streaming: boolean
  compact: boolean
  promptPieceCount: number
  error: string
}

export default function PromptCard({
  prompt,
  onPromptChange,
  loading,
  streaming,
  compact,
  promptPieceCount,
  error,
}: PromptCardProps) {
  const cardClass = [
    'rounded-md border border-paper-3 bg-paper shadow-[0_10px_24px_rgba(26,18,16,0.10)] transition-[padding,box-shadow] duration-200 ease-out',
    compact ? 'px-3 py-2' : 'px-4 py-4',
  ].join(' ')

  const fieldClass = [
    'w-full rounded-sm px-3 text-base text-ink placeholder-ink-4 transition-[height,padding] duration-200 ease-out focus:outline-none focus:ring-0 disabled:opacity-50 sm:text-sm',
    compact ? 'h-9 resize-none overflow-hidden py-1.5 leading-5' : 'h-32 resize-y py-2',
  ].join(' ')

  const headerClass = [
    'flex items-center justify-between gap-3 overflow-hidden transition-[margin,max-height,opacity] duration-200 ease-out',
    compact ? 'pointer-events-none mb-0 max-h-0 opacity-0' : 'mb-1 max-h-10 opacity-100',
  ].join(' ')

  const errorClass = [
    'overflow-hidden text-sm text-rose-deep transition-[margin,max-height,opacity] duration-200 ease-out',
    compact ? 'mt-0 max-h-0 opacity-0' : 'mt-3 max-h-12 opacity-100',
  ].join(' ')

  const pieceCountLabel = `${promptPieceCount} ${entityLabel('piece', { plural: promptPieceCount !== 1 })}`
  const showNewPromptPill = !!prompt.trim() && promptPieceCount === 0

  return (
    <div className={cardClass}>
      {loading ? (
        <div>
          <div className={headerClass} aria-hidden={compact}>
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className={`${compact ? 'h-9' : 'h-32'} w-full transition-[height] duration-200 ease-out`} />
        </div>
      ) : (
        <div>
          <div className={headerClass} aria-hidden={compact}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label htmlFor="prompt-input" className="block text-sm uppercase tracking-wide text-ink-3">
                {`Current ${entityLabel('prompt', { capitalize: true })}`}
              </label>
              <span className={pillClass}>{pieceCountLabel}</span>
              {showNewPromptPill && <span className={pillClass}>new {entityLabel('prompt')}</span>}
            </div>
          </div>
          <textarea
            id="prompt-input"
            aria-label={`Current ${entityLabel('prompt', { capitalize: true })}`}
            className={fieldClass}
            rows={compact ? 1 : 4}
            placeholder={`Enter your ${entityLabel('prompt')}...`}
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            disabled={streaming}
          />
        </div>
      )}

      {error && <p className={errorClass}>{error}</p>}
    </div>
  )
}
