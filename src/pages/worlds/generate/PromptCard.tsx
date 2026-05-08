import Skeleton from '@/components/Skeleton'
import { entityLabel } from '@/config'

interface PromptCardProps {
  prompt: string
  onPromptChange: (value: string) => void
  loading: boolean
  streaming: boolean
  error: string
  locked?: boolean
}

export default function PromptCard({
  prompt,
  onPromptChange,
  loading,
  streaming,
  error,
  locked = false,
}: PromptCardProps) {
  const promptLabel = entityLabel('prompt', { capitalize: true })

  return (
    <div className="bg-paper/95 px-2 py-4">
      {loading ? (
        <div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div>
          {locked ? (
            <p id="prompt-input" className="w-full whitespace-pre-wrap bg-transparent px-0 pb-4 pt-3 font-serif-zh text-[22px]   leading-[1.55] text-ink tracking-normal">
              {prompt}
            </p>
          ) : (
            <textarea
              id="prompt-input"
              aria-label={promptLabel}
              className="h-44 w-full resize-y bg-transparent px-0 py-3 font-serif-zh text-[18px] leading-8 text-ink placeholder-ink-4 focus:outline-none focus:ring-0 disabled:opacity-50"
              rows={6}
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
