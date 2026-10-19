import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, ThumbsUp } from 'lucide-react'
import { MODELS } from '@/preferences/generationModel'
import { useUiText } from '@/i18n'

interface ModelSelectorProps {
  model: string
  onModelChange: (model: string) => void
  // Only for a caller that has to get out of the open menu's way (the generate controls raise
  // their z-index). A selector in a surface that already sits on top doesn't pass one.
  onMenuOpenChange?: (open: boolean) => void
  // Where the dropdown hangs from its trigger. Centered by default (the trigger sits mid-row);
  // 'end' right-aligns it so a trigger parked at the right edge doesn't push the menu off-screen.
  align?: 'center' | 'end'
}

export default function ModelSelector({
  model,
  onModelChange,
  onMenuOpenChange,
  align = 'center',
}: ModelSelectorProps) {
  const t = useUiText()
  const modelButtonId = useId()
  const modelListboxId = `${modelButtonId}-listbox`
  const modelMenuRef = useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const selectedModel = MODELS.find(option => option.id === model) ?? MODELS[0]

  useEffect(() => {
    onMenuOpenChange?.(menuOpen)
  }, [menuOpen, onMenuOpenChange])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  function chooseModel(id: string) {
    onModelChange(id)
    setMenuOpen(false)
  }

  return (
    <div ref={modelMenuRef} className={`relative flex min-w-0 ${align === 'end' ? 'justify-end' : 'justify-center'}`}>
      <button
        id={modelButtonId}
        type="button"
        className="chip max-w-full"
        aria-label="Select AI model"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={modelListboxId}
        title={selectedModel.label}
        onClick={() => setMenuOpen(current => !current)}
      >
        <Cpu aria-hidden="true" className="text-ink-3" />
        <span className="shrink-0 text-ink-3">{t.model}</span>
        <span className="min-w-0 truncate font-semibold text-ink">{selectedModel.label}</span>
        <ChevronDown
          className={`shrink-0 text-ink-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {menuOpen && (
        <div
          id={modelListboxId}
          className={`menu absolute top-full z-40 mt-2 w-[min(17rem,calc(100vw-2rem))] ${align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
          role="listbox"
          aria-labelledby={modelButtonId}
        >
          {MODELS.map(option => {
            const selected = option.id === model

            return (
              <button
                key={option.id}
                type="button"
                className="menu-item"
                role="option"
                aria-selected={selected}
                onClick={() => chooseModel(option.id)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={`min-w-0 truncate ${selected ? 'font-semibold' : ''}`}>
                    {option.label}
                  </span>
                  {option.recommended && (
                    <ThumbsUp
                      className="size-3.5 shrink-0 text-rose-deep"
                      aria-label="Recommended"
                    />
                  )}
                </span>
                <Check
                  className={`size-4 shrink-0 text-rose ${selected ? 'opacity-100' : 'opacity-0'}`}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
