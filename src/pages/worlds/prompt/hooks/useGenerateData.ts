import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import {
  PIECE_STRIP_LIMIT,
  type ClusterResponse,
  type PromptPiecesResponse,
} from '../../shared/types'

interface UseGenerateDataOptions {
  worldId: string | undefined
  queryPromptId: string | null
  lockedMode: boolean
  versionSourceClusterId: number | null
}

export function useGenerateData({
  worldId,
  queryPromptId,
  lockedMode,
  versionSourceClusterId,
}: UseGenerateDataOptions) {
  const navigate = useNavigate()

  const worldQuery = useQuery({
    queryKey: ['world', worldId],
    queryFn: () => apiFetch(`/api/worlds/${worldId}`) as Promise<{ name: string }>,
    enabled: !!worldId,
  })

  const promptDetailsQuery = useQuery({
    queryKey: ['prompt', worldId, queryPromptId, 'generate', PIECE_STRIP_LIMIT],
    queryFn: () =>
      apiFetch(`/api/worlds/${worldId}/prompts/${encodeURIComponent(queryPromptId!)}?limit=${PIECE_STRIP_LIMIT}`) as Promise<PromptPiecesResponse>,
    enabled: !!worldId && lockedMode && !!queryPromptId,
  })

  const activePrompt = promptDetailsQuery.data?.prompt ?? null
  const promptPieces = promptDetailsQuery.data?.pieces ?? []
  const activeClusterId = activePrompt?.cluster_id ?? versionSourceClusterId ?? null

  const clusterQuery = useQuery({
    queryKey: ['cluster', worldId, String(activeClusterId)],
    queryFn: () =>
      apiFetch(`/api/worlds/${worldId}/clusters/${activeClusterId}`) as Promise<ClusterResponse>,
    enabled: !!worldId && activeClusterId != null,
  })

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [navigate, worldQuery.isError])

  const clusterData = clusterQuery.data?.cluster
  return {
    activePrompt,
    promptPieces,
    activeClusterId,
    clusterPrompts: clusterQuery.data?.prompts ?? [],
    // The world version this cluster belongs to, for the prompt page's version tag.
    clusterVersion: clusterData
      ? {
        world_version_id: clusterData.world_version_id,
        version_number: clusterData.version_number,
        version_name: clusterData.version_name,
      }
      : null,
    clusterLoading: clusterQuery.isLoading,
    promptDetailsLoading: promptDetailsQuery.isLoading,
    promptDetailsError: promptDetailsQuery.isError,
  }
}
