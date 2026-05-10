import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'

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
        className="grid h-12 w-12 place-items-center rounded-full border border-rose-line/80 bg-paper/60 text-ink-3 shadow-[inset_0_0_24px_rgba(205,83,106,0.03)] transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-px hover:border-rose/40 hover:bg-rose-tint/45 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
        aria-label={`Sort by ${activeOption?.label}`}
        title={`Sort by ${activeOption?.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowUpDown aria-hidden="true" className="h-4.5 w-4.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-md border border-rose-line bg-paper/95 shadow-(--shadow-menu) backdrop-blur"
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => selectOption(option.value)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left font-serif-zh text-sm italic text-ink-2 transition-colors hover:bg-rose-tint/50 hover:text-ink focus:outline-none focus:bg-rose-tint"
            >
              <span>{option.label}</span>
              {value === option.value && (
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-rose" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
