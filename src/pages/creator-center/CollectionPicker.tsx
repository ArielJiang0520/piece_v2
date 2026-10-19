import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderInput } from 'lucide-react'
import { useUiText } from '@/i18n'

export interface CollectionOption {
  id: string
  name: string
}

interface CollectionPickerProps {
  collections: CollectionOption[]
  // null: No collection.
  value: string | null
  onChange: (collectionId: string | null) => void
  disabled?: boolean
}

// Which collection a scene is in, as a chip that opens the list of the world's collections and
// "No collection". Choosing moves it, in the world's draft.
export default function CollectionPicker({ collections, value, onChange, disabled = false }: CollectionPickerProps) {
  const t = useUiText()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const options = [...collections.map(collection => ({ id: collection.id as string | null, label: collection.name || t.untitled })), { id: null, label: t.noCollection }]
  const current = options.find(option => option.id === value)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
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

  return (
    <div ref={menuRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(isOpen => !isOpen)}
        className="chip max-w-full"
        aria-label={t.moveTo}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
      >
        <FolderInput aria-hidden="true" />
        <span className="truncate">{current?.label ?? t.noCollection}</span>
        <ChevronDown aria-hidden="true" className={`text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="menu absolute left-0 top-full z-30 mt-2 w-60">
          {options.map(option => (
            <button
              key={option.id ?? 'none'}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.id}
              onClick={() => {
                setOpen(false)
                if (option.id !== value) onChange(option.id)
              }}
              className={`menu-item justify-between ${value === option.id ? 'font-semibold' : ''}`}
            >
              <span className="truncate">{option.label}</span>
              {value === option.id && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-rose" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
