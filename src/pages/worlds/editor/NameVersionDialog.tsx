import { useEffect, useId, useRef, useState } from 'react'
import { useUiText } from '@/i18n'

interface NameVersionDialogProps {
  open: boolean
  title: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  pendingLabel?: string
  isPending?: boolean
  error?: string
  onConfirm: (name: string) => void
  onClose: () => void
}

export default function NameVersionDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel,
  pendingLabel,
  isPending = false,
  error,
  onConfirm,
  onClose,
}: NameVersionDialogProps) {
  const t = useUiText()
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    const frame = requestAnimationFrame(() => inputRef.current?.focus())

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isPending, onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-8"
      role="presentation"
      onClick={() => {
        if (!isPending) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg border border-paper-3 bg-paper px-5 py-5 shadow-[0_24px_70px_rgba(26,18,16,0.22)]"
        onClick={event => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-serif-zh text-xl leading-tight text-ink">
          {title}
        </h2>

        {description && (
          <p className="mt-3 text-sm leading-6 text-ink-3">
            {description}
          </p>
        )}

        <input
          ref={inputRef}
          value={name}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !isPending) onConfirm(name.trim())
          }}
          placeholder={placeholder}
          disabled={isPending}
          className="mt-5 block w-full rounded-md border border-rose-line bg-paper-2/40 px-3.5 py-2.5 font-serif-zh text-[15px] italic leading-none text-ink placeholder:text-ink-4 focus:outline-none focus-visible:border-rose/50 disabled:opacity-50"
        />

        {error && (
          <p className="mt-4 rounded-md border border-rose/40 bg-rose-pale px-3 py-2 text-sm text-rose-deep">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-sm px-3 py-2 text-sm text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30 disabled:opacity-50"
            onClick={onClose}
            disabled={isPending}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            className="rounded-sm bg-rose-deep px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose focus:outline-none focus:ring-2 focus:ring-rose/35 disabled:opacity-50"
            onClick={() => onConfirm(name.trim())}
            disabled={isPending}
          >
            {isPending && pendingLabel ? pendingLabel : confirmLabel ?? t.createVersion}
          </button>
        </div>
      </div>
    </div>
  )
}
