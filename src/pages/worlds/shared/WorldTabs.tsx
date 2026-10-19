import TabBar from '@/components/TabBar'
import { useUiText } from '@/i18n'
import { useLanguageId } from '@/preferences/language'

export type WorldTab = 'scenes' | 'about'

interface Props {
  active: WorldTab
  worldId: string | number | undefined
  sceneCount?: number
}

export default function WorldTabs({ active, worldId, sceneCount }: Props) {
  const language = useLanguageId()
  const t = useUiText()
  return (
    <TabBar
      active={active}
      label={t.world}
      tabs={[
        { id: 'about', label: t.about, to: `/worlds/${worldId}` },
        { id: 'scenes', label: t.scenes, to: `/worlds/${worldId}/scenes`, count: sceneCount },
      ]}
    />
  )
}
