import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react'
import { useUiText } from '@/i18n'

export interface WorldSortOption<T extends string> {
  value: T
  label: string
}

interface WorldSortMenuProps<T extends string> {
  options: readonly WorldSortOption<T>[]
  value: T
  onChange: (value: T) => void
}

export default function WorldSortMenu<T extends string>({
  options,
  value,
  onChange,
}: WorldSortMenuProps<T>) {
  const t = useUiText()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const activeOption = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: PointerEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function selectOption(next: T) {
    setOpen(false)
    onChange(next)
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(open => !open)}
        className="chip h-10"
        aria-label={t.sortBy(activeOption?.label)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowUpDown aria-hidden="true" />
        <span>{activeOption?.label}</span>
        <ChevronDown aria-hidden="true" className={`text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="menu absolute right-0 top-full z-20 mt-2 w-48">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => selectOption(option.value)}
              className={`menu-item justify-between ${value === option.value ? 'font-semibold' : ''}`}
            >
              <span>{option.label}</span>
              {value === option.value && (
                <Check aria-hidden="true" className="h-4 w-4 text-rose" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
