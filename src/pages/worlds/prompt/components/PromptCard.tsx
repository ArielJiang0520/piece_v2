import Skeleton from '@/components/Skeleton'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

interface PromptCardProps {
  prompt: string
  onPromptChange: (value: string) => void
  loading: boolean
  error: string
  locked?: boolean
}

export default function PromptCard({
  prompt,
  onPromptChange,
  loading,
  error,
  locked = false,
}: PromptCardProps) {
  const language = useLanguageId()
  const t = useUiText()
  const promptLabel = entityLabel('prompt', { capitalize: true }, language)
  const editorFrameClass =
    'rounded-lg border border-rose-line/80 bg-paper px-4 py-4 shadow-[inset_0_0_38px_rgba(205,83,106,0.055)] transition-colors focus-within:border-rose/60 focus-within:shadow-[inset_0_0_42px_rgba(205,83,106,0.085)]'
  const editorTextClass =
    'font-serif-zh text-[16px] leading-6 text-ink tracking-normal'

  return (
    <div className="bg-paper/95 px-2 py-2">
      {loading ? (
        <div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div>
          {locked ? (
            <p id="prompt-input" className="w-full whitespace-pre-wrap bg-transparent px-4 pb-3 pt-2 font-serif-zh text-[20px] leading-[1.55] text-ink tracking-normal">
              {prompt}
            </p>
          ) : (
            <div className={editorFrameClass}>
              <textarea
                id="prompt-input"
                aria-label={promptLabel}
                className={`${editorTextClass} h-44 w-full resize-y bg-transparent placeholder:text-ink-4 focus:outline-none focus:ring-0 [scrollbar-color:var(--color-rose)_transparent] [scrollbar-width:thin]`}
                rows={6}
                placeholder={t.promptPlaceholder}
                value={prompt}
                onChange={e => onPromptChange(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-deep">{error}</p>}
    </div>
  )
}
