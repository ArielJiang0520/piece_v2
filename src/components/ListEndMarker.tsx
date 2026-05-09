interface ListEndMarkerProps {
  label: string
  className?: string
}

export default function ListEndMarker({ label, className }: ListEndMarkerProps) {
  return (
    <div
      className={[
        'mt-2 flex items-center gap-3 pb-3',
        className,
      ].filter(Boolean).join(' ')}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-linear-to-r from-transparent via-rose-line/80 to-rose-line/80" />
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-rose-line/70 bg-paper/80 px-3 py-1.5 shadow-[inset_0_0_18px_rgba(205,83,106,0.035)]">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose/70" />
        <span className="t-meta leading-none text-ink-3">{label}</span>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose/70" />
      </div>
      <span aria-hidden="true" className="h-px flex-1 bg-linear-to-l from-transparent via-rose-line/80 to-rose-line/80" />
    </div>
  )
}
