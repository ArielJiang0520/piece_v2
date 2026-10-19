import { Camera, ImagePlus } from 'lucide-react'
import type { WorldPhoto } from '@/pages/worlds/shared/worldTypes'

// A world's pictures: its cover, each character's portrait, and the album. Every link is null (the
// album empty) until uploads exist, so each has a placeholder that is also its permanent fallback.

function initial(name: string) {
  return (name.trim() || '?').charAt(0).toUpperCase()
}

// The cover, full width at the top of a card. Without one, a tinted panel with the world's initial.
export function WorldCover({ url, name, className = '' }: { url: string | null; name: string; className?: string }) {
  if (url) {
    return <img src={url} alt="" loading="lazy" className={`block w-full bg-paper-2 object-cover ${className}`} />
  }
  return (
    <div
      aria-hidden="true"
      className={`grid w-full place-items-center bg-linear-to-br from-rose-pale to-rose-tint ${className}`}
    >
      <span className="text-[40px] font-bold text-rose-deep opacity-60">{initial(name)}</span>
    </div>
  )
}

// A character's round portrait. Without one, the letter circle.
export function CharacterPortrait({ url, name, className = 'h-12 w-12 text-[18px]' }: {
  url: string | null
  name: string
  className?: string
}) {
  if (url) {
    return <img src={url} alt="" loading="lazy" className={`shrink-0 rounded-full bg-paper-2 object-cover ${className}`} />
  }
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-rose-pale font-bold text-rose-deep ${className}`}>
      {initial(name)}
    </span>
  )
}

// The album as a sideways-scrolling row. Renders nothing while it's empty: readers get no empty box.
export function AlbumStrip({ photos }: { photos: WorldPhoto[] }) {
  if (photos.length === 0) return null
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
      {photos.map(photo => (
        <img
          key={photo.id}
          src={photo.url}
          alt=""
          loading="lazy"
          className="aspect-[4/5] w-36 shrink-0 snap-start rounded-xl bg-paper-2 object-cover"
        />
      ))}
    </div>
  )
}

// Creator center upload slots. Disabled until uploads exist; they show where each picture will be set.
export function CoverSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-paper-2 text-ink-3"
    >
      <ImagePlus aria-hidden="true" className="h-6 w-6" />
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="t-hint">{hint}</span>
    </button>
  )
}

export function PortraitSlot({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-label={label}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-line bg-paper-2 text-ink-3"
    >
      <Camera aria-hidden="true" className="h-5 w-5" />
    </button>
  )
}
