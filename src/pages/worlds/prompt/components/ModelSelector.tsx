import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, ThumbsUp } from 'lucide-react'
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
        className="inline-flex max-w-full items-center justify-center gap-1.5 px-2 py-1.5 font-serif-zh text-[11px] italic leading-none text-ink-3 focus:outline-none"
        aria-label="Select AI model"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={modelListboxId}
        title={selectedModel.label}
        onClick={() => setMenuOpen(current => !current)}
      >
        <span className="shrink-0 text-ink-4">{t.model}:</span>
        <span className="min-w-0 truncate text-ink-3">{selectedModel.label}</span>
        <ChevronDown
          className={`size-3 shrink-0 text-ink-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {menuOpen && (
        <div
          id={modelListboxId}
          className={`absolute top-full z-40 mt-2 w-[min(15rem,calc(100vw-2rem))] overflow-hidden rounded-sm border border-rose-line bg-paper p-0.5 shadow-(--shadow-menu) ${align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
          role="listbox"
          aria-labelledby={modelButtonId}
        >
          {MODELS.map(option => {
            const selected = option.id === model

            return (
              <button
                key={option.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xs px-2.5 py-2 text-left text-ink transition-colors hover:bg-rose-pale/55"
                role="option"
                aria-selected={selected}
                onClick={() => chooseModel(option.id)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="min-w-0 truncate font-serif-zh text-[13px] italic">
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
                  className={`size-3.5 shrink-0 text-rose-deep ${selected ? 'opacity-100' : 'opacity-0'}`}
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
