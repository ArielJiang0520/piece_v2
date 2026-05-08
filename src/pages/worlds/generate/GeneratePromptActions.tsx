import { Link } from 'react-router-dom'
import { GitBranch, Pencil } from 'lucide-react'

interface GeneratePromptActionsProps {
  worldId: string | undefined
  promptId: string | null
  activeClusterId: number | null
  showHistoryLink: boolean
  variationNumber: number | null
  streaming: boolean
  onCopyEdit: () => void
}

export default function GeneratePromptActions({
  worldId,
  promptId,
  activeClusterId,
  showHistoryLink,
  variationNumber,
  streaming,
  onCopyEdit,
}: GeneratePromptActionsProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2">
      <button
        type="button"
        className="t-meta inline-flex min-w-0 items-center gap-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:opacity-50"
        onClick={onCopyEdit}
        disabled={streaming || !promptId}
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>Copy & edit</span>
      </button>

      {showHistoryLink && worldId && activeClusterId != null && promptId && (
        <Link
          to={`/worlds/${worldId}/clusters/${activeClusterId}`}
          state={{ backHref: `/worlds/${worldId}/generate?promptId=${promptId}` }}
          className="t-meta inline-flex shrink-0 items-center gap-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
          aria-label="Open scene history"
          title="Scene history"
        >
          <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{variationNumber ? `v${variationNumber}` : 'History'}</span>
        </Link>
      )}
    </div>
  )
}
