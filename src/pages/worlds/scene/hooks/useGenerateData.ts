import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { STORY_STRIP_LIMIT, type SceneStoriesResponse } from '../../shared/types'

interface UseGenerateDataOptions {
  worldId: string | undefined
  sceneId: string | undefined
}

export function sceneQueryKey(worldId: string | undefined, sceneId: string | number | undefined) {
  return ['scene', worldId, String(sceneId), STORY_STRIP_LIMIT]
}

export function fetchScene(worldId: string | undefined, sceneId: string | number | undefined) {
  return apiFetch(`/api/worlds/${worldId}/scenes/${sceneId}?limit=${STORY_STRIP_LIMIT}`) as Promise<SceneStoriesResponse>
}

// The scene on screen and this reader's saved stories of it.
export function useGenerateData({ worldId, sceneId }: UseGenerateDataOptions) {
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: sceneQueryKey(worldId, sceneId),
    queryFn: () => fetchScene(worldId, sceneId),
    enabled: !!worldId && !!sceneId,
  })

  // A scene that isn't (or is no longer) there — deleted by the author, or a world that was never
  // published — has nothing to show here.
  useEffect(() => {
    if (query.isError) navigate(worldId ? `/worlds/${worldId}/scenes` : '/', { replace: true })
  }, [navigate, query.isError, worldId])

  return {
    activeScene: query.data?.scene ?? null,
    sceneStories: query.data?.stories ?? [],
    sceneDetailsLoading: query.isLoading,
  }
}
