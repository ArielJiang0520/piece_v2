import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { entityLabel } from '@/config'
import { diffPromptInlineEdits, type PromptEditMark } from '@/utils/promptDiff'
import { relativeTime } from '@/utils/time'
import type { ClusterPrompt } from './generateTypes'

interface GenerateVersionsPanelProps {
  worldId: string | undefined
  currentPromptId: string | null
  prompts: ClusterPrompt[]
  loading: boolean
  streaming: boolean
  onViewPrompt: () => void
  onEditFromPrompt: (prompt: ClusterPrompt) => void
}

interface PromptVersionEntry {
  prompt: ClusterPrompt
  number: number
  isCurrent: boolean
  editMarks: PromptEditMark[] | null
}

function renderPromptText(text: string, editMarks: PromptEditMark[] | null) {
  if (!editMarks) return text

  return editMarks.map((mark, index) => {
    if (mark.kind === 'added') {
      return (
        <ins
          key={index}
          className="rounded-xs bg-signal-green/5 px-0.5 text-signal-green underline decoration-signal-green/60 underline-offset-2"
        >
          {mark.value}
        </ins>
      )
    }

    if (mark.kind === 'removed') {
      return (
        <del
          key={index}
          className="rounded-xs bg-signal-red/5 px-0.5 text-signal-red line-through decoration-signal-red/60"
        >
          {mark.value}
        </del>
      )
    }

    return mark.value
  })
}

export default function GenerateVersionsPanel({
  worldId,
  currentPromptId,
  prompts,
  loading,
  streaming,
  onViewPrompt,
  onEditFromPrompt,
}: GenerateVersionsPanelProps) {
  const navigate = useNavigate()
  const entries = useMemo<PromptVersionEntry[]>(
    () => prompts
      .map((prompt, index) => {
        const previousPrompt = prompts[index - 1]
        return {
          prompt,
          number: index + 1,
          isCurrent: String(prompt.id) === currentPromptId,
          editMarks: previousPrompt ? diffPromptInlineEdits(previousPrompt.text, prompt.text) : null,
        }
      })
      .reverse(),
    [currentPromptId, prompts],
  )

  function viewPromptVersion(promptId: number, isCurrent: boolean) {
    if (!worldId || isCurrent) return
    onViewPrompt()
    navigate(`/worlds/${worldId}/generate?promptId=${promptId}`)
  }

  function handlePromptVersionKeyDown(event: ReactKeyboardEvent<HTMLElement>, promptId: number, isCurrent: boolean) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    viewPromptVersion(promptId, isCurrent)
  }

  if (loading) {
    return (
      <div className="hairline-list">
        {Array.from({ length: 3 }, (_, index) => (
          <section
            key={index}
            className={versionEntryClass()}
          >
            <div className="relative flex justify-center">
              <Skeleton className="relative z-10 h-12 w-12 rounded-full" />
            </div>
            <div className="min-w-0">
              <Skeleton className="h-3 w-28" />
              <SkeletonText className="mt-4" lineClassName="h-4" lines={3} />
              <Skeleton className="mt-5 h-4 w-24" />
            </div>
          </section>
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="t-meta px-2 py-6">No versions yet.</p>
  }

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute bottom-8 left-7 top-2 w-px bg-rose-line/45 sm:left-9.5"
      />

      <div>
        {entries.map(({ prompt, number, isCurrent, editMarks }) => {
          const canUsePrompt = !!worldId && !isCurrent

          return (
            <section
              key={prompt.id}
              data-prompt-id={prompt.id}
              className={versionEntryClass(canUsePrompt)}
              aria-current={isCurrent ? 'page' : undefined}
              role={canUsePrompt ? 'button' : undefined}
              tabIndex={canUsePrompt ? 0 : undefined}
              onClick={() => viewPromptVersion(prompt.id, isCurrent)}
              onKeyDown={event => handlePromptVersionKeyDown(event, prompt.id, isCurrent)}
            >
              <div className="relative flex justify-center">
                <div
                  className={[
                    'relative z-10 grid h-10 w-10 place-items-center rounded-full font-serif-zh text-sm italic',
                    isCurrent
                      ? 'bg-rose text-white shadow-(--shadow-cta)'
                      : 'border border-rose-line bg-paper text-ink-3',
                  ].join(' ')}
                >
                  v{number}
                </div>
              </div>

              <div className="min-w-0">
                <div className="t-meta flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate not-italic text-ink-3">{relativeTime(prompt.updated_at)}</span>
                  </div>
                  <span className="shrink-0">
                    {prompt.piece_count} {entityLabel('piece', { plural: prompt.piece_count !== 1 })}
                  </span>
                </div>

                <h2 className={`mt-3 whitespace-pre-wrap font-serif-zh text-[16px] leading-7 ${isCurrent ? 'text-ink' : 'text-ink-2'}`}>
                  {renderPromptText(prompt.text, editMarks)}
                </h2>

                {isCurrent && (
                  <div className="mt-5">
                    <button
                      type="button"
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose px-5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => onEditFromPrompt(prompt)}
                      disabled={streaming}
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">Edit from this</span>
                    </button>
                    <p className="t-meta mt-2 text-center">Your edits will create a new version.</p>
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function versionEntryClass(canUsePrompt = false) {
  return [
    'grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-1 py-6 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 sm:grid-cols-[3.75rem_minmax(0,1fr)] sm:gap-4 sm:px-2 sm:py-7',
    canUsePrompt
      ? 'cursor-pointer hover:bg-rose-tint/10'
      : '',
  ].join(' ')
}
