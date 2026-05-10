import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, ThumbsUp } from 'lucide-react'
import { MODELS } from '@/preferences/generationModel'

interface ModelSelectorProps {
  model: string
  onModelChange: (model: string) => void
  disabled: boolean
  closeMenu: boolean
  onMenuOpenChange: (open: boolean) => void
}

export default function ModelSelector({
  model,
  onModelChange,
  disabled,
  closeMenu,
  onMenuOpenChange,
}: ModelSelectorProps) {
  const modelButtonId = useId()
  const modelListboxId = `${modelButtonId}-listbox`
  const modelMenuRef = useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const selectedModel = MODELS.find(option => option.id === model) ?? MODELS[0]

  useEffect(() => {
    if (disabled || closeMenu) setMenuOpen(false)
  }, [closeMenu, disabled])

  useEffect(() => {
    onMenuOpenChange(menuOpen)
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
    <div ref={modelMenuRef} className="relative mt-0.5 mb-2 flex w-full min-w-0 justify-center">
      <button
        id={modelButtonId}
        type="button"
        className="inline-flex max-w-full items-center justify-center gap-1.5 px-2 py-1.5 font-serif-zh text-[11px] italic leading-none text-ink-3 focus:outline-none disabled:pointer-events-none disabled:opacity-50"
        aria-label="Select AI model"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={modelListboxId}
        title={selectedModel.label}
        onClick={() => setMenuOpen(current => !current)}
        disabled={disabled}
      >
        <span className="shrink-0 text-ink-4">AI Model:</span>
        <span className="min-w-0 truncate text-ink-3">{selectedModel.label}</span>
        <ChevronDown
          className={`size-3 shrink-0 text-ink-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {menuOpen && (
        <div
          id={modelListboxId}
          className="absolute right-0 top-full z-40 mt-2 w-[min(15rem,calc(100vw-2rem))] overflow-hidden rounded-sm border border-rose-line bg-paper p-0.5 shadow-(--shadow-menu)"
          role="listbox"
          aria-labelledby={modelButtonId}
        >
          {MODELS.map(option => {
            const selected = option.id === model

            return (
              <button
                key={option.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xs px-2.5 py-2 text-left text-ink transition-colors hover:bg-rose-pale/55 disabled:opacity-50"
                role="option"
                aria-selected={selected}
                onClick={() => chooseModel(option.id)}
                disabled={disabled}
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
