import { useMemo } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import TabBar from '@/components/TabBar'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useUiText } from '@/i18n'
import type { AutosaveStatus } from '@/hooks/useAutosave'
import { useLanguageId } from '@/preferences/language'
import CreatorStatusBar, { CreatorSaveLine } from './CreatorStatusBar'
import { useCreatorTitle } from './creatorQueries'

export type CreatorTab = 'world' | 'scenes'

interface Props {
  active: CreatorTab
  worldId: string | undefined
}

// The creator center's two tabs: the world's description (for readers and for the AI), and its scenes.
export default function CreatorTabs({ active, worldId }: Props) {
  const language = useLanguageId()
  const t = useUiText()
  return (
    <TabBar
      active={active}
      replace
      label={t.creatorCenter}
      tabs={[
        { id: 'world', label: t.world, to: `/worlds/${worldId}/edit` },
        { id: 'scenes', label: t.scenes, to: `/worlds/${worldId}/edit/scenes` },
      ]}
    />
  )
}

interface HeaderProps extends Props {
  // The tab's own autosave, for the status bar (and Publish flushes it first).
  saveStatus: AutosaveStatus
  flush?: () => Promise<unknown>
}

// The top of both creator center tabs, the same on each: the world's name (the draft's), then the status
// bar with Publish — it is about the whole world, so it sits above the tabs
// — then the tabs. A world not created yet ('new') has neither tabs nor Publish, only whether it is
// saving.
export function CreatorWorldHeader({ active, worldId, saveStatus, flush }: HeaderProps) {
  const t = useUiText()
  const title = useCreatorTitle(worldId)
  const isNew = worldId === 'new'

  const bottomSlot = useMemo(() => isNew ? <CreatorSaveLine saveStatus={saveStatus} /> : (
    <>
      <CreatorStatusBar worldId={worldId} saveStatus={saveStatus} flush={flush} />
      <CreatorTabs active={active} worldId={worldId} />
    </>
  ), [active, flush, isNew, saveStatus, worldId])
  useTopNavConfig({ mainTitle: title, backHref: '/creator-center', bottomSlot })
  return null
}

// "Saved" / "Saving..." for the top bar, so the author never wonders whether to press anything.
export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const t = useUiText()
  if (status === 'error') {
    return (
      <span className="badge mr-1 text-signal-red" aria-live="polite">
        <AlertCircle aria-hidden="true" />
        {t.couldNotSaveDraft}
      </span>
    )
  }
  return (
    <span className="badge mr-1" aria-live="polite">
      {status === 'saving'
        ? <Loader2 aria-hidden="true" className="animate-spin" />
        : <Check aria-hidden="true" className="text-signal-green" />}
      {status === 'saving' ? t.saving : t.saved}
    </span>
  )
}
