import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import {
  activeAdditionIdsFor,
  setActiveAdditionIds,
  useActiveAdditionsState,
} from '@/preferences/activeAdditions'

export interface WorldAddition {
  id: number
  name: string
  body: string
  created_at: number
  updated_at: number
}

// The additions on this world's checked-out version, plus which of them are switched on. Every
// screen that sends a world to a model reads from here, so they all agree on what "on" means.
export function useWorldAdditions(worldId: string | undefined) {
  const state = useActiveAdditionsState()

  const worldQuery = useQuery({
    queryKey: ['world', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}`) as Promise<{ current_version_id: number | null }>,
    enabled: !!worldId,
  })
  const additionsQuery = useQuery({
    queryKey: ['world-additions', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}/additions`) as Promise<WorldAddition[]>,
    enabled: !!worldId,
  })

  const numericWorldId = worldId ? Number(worldId) : null
  const worldVersionId = worldQuery.data?.current_version_id ?? null
  const additions = additionsQuery.data ?? []

  // What gets sent. Deliberately NOT narrowed to additions that are currently loaded: the list
  // arrives a moment after the screen does, and a generation started in that moment must still
  // carry the reader's set. The server resolves these against the version and drops the rest.
  const activeIds = activeAdditionIdsFor(state, numericWorldId, worldVersionId)
  // What gets shown. Only additions that actually exist have a name to render.
  const activeAdditions = additions.filter(addition => activeIds.includes(addition.id))

  function setIds(ids: number[]) {
    if (numericWorldId == null || worldVersionId == null) return
    setActiveAdditionIds(numericWorldId, worldVersionId, ids)
  }

  function toggle(additionId: number) {
    setIds(activeIds.includes(additionId)
      ? activeIds.filter(id => id !== additionId)
      : [...activeIds, additionId])
  }

  return {
    additions,
    additionsLoading: additionsQuery.isLoading,
    activeIds,
    activeAdditions,
    worldVersionId,
    // Whether activeIds can be trusted yet. It is derived from the checked-out version, so
    // before the world resolves it reads as "nothing on" — which a generation fired on mount
    // would silently take at face value. Screens that auto-start wait for this.
    ready: !worldQuery.isLoading,
    toggle,
    setIds,
  }
}

// Names for a stored set of ids, in shelf order. Ids with no addition left behind them are
// reported separately: that piece was written with something that has since been deleted, which
// is worth saying rather than quietly rendering a shorter list.
export function describeAdditionIds(additions: WorldAddition[], ids: number[]) {
  const names = additions.filter(addition => ids.includes(addition.id)).map(addition => addition.name)
  return { names, missingCount: ids.length - names.length }
}

export function sameAdditionSet(a: number[], b: number[]) {
  return a.length === b.length && a.every(id => b.includes(id))
}
