import { useCallback, useEffect, useRef, useState } from 'react'

export function useScrollTopButton() {
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const node = topSentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(entries => {
      setShowScrollTop(!entries.some(entry => entry.isIntersecting))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return {
    topSentinelRef,
    showScrollTop,
    scrollToTop,
  }
}
