import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import type { WorldDetail } from '../shared/worldTypes'

// Bookmark toggle, flipped in the cache at once so the tap answers immediately.
export function useBookmark(worldId: string | undefined, bookmarked: boolean) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      apiFetch(`/api/worlds/${worldId}/bookmark`, { method: next ? 'PUT' : 'DELETE' }),
    onMutate: next => {
      queryClient.setQueryData<WorldDetail>(['world', worldId], world => world && { ...world, bookmarked: next })
    },
    onError: (_error, next) => {
      queryClient.setQueryData<WorldDetail>(['world', worldId], world => world && { ...world, bookmarked: !next })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      // Profiles list worlds with their bookmark state too.
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  return {
    toggle: () => {
      if (!mutation.isPending) mutation.mutate(!bookmarked)
    },
  }
}
