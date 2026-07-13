import type { CSSProperties } from 'react'
import { useUiText } from '@/i18n'

export interface MarkerTick {
  segmentIndex: number
  label: string
  // Position along the scrollable content, 0 (top) → 1 (bottom).
  fraction: number
}

// Glide a marker element to the middle of the reader and give it a brief rose outline.
// Shared by every rail (streaming overlay + static reader) so the feedback is identical.
export function revealMarker(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.style.boxShadow = '0 0 0 2px var(--color-rose)'
  window.setTimeout(() => {
    el.style.boxShadow = ''
  }, 900)
}

// A thin rail that surfaces a piece's action boundaries all at once: one tick per marker at
// its real vertical position, plus the current viewport as a faint band so the reader sees
// how many branch points there are and where they sit. Tapping a tick jumps to that marker
// (navigation only — re-running lives on the chip itself). Left edge for the one-handed
// thumb; thin rose line to match the speed bar, no new widget. The container is positioned
// by the caller (absolute inside the overlay's scroll region, or fixed over the page).
export default function MarkerRail({
  ticks,
  view,
  onJump,
  containerClassName = 'pointer-events-none absolute inset-y-0 left-0 z-10 w-8 pl-[env(safe-area-inset-left)]',
  containerStyle,
}: {
  ticks: MarkerTick[]
  view: { top: number; height: number }
  onJump: (segmentIndex: number) => void
  containerClassName?: string
  containerStyle?: CSSProperties
}) {
  const t = useUiText()
  // Ticks live inside an 8px top/bottom inset so the first/last never clip the edge.
  const pos = (fraction: number) => `calc(0.5rem + ${fraction} * (100% - 1rem))`
  return (
    <div className={containerClassName} style={containerStyle}>
      <div className="relative h-full">
        <div className="absolute left-3 top-2 bottom-2 w-px -translate-x-1/2 bg-rose-line" />
        <div
          className="absolute left-3 w-1 -translate-x-1/2 rounded-full bg-rose/20"
          style={{ top: pos(view.top), height: `calc(${view.height} * (100% - 1rem))` }}
        />
        {ticks.map(tk => (
          <button
            key={tk.segmentIndex}
            type="button"
            aria-label={`${t.jumpToMarker} · ${tk.label}`}
            onClick={() => onJump(tk.segmentIndex)}
            className="pointer-events-auto absolute left-3 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ top: pos(tk.fraction) }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose ring-2 ring-paper transition-transform active:scale-150" />
          </button>
        ))}
      </div>
    </div>
  )
}
