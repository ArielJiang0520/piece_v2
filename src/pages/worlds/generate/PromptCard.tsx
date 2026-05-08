import Skeleton from '@/components/Skeleton'
import { entityLabel } from '@/config'

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
    'border-y border-rose-line bg-paper/95 backdrop-blur transition-[padding] duration-200 ease-out',
    compact ? 'px-2 py-2' : 'px-2 py-4',
  ].join(' ')

  const fieldClass = [
    'w-full bg-transparent px-0 font-serif-zh text-ink placeholder-ink-4 transition-[height,padding,font-size,line-height] duration-200 ease-out focus:outline-none focus:ring-0 disabled:opacity-50',
    compact ? 'h-10 resize-none overflow-hidden py-2 text-[16px] leading-6' : 'h-32 resize-y py-3 text-[18px] leading-8',
  ].join(' ')

  const headerClass = [
    'flex items-start justify-between gap-4 overflow-hidden transition-[margin,max-height,opacity] duration-200 ease-out',
    compact ? 'pointer-events-none mb-0 max-h-0 opacity-0' : 'mb-2 max-h-14 opacity-100',
  ].join(' ')

  const errorClass = [
    'overflow-hidden text-sm text-rose-deep transition-[margin,max-height,opacity] duration-200 ease-out',
    compact ? 'mt-0 max-h-0 opacity-0' : 'mt-3 max-h-12 opacity-100',
  ].join(' ')

  const pieceCountLabel = `${promptPieceCount} ${entityLabel('piece', { plural: promptPieceCount !== 1 })}`
  const showNewPromptPill = !!prompt.trim() && promptPieceCount === 0
  const promptLabel = `Current ${entityLabel('prompt', { capitalize: true })}`

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
            <div className="min-w-0">
              <label htmlFor="prompt-input" className="t-eyebrow eyebrow-rule">
                {promptLabel}
              </label>
            </div>
            <div className="t-meta flex shrink-0 items-center gap-2 pt-0.5">
              <span>{pieceCountLabel}</span>
              {showNewPromptPill && <span aria-hidden="true" className="text-ink-4">{'\u2014'}</span>}
              {showNewPromptPill && <span>new {entityLabel('prompt')}</span>}
            </div>
          </div>
          <textarea
            id="prompt-input"
            aria-label={promptLabel}
            className={fieldClass}
            rows={compact ? 1 : 4}
            placeholder={`What do you want to see happen?`}
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
