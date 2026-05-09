import { useEffect, useId, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, X } from 'lucide-react'
import Skeleton, { SkeletonText } from '@/components/Skeleton'
import { entityLabel } from '@/config'
import { diffPromptInlineEdits, type PromptEditMark } from '@/utils/promptDiff'
import { relativeTime } from '@/utils/time'
import type { ClusterPrompt } from './generateTypes'

interface GenerateVersionsDrawerProps {
  open: boolean
  worldId: string | undefined
  currentPromptId: string | null
  prompts: ClusterPrompt[]
  loading: boolean
  streaming: boolean
  onClose: () => void
  onEditFromPrompt: (prompt: ClusterPrompt) => void
}

interface PromptVersionEntry {
  prompt: ClusterPrompt
  number: number
  isLatest: boolean
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

export default function GenerateVersionsDrawer({
  open,
  worldId,
  currentPromptId,
  prompts,
  loading,
  streaming,
  onClose,
  onEditFromPrompt,
}: GenerateVersionsDrawerProps) {
  const titleId = useId()
  const navigate = useNavigate()
  const entries = useMemo<PromptVersionEntry[]>(
    () => prompts
      .map((prompt, index) => {
        const previousPrompt = prompts[index - 1]
        return {
          prompt,
          number: index + 1,
          isLatest: index === prompts.length - 1,
          isCurrent: String(prompt.id) === currentPromptId,
          editMarks: previousPrompt ? diffPromptInlineEdits(previousPrompt.text, prompt.text) : null,
        }
      })
      .reverse(),
    [currentPromptId, prompts],
  )

  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, open])

  function viewPromptVersion(promptId: number, isCurrent: boolean) {
    if (!worldId || isCurrent) return
    onClose()
    navigate(`/worlds/${worldId}/generate?promptId=${promptId}`)
  }

  function handlePromptVersionKeyDown(event: ReactKeyboardEvent<HTMLElement>, promptId: number, isCurrent: boolean) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    viewPromptVersion(promptId, isCurrent)
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-ink/30 transition-opacity duration-200 dark:bg-black/40 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <aside
          className={`pointer-events-auto absolute bottom-0 inset-x-3 flex max-h-[85dvh] flex-col rounded-t-lg border-t border-rose-line bg-paper shadow-(--shadow-menu) transition-transform duration-200 ease-out sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:w-3/4 sm:min-w-80 sm:max-w-3xl sm:rounded-none sm:border-l sm:border-t-0 ${open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'}`}
          aria-hidden={!open}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-label={`${entityLabel('prompt', { capitalize: true })} versions`}
        >
          <div className="flex items-center gap-3 border-b border-rose-line px-5 py-4 sm:px-6 sm:py-5">
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-ink-4 sm:hidden"
            />
            <div className="min-w-0">
              <div id={titleId} className="t-eyebrow">Versions</div>
              <p className="t-meta mt-1 truncate">
                {prompts.length || 0} {prompts.length === 1 ? 'version' : 'versions'}
              </p>
            </div>
            <button
              type="button"
              className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
              aria-label="Close versions"
              title="Close versions"
              onClick={onClose}
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            {loading ? (
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
            ) : entries.length === 0 ? (
              <p className="t-meta">No versions yet.</p>
            ) : (
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
            )}
          </div>
        </aside>
      </div>
    </>
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
