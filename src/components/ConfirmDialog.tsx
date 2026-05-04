import { useEffect, useId } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  pendingLabel?: string
  isPending?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pendingLabel,
  isPending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
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
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-sm bg-rose-deep px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose focus:outline-none focus:ring-2 focus:ring-rose/35 disabled:opacity-50"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && pendingLabel ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
