import { useEffect, useRef, useState } from 'react'
import { entityLabel } from '@/config'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

interface CreateWorldTipsDialogProps {
  open: boolean
  onClose: () => void
}

export default function CreateWorldTipsDialog({ open, onClose }: CreateWorldTipsDialogProps) {
  const language = useLanguageId()
  const t = useUiText()
  const [activeTip, setActiveTip] = useState(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    setActiveTip(0)
    scrollerRef.current?.scrollTo({ left: 0 })

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, open])

  if (!open) return null

  function scrollToTip(index: number) {
    const scroller = scrollerRef.current
    setActiveTip(index)
    scroller?.scrollTo({ left: index * scroller.clientWidth, behavior: 'smooth' })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.entityTips(t.createEntity(entityLabel('world', {}, language)))}
        className="page-fade-in w-full max-w-xl rounded-lg bg-paper px-6 py-6 shadow-(--shadow-menu)"
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="t-eyebrow eyebrow-rule">
            <span>{t.tips}</span>
          </div>
          <div className="t-meta shrink-0">
            <span className="font-serif-zh text-rose">{activeTip + 1}</span>
            <span className="text-ink-4"> / {t.createWorldTips.length}</span>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="-mx-6 flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={event => {
            const target = event.currentTarget
            const nextIndex = Math.round(target.scrollLeft / target.clientWidth)
            setActiveTip(Math.max(0, Math.min(t.createWorldTips.length - 1, nextIndex)))
          }}
        >
          {t.createWorldTips.map((text, index) => (
            <div key={index} className="w-full shrink-0 snap-center px-6">
              <article className="flex min-h-72 flex-col items-center justify-center border-y border-rose-line px-2 py-10 text-center">
                <span className="font-serif-zh text-5xl italic leading-none text-rose">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <p className="mt-8 max-w-md font-serif-zh text-[19px] leading-9 text-ink">
                  {text}
                </p>
              </article>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-3" aria-label={t.tips}>
          {t.createWorldTips.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`h-1.5 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 ${activeTip === index ? 'w-8 bg-rose' : 'w-1.5 bg-ink-4/45 hover:bg-ink-4/75'
                }`}
              aria-label={t.showTip(index + 1)}
              aria-current={activeTip === index}
              onClick={() => scrollToTip(index)}
            />
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="rounded-full bg-rose px-5 py-2.5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus-visible:ring-4 focus-visible:ring-rose/25"
            onClick={onClose}
          >
            {t.gotIt}
          </button>
        </div>
      </div>
    </div>
  )
}
