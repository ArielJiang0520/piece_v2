import { useState } from 'react'
import { Heart } from 'lucide-react'
import { apiFetch } from '@/api'
import { useToast } from '@/components/Toast'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'
import { TASTE_TAGS, tasteTagLabel, type TasteTag } from '../shared/tasteTags'

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

// The inline "why do you like this?" panel that opens under a tapped paragraph in the
// static reader. Multi-select reason chips + an optional free-typed note, then a single
// "like this" confirm. Matches the app's pill / italic-serif-zh aesthetic — no new widgets.
export default function ParagraphLikePanel({ worldId, pieceId, snippet, context, onLiked, onClose }: ParagraphLikePanelProps) {
  const t = useUiText()
  const lang = useLanguageId()
  const toast = useToast()
  const [tags, setTags] = useState<TasteTag[]>([])
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  function toggleTag(tag: TasteTag) {
    setTags(prev => (prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]))
  }

  async function submit() {
    if (pending) return
    setPending(true)
    try {
      // Fold the selected chips and the typed note into one free-form reason string — the
      // server stores it as a single field, the chips aren't special props.
      const reasons = [tags.map(tag => tasteTagLabel(tag, lang)).join(', '), note.trim()].filter(Boolean).join(' — ')
      await apiFetch('/api/taste/likes', {
        method: 'POST',
        body: JSON.stringify({ worldId: Number(worldId), pieceId: pieceId ?? undefined, snippet, context, reasons }),
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
    <div className="fade-in-up mt-2 rounded-lg bg-paper-2 p-3">
      <p className="t-eyebrow mb-2">{t.tasteWhyPrompt}</p>
      <div className="flex flex-wrap gap-1.5">
        {TASTE_TAGS.map(tag => {
          const on = tags.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-3 py-1 font-serif-zh text-[13px] italic leading-none transition-colors ${on ? 'bg-rose-pale text-rose-deep' : 'bg-paper text-ink-3 active:bg-paper-3'}`}
            >
              {tasteTagLabel(tag, lang)}
            </button>
          )
        })}
      </div>
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={500}
        placeholder={t.tasteNotePlaceholder}
        className="mt-3 w-full rounded-md bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-end gap-4">
        <button type="button" onClick={onClose} className="t-meta transition-colors active:text-ink">
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-rose px-4 font-serif-zh text-[13px] italic leading-none text-white transition-opacity active:opacity-80 disabled:opacity-50"
        >
          <Heart aria-hidden="true" className="h-3.5 w-3.5" />
          {pending ? t.tasteLiking : t.tasteLikeThis}
        </button>
      </div>
    </div>
  )
}
