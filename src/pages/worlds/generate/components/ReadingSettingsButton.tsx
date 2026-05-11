import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUiText } from '@/i18n'
import SettingsPanel from './SettingsPanel'
import type { ReadingFont } from '@/preferences/readingFont'
import type { ReadingFontSize } from '@/preferences/readingFontSize'

interface ReadingSettingsButtonProps {
  className: string
  readingFont: ReadingFont
  onReadingFontChange: (readingFont: ReadingFont) => void
  readingFontSize: ReadingFontSize
  onReadingFontSizeChange: (readingFontSize: ReadingFontSize) => void
}

export default function ReadingSettingsButton({
  className,
  readingFont,
  onReadingFontChange,
  readingFontSize,
  onReadingFontSizeChange,
}: ReadingSettingsButtonProps) {
  const t = useUiText()
  const panelId = useId()
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
    const timeout = window.setTimeout(() => setRendered(false), 220)
    return () => window.clearTimeout(timeout)
  }, [open])

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        className={`${className} font-serif-zh text-[17px] italic leading-none ${open ? 'border-rose/40 bg-rose-pale' : ''}`}
        onClick={() => setOpen(value => !value)}
        aria-label={open ? t.closeReadingDisplaySettings : t.readingDisplaySettings}
        title={t.readingDisplaySettings}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span aria-hidden="true">Aa</span>
      </button>

      {rendered && createPortal(
        <>
          <div
            className={`fixed inset-0 z-40 bg-transparent ${visible ? '' : 'pointer-events-none'}`}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            id={panelId}
            className={`fixed inset-x-0 top-12 z-50 border-y border-rose-line bg-paper/95 px-4 py-4 shadow-(--shadow-menu) backdrop-blur transition-[opacity,transform] duration-220 ease-out ${visible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-4 opacity-0'
              }`}
            role="dialog"
            aria-modal="false"
            aria-label={t.readingDisplaySettings}
            aria-hidden={!open}
          >
            <div className="page-width flex justify-end">
              <div className="w-full max-w-sm">
                <SettingsPanel
                  open={rendered}
                  readingFont={readingFont}
                  onReadingFontChange={onReadingFontChange}
                  readingFontSize={readingFontSize}
                  onReadingFontSizeChange={onReadingFontSizeChange}
                />
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
