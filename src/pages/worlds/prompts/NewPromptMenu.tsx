import { useEffect, useRef, useState } from 'react'
import { PenLine, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

interface NewPromptMenuProps {
  worldId: string | undefined
}

// The two ways to arrive at a prompt — write it yourself, or have AI draft one from a word or two.
// They lead to the same builder, so they sit behind one control rather than taking a whole second
// row of the pinned bar: this is a list first, and the bar was crowding the prompts off the screen.
// It floats in the bottom corner instead, where it never eats into the list, and opens upward.
export default function NewPromptMenu({ worldId }: NewPromptMenuProps) {
  const t = useUiText()
  const language = useLanguageId()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const label = t.newEntity(entityLabel('prompt', { capitalize: true }, language))

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div
      ref={menuRef}
      className="fixed bottom-[calc(1.75rem+env(safe-area-inset-bottom))] right-6 z-40"
    >
      <button
        type="button"
        onClick={() => setOpen(open => !open)}
        className="grid h-14 w-14 place-items-center rounded-full bg-rose text-white shadow-(--shadow-feather) transition-[background-color,transform] duration-200 active:translate-y-px active:bg-rose-deep"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus aria-hidden="true" className={`h-6 w-6 stroke-[1.8] transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-3 w-56 overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
        >
          <Link
            to={`/worlds/${worldId}/prompt/new`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 px-4 py-3 font-serif-zh text-sm italic text-ink-2 transition-colors active:bg-rose-tint/60"
          >
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />
            <span>{label}</span>
          </Link>
          <Link
            to={`/worlds/${worldId}/ideas`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 border-t border-rose-line/70 px-4 py-3 font-serif-zh text-sm italic text-ink-2 transition-colors active:bg-rose-tint/60"
          >
            <PenLine aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />
            <span>{t.workshopEntry(entityLabel('prompt', {}, language))}</span>
          </Link>
        </div>
      )}
    </div>
  )
}
