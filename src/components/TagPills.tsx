import { useUiText } from '@/i18n'

interface TagPillsProps {
  tags: string[]
  selected: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  className?: string
}

// A one-line, sideways-scrolling row of filter chips. It scrolls rather than wraps so a long tag
// list never pushes the content below it down. Selected tags lead, so what is narrowing the list
// is always in view.
export default function TagPills({ tags, selected, onToggle, onClear, className }: TagPillsProps) {
  const t = useUiText()
  const ordered = [...selected, ...tags.filter(tag => !selected.includes(tag))]
  if (ordered.length === 0) return null

  return (
    <div
      className={[
        '-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      ].filter(Boolean).join(' ')}
    >
      <button type="button" aria-pressed={selected.length === 0} onClick={onClear} className="chip">
        {t.allTags}
      </button>
      {ordered.map(tag => (
        <button key={tag} type="button" aria-pressed={selected.includes(tag)} onClick={() => onToggle(tag)} className="chip">
          {tag}
        </button>
      ))}
    </div>
  )
}
