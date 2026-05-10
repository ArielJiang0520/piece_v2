import { useCallback, useEffect, useState } from 'react'

export function useScrollTopButton() {
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const updateScrollTopVisibility = () => {
      setShowScrollTop(window.scrollY > 0)
    }

    updateScrollTopVisibility()
    window.addEventListener('scroll', updateScrollTopVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollTopVisibility)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return {
    showScrollTop,
    scrollToTop,
  }
}
