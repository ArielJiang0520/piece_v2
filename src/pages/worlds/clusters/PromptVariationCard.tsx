import { type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { RotateCw } from 'lucide-react'
import CountIndicator from '@/components/CountIndicator'
import { entityLabel } from '@/config'
import { relativeTime } from '@/utils/time'
import { type PromptEditMark } from '@/utils/promptDiff'

export interface PromptVariation {
  id: number
  text: string
  piece_count: number
  updated_at: number
}

interface PromptVariationCardProps {
  prompt: PromptVariation
  worldId: string | undefined
  number: number
  isLatest: boolean
  isLast: boolean
  showEdits: boolean
  editMarks: PromptEditMark[] | null
  onOpenPrompt: (promptId: number, event: MouseEvent<HTMLAnchorElement>) => void
}

function renderPromptText(text: string, showEdits: boolean, editMarks: PromptEditMark[] | null) {
  if (!showEdits || !editMarks) return text

  return editMarks.map((mark, index) => {
    if (mark.kind === 'added') {
      return (
        <ins
          key={index}
          className="rounded-xs bg-signal-green/10 px-0.5 text-signal-green underline decoration-signal-green/70 underline-offset-2"
        >
          {mark.value}
        </ins>
      )
    }

    if (mark.kind === 'removed') {
      return (
        <del
          key={index}
          className="rounded-xs bg-signal-red/10 px-0.5 text-signal-red line-through decoration-signal-red/70"
        >
          {mark.value}
        </del>
      )
    }

    return mark.value
  })
}

export default function PromptVariationCard({
  prompt,
  worldId,
  number,
  isLatest,
  isLast,
  showEdits,
  editMarks,
  onOpenPrompt,
}: PromptVariationCardProps) {
  return (
    <section
      data-prompt-id={prompt.id}
      className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-4 py-8 first:pt-2 last:pb-2"
    >
      <div className="relative flex justify-center">
        {!isLast && (
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-1/2 top-12 w-px -translate-x-1/2 bg-rose-line"
          />
        )}
        <div
          className={[
            'relative z-10 grid h-12 w-12 place-items-center rounded-full font-serif-zh text-base italic',
            isLatest
              ? 'bg-rose text-white shadow-(--shadow-cta)'
              : 'bg-rose-pale text-rose-deep',
          ].join(' ')}
        >
          v{number}
        </div>
      </div>

      <div className="min-w-0">
        <Link
          to={`/worlds/${worldId}/prompts/${prompt.id}`}
          onClick={event => onOpenPrompt(prompt.id, event)}
          className="block transition-transform duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
        >
          <div className="t-meta flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {isLatest && (
                <span className="t-eyebrow shrink-0 text-rose">Latest</span>
              )}
              <span className="truncate not-italic text-ink-3">{relativeTime(prompt.updated_at)}</span>
            </div>
            <CountIndicator count={prompt.piece_count} className="shrink-0 justify-end" />
          </div>

          <h2 className="mt-3 whitespace-pre-wrap font-serif-zh text-[16px] leading-7 text-ink">
            {renderPromptText(prompt.text, showEdits, editMarks)}
          </h2>
        </Link>

        <Link
          to={`/worlds/${worldId}/generate?promptId=${prompt.id}`}
          className="mt-5 inline-flex items-center gap-2 font-serif-zh text-sm italic text-rose transition-colors hover:text-rose-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
        >
          <RotateCw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span>Another {entityLabel('piece')} of this</span>
        </Link>
      </div>
    </section>
  )
}
