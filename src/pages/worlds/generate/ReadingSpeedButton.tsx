import { useEffect, useId, useState } from 'react'
import { Gauge } from 'lucide-react'
import { ReadingSpeedSlider } from './SettingsPanel'

interface ReadingSpeedButtonProps {
  className: string
  readingSpeed: number
  onReadingSpeedChange: (readingSpeed: number) => void
}

export default function ReadingSpeedButton({
  className,
  readingSpeed,
  onReadingSpeedChange,
}: ReadingSpeedButtonProps) {
  const panelId = useId()
  const speedInputId = useId()
  const [open, setOpen] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [entered, setEntered] = useState(false)
  const visible = open && entered

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  useEffect(() => {
    if (open) {
      setRendered(true)
      const frame = window.requestAnimationFrame(() => setEntered(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setEntered(false)
    const timeout = window.setTimeout(() => setRendered(false), 150)
    return () => window.clearTimeout(timeout)
  }, [open])

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        className={`${className} ${open ? 'border-rose/40 bg-rose-pale' : ''}`}
        onClick={() => setOpen(value => !value)}
        aria-label={open ? 'Close reading speed' : 'Reading speed'}
        title="Reading speed"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Gauge className="h-5 w-5" aria-hidden="true" />
      </button>

      {rendered && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-transparent ${visible ? '' : 'pointer-events-none'}`}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            id={panelId}
            className={`absolute bottom-full left-1/2 z-50 mb-3 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-rose-line bg-paper/95 p-3 shadow-(--shadow-menu) backdrop-blur transition-[opacity,transform] duration-150 ease-out ${visible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-1 opacity-0'
              }`}
            role="dialog"
            aria-modal="false"
            aria-label="Reading speed"
            aria-hidden={!open}
          >
            <ReadingSpeedSlider
              id={speedInputId}
              disabled={!open}
              readingSpeed={readingSpeed}
              onReadingSpeedChange={onReadingSpeedChange}
            />
          </div>
        </>
      )}
    </div>
  )
}
