interface ListEndMarkerProps {
  label: string
  className?: string
}

export default function ListEndMarker({ label, className }: ListEndMarkerProps) {
  return (
    <div className={['flex items-center gap-3 py-6', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span className="t-meta shrink-0">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  )
}
