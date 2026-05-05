import { useState, type ReactNode } from 'react'
import { TopNavConfigContext, TopNavSetConfigContext, type TopNavConfig } from './topNavConfig'

export default function TopNavProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TopNavConfig>({})
  return (
    <TopNavSetConfigContext.Provider value={setConfig}>
      <TopNavConfigContext.Provider value={config}>
        {children}
      </TopNavConfigContext.Provider>
    </TopNavSetConfigContext.Provider>
  )
}
