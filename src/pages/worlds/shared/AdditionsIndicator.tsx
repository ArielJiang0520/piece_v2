import { useUiText } from '@/i18n'
import type { WorldAddition } from './useWorldAdditions'

interface Props {
  additions: WorldAddition[]
  // Passive: it says what the world currently carries, it doesn't offer to change it. Switching
  // additions on and off is one screen away, on the Additions tab, and belongs there.
  activeIds: number[]
  className?: string
}

// A quiet line above whatever is about to be written, so the reader is never surprised by a
// character in the story they forgot they'd switched on. Renders nothing when nothing is on —
// which is the whole app before additions are used.
export default function AdditionsIndicator({ additions, activeIds, className = '' }: Props) {
  const t = useUiText()
  const names = additions.filter(addition => activeIds.includes(addition.id)).map(addition => addition.name)
  if (names.length === 0) return null

  return (
    <div className={`flex justify-center border-b border-rose-line/70 bg-paper-2/40 px-4 py-2.5 ${className}`}>
      <span className="truncate font-serif-zh text-[13px] italic leading-none text-ink-3">
        {t.additionsOn(names.join(' · '))}
      </span>
    </div>
  )
}
