import { useEffect, useState } from 'react'

interface ViewportBox {
  height: number
  offsetTop: number
}

// The on-screen keyboard is the whole problem here. Chrome/Android honors
// `interactive-widget=resizes-content` (set in index.html) and shrinks the layout viewport,
// but iOS Safari does not — it leaves the layout viewport alone and scrolls the page up
// instead, which is what makes a bottom-anchored composer drift off screen.
//
// visualViewport reports what is actually visible in both cases, so a full-screen surface
// sized and positioned from it stays pinned to the real viewport with the keyboard open.
// Returns null until measured (and on the rare browser without the API), so callers can
// fall back to 100dvh.
export function useVisualViewport(enabled = true): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null)

  useEffect(() => {
    if (!enabled) return
    const viewport = window.visualViewport
    if (!viewport) return

    function update() {
      const current = window.visualViewport
      if (!current) return
      setBox({ height: current.height, offsetTop: current.offsetTop })
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      setBox(null)
    }
  }, [enabled])

  return box
}
