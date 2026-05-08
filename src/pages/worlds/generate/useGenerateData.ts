import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import type { PromptSummary } from '@/hooks/usePromptMatch'
import {
  PIECE_STRIP_LIMIT,
  type ClusterResponse,
  type PromptPiecesResponse,
} from './generateTypes'

interface UseGenerateDataOptions {
  worldId: string | undefined
  queryPromptId: string | null
  lockedMode: boolean
  loadedPrompt: PromptSummary | null
  promptPieceCount: number
}

export function useGenerateData({
  worldId,
  queryPromptId,
  lockedMode,
  loadedPrompt,
  promptPieceCount,
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
  const activeClusterId = activePrompt?.cluster_id ?? loadedPrompt?.cluster_id ?? null

  const clusterQuery = useQuery({
    queryKey: ['cluster', worldId, String(activeClusterId)],
    queryFn: () =>
      apiFetch(`/api/worlds/${worldId}/clusters/${activeClusterId}`) as Promise<ClusterResponse>,
    enabled: !!worldId && lockedMode && activeClusterId != null,
  })

  const promptCardPieceCount = lockedMode
    ? activePrompt?.piece_count ?? promptPieceCount
    : promptPieceCount

  const variationNumber = useMemo(() => {
    if (!queryPromptId || !clusterQuery.data) return null
    const index = clusterQuery.data.prompts.findIndex(prompt => String(prompt.id) === queryPromptId)
    return index >= 0 ? index + 1 : null
  }, [clusterQuery.data, queryPromptId])
  const showHistoryLink = lockedMode && activeClusterId != null && (clusterQuery.data?.prompts.length ?? 0) > 1

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [navigate, worldQuery.isError])

  return {
    activePrompt,
    promptPieces,
    activeClusterId,
    promptCardPieceCount,
    promptDetailsLoading: promptDetailsQuery.isLoading,
    variationNumber,
    showHistoryLink,
  }
}
