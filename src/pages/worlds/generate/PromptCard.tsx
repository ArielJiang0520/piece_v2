import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
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
  settingsOpen: boolean
  onSettingsToggle: () => void
  settings: ReactNode
}

export default function PromptCard({
  prompt,
  onPromptChange,
  loading,
  streaming,
  compact,
  promptPieceCount,
  error,
  settingsOpen,
  onSettingsToggle,
  settings,
}: PromptCardProps) {
  const cardClass = [
    'rounded-md border border-paper-3 bg-paper shadow-[0_10px_24px_rgba(26,18,16,0.10)] transition-[padding,box-shadow] duration-200 ease-out',
    compact ? 'px-3 py-3' : 'px-4 py-4',
  ].join(' ')

  const fieldClass = [
    'w-full rounded-sm px-3 text-base text-ink placeholder-ink-4 transition-[height,padding] duration-200 ease-out focus:outline-none focus:ring-0 disabled:opacity-50 sm:text-sm',
    compact ? 'h-[3.35rem] resize-none py-1.5 leading-5' : 'h-32 resize-y py-2',
  ].join(' ')

  const pieceCountLabel = `${promptPieceCount} ${entityLabel('piece', { plural: promptPieceCount !== 1 })}`
  const showNewPromptPill = !!prompt.trim() && promptPieceCount === 0

  const settingsButton = (
    <button
      type="button"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30 ${settingsOpen ? 'bg-paper-2 text-ink' : ''}`}
      onClick={onSettingsToggle}
      aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
      title={settingsOpen ? 'Close settings' : 'Open settings'}
    >
      <Settings aria-hidden="true" className="h-5 w-5" />
    </button>
  )

  return (
    <div className={cardClass}>
      {loading ? (
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-20" />
            {settingsButton}
          </div>
          <Skeleton className={compact ? 'h-[3.35rem] w-full' : 'h-32 w-full'} />
        </div>
      ) : (
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label htmlFor="prompt-input" className="block text-sm uppercase tracking-wide text-ink-3">
                {`Current ${entityLabel('prompt', { capitalize: true })}`}
              </label>
              <span className={pillClass}>{pieceCountLabel}</span>
              {showNewPromptPill && <span className={pillClass}>new {entityLabel('prompt')}</span>}
            </div>
            {settingsButton}
          </div>
          <textarea
            id="prompt-input"
            className={fieldClass}
            rows={compact ? 2 : 4}
            placeholder={`Enter your ${entityLabel('prompt')}...`}
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            disabled={streaming}
          />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-deep">{error}</p>}

      {settings}
    </div>
  )
}
