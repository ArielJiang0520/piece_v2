import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

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
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] mx-auto flex w-[min(92vw,24rem)] flex-col gap-2">
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

  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info
  const iconColor = toast.kind === 'success' ? 'text-signal-green' : toast.kind === 'error' ? 'text-signal-red' : 'text-ink-3'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto rounded-xl border border-line bg-surface px-4 py-3 text-ink shadow-(--shadow-menu) transition-all duration-200 ${visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-[13px] text-ink-3">{toast.description}</p>
          )}
          {toast.action && (
            <Link
              to={toast.action.href}
              onClick={handleDismiss}
              className="btn btn-tonal btn-sm mt-2"
            >
              {toast.action.label}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="-mr-2 -mt-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 active:bg-paper-2"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
