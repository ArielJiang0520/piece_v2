import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'

// Switching the checked-out world version (git-switch: moves HEAD, mirrors the version's body onto
// the world). Shared by the header quick-switcher and the About tab so both invalidate the same
// queries — including the prompt list, which is filtered by the current version.
export function useSwitchWorldVersion(worldId: string | number | undefined) {
  const queryClient = useQueryClient()
  const id = worldId == null ? undefined : String(worldId)
  return useMutation({
    mutationFn: (versionId: number) =>
      apiFetch(`/api/worlds/${id}/versions/${versionId}/switch`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-versions', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters-count', id] })
      // Additions belong to a version too, so the shelf changes with the switch.
      queryClient.invalidateQueries({ queryKey: ['world-additions', id] })
    },
  })
}
