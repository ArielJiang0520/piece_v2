import { useEffect, useId } from 'react'
import { useUiText } from '@/i18n'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  pendingLabel?: string
  isPending?: boolean
  error?: string
  // Override the stacking layer when the dialog must sit above another fixed overlay.
  zClass?: string
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  isPending = false,
  error,
  zClass = 'z-50',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const t = useUiText()
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) onClose()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isPending, onClose, open])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/45 px-5 py-8`}
      role="presentation"
      onClick={() => {
        if (!isPending) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-(--shadow-menu)"
        onClick={event => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[18px] font-bold leading-snug text-ink">
          {title}
        </h2>

        {description && (
          <p className="mt-2 text-[15px] leading-relaxed text-ink-3">
            {description}
          </p>
        )}

        {error && <p className="error-box mt-4">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isPending}
          >
            {cancelLabel ?? t.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && pendingLabel ? pendingLabel : confirmLabel ?? t.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
