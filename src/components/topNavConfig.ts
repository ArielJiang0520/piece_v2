import { createContext, useContext, useEffect, type ReactNode } from 'react'

export interface TopNavConfig {
  title?: string
  hideSecondaryTitle?: boolean
  backHref?: string
  rightAction?: ReactNode
}

export const TopNavConfigContext = createContext<TopNavConfig>({})
export const TopNavSetConfigContext = createContext<(config: TopNavConfig) => void>(() => {})

export function useCurrentTopNavConfig() {
  return useContext(TopNavConfigContext)
}

export function useTopNavConfig(config: TopNavConfig) {
  const setConfig = useContext(TopNavSetConfigContext)
  const { title, hideSecondaryTitle, backHref, rightAction } = config
  useEffect(() => {
    setConfig({ title, hideSecondaryTitle, backHref, rightAction })
    return () => setConfig({})
  }, [setConfig, title, hideSecondaryTitle, backHref, rightAction])
}
