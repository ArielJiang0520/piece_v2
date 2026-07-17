import { useState } from 'react'
import { Heart } from 'lucide-react'
import { apiFetch } from '@/api'
import { useToast } from '@/components/Toast'
import { useUiText } from '@/i18n'

interface ParagraphLikePanelProps {
  worldId: string
  // Optional: a like made in the generate screen has no saved piece yet, so it's recorded
  // against the world alone (piece_id → null server-side). The static reader passes the id.
  pieceId?: number | null
  snippet: string
  // The liked paragraph plus a paragraph or two on either side, stored so the taste distiller
  // reads the passage in its surrounding flow. Optional — omitted when there's no surrounding
  // prose to give.
  context?: string
  // Called after a successful like so the reader can immediately mark the paragraph.
  onLiked: (snippet: string) => void
  onClose: () => void
}

// The "like" row inside the paragraph dock — structurally identical to the Expand/Continue
// steer row: one optional free-text reaction field + one round submit button. No chips, no
// card, no label: the reader isn't a critic, they just felt something and can type it or not.
export default function ParagraphLikePanel({ worldId, pieceId, snippet, context, onLiked, onClose }: ParagraphLikePanelProps) {
  const t = useUiText()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  async function submit() {
    if (pending) return
    setPending(true)
    try {
      const reasons = note.trim()
      await apiFetch(`/api/worlds/${worldId}/taste/likes`, {
        method: 'POST',
        body: JSON.stringify({ pieceId: pieceId ?? undefined, snippet, context, reasons }),
      })
      onLiked(snippet)
      toast.show({ kind: 'success', title: t.tasteLiked })
      onClose()
    } catch (error) {
      toast.show({ kind: 'error', title: error instanceof Error ? error.message : t.tasteLikeFailed })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        maxLength={500}
        placeholder={t.tasteNotePlaceholder}
        enterKeyHint="done"
        className="h-9 flex-1 rounded-full bg-paper-2 px-4 font-serif-zh text-[13px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none"
      />
      <button
        type="button"
        aria-label={t.tasteLikeThis}
        onClick={submit}
        disabled={pending}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose text-white transition-opacity active:opacity-80 disabled:opacity-50"
      >
        <Heart aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
