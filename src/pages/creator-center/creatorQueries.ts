import { useQuery, type QueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useUiText } from '@/i18n'
import type { CreatorWorldDetail } from '../worlds/shared/worldTypes'

// Everything a collection or scene change can show up in, on both sides: the creator center's lists, the
// reader's Scenes tab and scene pages (whose stories may now be outdated, or gone), and every card
// that counts the world's scenes or orders worlds by their last change.
export function invalidateWorldScenes(queryClient: QueryClient, worldId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: ['creator-collections', worldId] })
  queryClient.invalidateQueries({ queryKey: ['creator-collection', worldId] })
  queryClient.invalidateQueries({ queryKey: ['creator-scene', worldId] })
  queryClient.invalidateQueries({ queryKey: ['world-scenes', worldId] })
  queryClient.invalidateQueries({ queryKey: ['scene', worldId] })
  queryClient.invalidateQueries({ queryKey: ['world', worldId] })
  queryClient.invalidateQueries({ queryKey: ['world-draft', worldId] })
  queryClient.invalidateQueries({ queryKey: ['profile'] })
  queryClient.invalidateQueries({ queryKey: ['creator-worlds'] })
  queryClient.invalidateQueries({ queryKey: ['feed'] })
}

// The top bar's title inside a world's creator center, "Edit · <name>", with the draft's name, not the
// published one. undefined while loading; a world not created yet ('new') is untitled.
export function useCreatorTitle(worldId: string | undefined) {
  const t = useUiText()
  const worldQuery = useQuery({
    queryKey: ['world-draft', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}/draft`) as Promise<CreatorWorldDetail>,
    enabled: worldId !== 'new',
  })
  if (worldId === 'new') return t.editWorldTitle(t.untitled)
  return worldQuery.data ? t.editWorldTitle(worldQuery.data.name.trim() || t.untitled) : undefined
}
