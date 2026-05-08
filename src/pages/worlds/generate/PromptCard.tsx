import Skeleton from '@/components/Skeleton'
import { entityLabel } from '@/config'

interface PromptCardProps {
  prompt: string
  onPromptChange: (value: string) => void
  loading: boolean
  streaming: boolean
  promptPieceCount: number
  error: string
  locked?: boolean
}

export default function PromptCard({
  prompt,
  onPromptChange,
  loading,
  streaming,
  promptPieceCount,
  error,
  locked = false,
}: PromptCardProps) {
  const showNewPromptPill = !locked && !!prompt.trim() && promptPieceCount === 0
  const promptLabel = entityLabel('prompt', { capitalize: true })

  return (
    <div className="bg-paper/95 px-2 py-4">
      {loading ? (
        <div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div>
          {showNewPromptPill && (
            <div className="t-meta mb-2 flex justify-end">
              <span>new {entityLabel('prompt')}</span>
            </div>
          )}
          {locked ? (
            <p id="prompt-input" className="w-full whitespace-pre-wrap bg-transparent px-0 py-3 font-serif-zh text-[18px] leading-8 text-ink">
              {prompt}
            </p>
          ) : (
            <textarea
              id="prompt-input"
              aria-label={promptLabel}
              className="h-32 w-full resize-y bg-transparent px-0 py-3 font-serif-zh text-[18px] leading-8 text-ink placeholder-ink-4 focus:outline-none focus:ring-0 disabled:opacity-50"
              rows={4}
              placeholder={`What do you want to see happen?`}
              value={prompt}
              onChange={e => onPromptChange(e.target.value)}
              disabled={streaming}
            />
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-deep">{error}</p>}
    </div>
  )
}
