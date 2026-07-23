import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

// A one-card-at-a-time horizontal deck, browsed by dragging. Deliberately not scroll-snap:
// iOS recomputes snap points whenever the deck is appended to, which fights a controlled index
// and jerks the reader mid-swipe. Here the index is ours and the drag is just a transform.
//
// Swiping is browsing, not judging — going forward is not "reject" and going back is not "undo".
// The only decisions are the buttons on the card.

// How far a drag must travel before it wins the gesture from a vertical scroll.
const INTENT_THRESHOLD_PX = 8
// Past this fraction of the width, releasing lands on the next card…
const COMMIT_FRACTION = 0.25
// …and below it, a fast flick still commits.
const FLICK_VELOCITY = 0.5

interface Props {
  count: number
  index: number
  onIndexChange: (index: number) => void
  renderSlide: (index: number) => ReactNode
}

export default function DiscoverCarousel({ count, index, onIndexChange, renderSlide }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{
    pointerId: number
    startX: number
    startY: number
    startedAt: number
    axis: 'unknown' | 'horizontal' | 'vertical'
  } | null>(null)

  // A refill landing (or the deck shrinking) must never leave the reader on a slide that no
  // longer exists.
  useEffect(() => {
    if (index > Math.max(0, count - 1)) onIndexChange(Math.max(0, count - 1))
  }, [count, index, onIndexChange])

  function width() {
    return containerRef.current?.clientWidth || 1
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current) return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      axis: 'unknown',
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return

    const dx = event.clientX - active.startX
    const dy = event.clientY - active.startY

    if (active.axis === 'unknown') {
      if (Math.abs(dx) < INTENT_THRESHOLD_PX && Math.abs(dy) < INTENT_THRESHOLD_PX) return
      // Nothing here scrolls, so a vertical drag is a mis-swipe rather than a competing gesture:
      // it moves nothing, and the reader can start over without lifting into a half-scrolled page.
      active.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      if (active.axis === 'horizontal') {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }
    }
    if (active.axis !== 'horizontal') return

    // Rubber-band at both ends so the deck feels bounded rather than broken.
    const atStart = index === 0 && dx > 0
    const atEnd = index >= count - 1 && dx < 0
    setDrag(atStart || atEnd ? dx * 0.3 : dx)
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    if (active.axis !== 'horizontal') return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const dx = event.clientX - active.startX
    const velocity = Math.abs(dx) / Math.max(1, Date.now() - active.startedAt)
    const committed = Math.abs(dx) > width() * COMMIT_FRACTION || velocity > FLICK_VELOCITY
    const next = committed ? index + (dx < 0 ? 1 : -1) : index
    setDragging(false)
    setDrag(0)
    const clamped = Math.max(0, Math.min(next, Math.max(0, count - 1)))
    if (clamped !== index) onIndexChange(clamped)
  }

  // Only the neighbours are mounted: the deck can run to dozens of cards, and everything
  // off-screen is a card the reader may never reach.
  const visible: number[] = []
  for (let slide = index - 1; slide <= index + 1; slide++) {
    if (slide >= 0 && slide < count) visible.push(slide)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 touch-none select-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {visible.map(slide => (
        <div
          key={slide}
          aria-hidden={slide !== index}
          className={`absolute inset-0 flex ${dragging ? '' : 'transition-transform duration-300 ease-out'}`}
          style={{ transform: `translate3d(calc(${(slide - index) * 100}% + ${drag}px), 0, 0)` }}
        >
          {renderSlide(slide)}
        </div>
      ))}
    </div>
  )
}
