import { Trash2 } from 'lucide-react'

interface Props {
  label: string
  onClick: () => void
  disabled?: boolean
}

export default function DeleteIconButton({ label, onClick, disabled = false }: Props) {
  return (
    <button
      type="button"
      className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-rose-deep focus:outline-none focus:ring-2 focus:ring-rose/30 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Trash2 aria-hidden="true" className="h-5 w-5" />
    </button>
  )
}
