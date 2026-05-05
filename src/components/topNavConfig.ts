import { createContext, useContext, useEffect, type ReactNode } from 'react'

export interface TopNavConfig {
  mainTitle?: string
  secondaryTitle?: string
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
  const { mainTitle, secondaryTitle, backHref, rightAction } = config
  useEffect(() => {
    setConfig({ mainTitle, secondaryTitle, backHref, rightAction })
    return () => setConfig({})
  }, [setConfig, mainTitle, secondaryTitle, backHref, rightAction])
}
