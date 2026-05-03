import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastInput {
  kind?: ToastKind
  title: string
  description?: string
  action?: { label: string; href: string }
  durationMs?: number
}

interface Toast extends Required<Pick<ToastInput, 'title'>> {
  id: number
  kind: ToastKind
  description?: string
  action?: { label: string; href: string }
  durationMs: number
}

interface ToastContextValue {
  show: (toast: ToastInput) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const DEFAULT_DURATION_MS = 5000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((input: ToastInput) => {
    const id = ++idRef.current
    const toast: Toast = {
      id,
      kind: input.kind ?? 'info',
      title: input.title,
      description: input.description,
      action: input.action,
      durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
    }
    setToasts(prev => [...prev, toast])
    return id
  }, [])

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const inFrame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(inFrame)
  }, [])

  useEffect(() => {
    if (toast.durationMs <= 0) return
    const timer = setTimeout(() => handleDismiss(), toast.durationMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.durationMs])

  function handleDismiss() {
    setVisible(false)
    setTimeout(onDismiss, 200)
  }

  const accent =
    toast.kind === 'success' ? 'border-l-rose'
      : toast.kind === 'error' ? 'border-l-rose-deep'
        : 'border-l-ink-3'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto rounded-sm border border-paper-3 border-l-4 ${accent} bg-paper-2 px-4 py-3 text-ink shadow-[0_14px_30px_rgba(54,44,38,0.16)] transition-all duration-200 ${visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.description && (
            <p className="mt-1 text-xs text-ink-3">{toast.description}</p>
          )}
          {toast.action && (
            <Link
              to={toast.action.href}
              onClick={handleDismiss}
              className="mt-2 inline-block text-xs font-medium text-rose-deep underline-offset-2 hover:underline"
            >
              {toast.action.label}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
