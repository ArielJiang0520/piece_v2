import { useEffect, useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function RouteScrollManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return

    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname])

  return null
}
