import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useToast } from '@/components/Toast'
import { MODELS } from '@/preferences/generationModel'
import type { GenerationCompletion } from '@/hooks/useGeneration'
import { relativeTime } from '@/utils/time'
import {
  PIECE_STRIP_LIMIT,
  type PieceDetail,
  type PromptPiecesResponse,
  type SaveResponse,
  type SaveState,
} from './generateTypes'

interface UseGeneratePieceSessionOptions {
  worldId: string | undefined
  queryPromptId: string | null
  lockedMode: boolean
  prompt: string
  normalizedPrompt: string
  output: string
  model: string
  streaming: boolean
  displayComplete: boolean
  completion: GenerationCompletion
  generationError: string
  versionSourcePromptId: number | null
  resetGeneration: () => void
}

export function useGeneratePieceSession({
  worldId,
  queryPromptId,
  lockedMode,
  prompt,
  normalizedPrompt,
  output,
  model,
  streaming,
  displayComplete,
  completion,
  generationError,
  versionSourcePromptId,
  resetGeneration,
}: UseGeneratePieceSessionOptions) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null)
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const pendingSavedSelectionRef = useRef<{ promptId: string; pieceId: number } | null>(null)
  const previousModeKeyRef = useRef<string | null>(null)
  const resetGenerationRef = useRef(resetGeneration)
  resetGenerationRef.current = resetGeneration

  const selectedPieceQuery = useQuery({
    queryKey: ['piece', selectedPieceId],
    queryFn: () => apiFetch(`/api/pieces/${selectedPieceId}`) as Promise<PieceDetail>,
    enabled: selectedPieceId != null,
  })

  const selectedPiece = selectedPieceQuery.data ?? null
  const viewingSavedPiece = selectedPieceId !== null
  const viewingNewPiece = lockedMode && selectedPieceId === null
  const displayedOutput = viewingSavedPiece ? selectedPiece?.body ?? '' : viewingNewPiece && saveState === 'saved' ? '' : output
  const outputDisplayComplete = viewingSavedPiece ? !!selectedPiece : viewingNewPiece && saveState === 'saved' ? false : displayComplete
  const displayedPieceCreatedAt = selectedPiece?.created_at ?? generatedAt
  const displayedPieceModel = selectedPiece?.model ?? model
  const displayedOutputCountLabel = outputCountLabel(displayedOutput)
  const displayedPieceMetaLabel = displayedPieceCreatedAt
    ? `${relativeTime(displayedPieceCreatedAt)} - ${modelLabel(displayedPieceModel)} - ${displayedOutputCountLabel}`
    : null

  const canSave = !streaming && !!output && saveState !== 'saving' && saveState !== 'saved'

  const handleSave = useCallback(async () => {
    if (!worldId || !canSave) return
    setSaveState('saving')
    try {
      const result = await apiFetch(`/api/worlds/${worldId}/pieces`, {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          promptId: lockedMode && queryPromptId ? Number(queryPromptId) : undefined,
          versionSourcePromptId,
          body: output,
          model,
        }),
      }) as SaveResponse

      setSaveState('saved')
      pendingSavedSelectionRef.current = { promptId: String(result.promptId), pieceId: result.pieceId }
      queryClient.setQueryData(['piece', result.pieceId], {
        id: result.pieceId,
        body: output,
        model,
        created_at: Date.now(),
      })
      queryClient.setQueryData<PromptPiecesResponse>(
        ['prompt', worldId, String(result.promptId), 'generate', PIECE_STRIP_LIMIT],
        current => ({
          prompt: {
            id: current?.prompt.id ?? result.promptId,
            text: current?.prompt.text ?? normalizedPrompt,
            cluster_id: result.clusterId,
            piece_count: result.pieceCount,
            created_at: current?.prompt.created_at ?? Date.now(),
            updated_at: Date.now(),
          },
          pieces: [
            { id: result.pieceId },
            ...(current?.pieces.filter(piece => piece.id !== result.pieceId) ?? []),
          ].slice(0, PIECE_STRIP_LIMIT),
        }),
      )
      setSelectedPieceId(result.pieceId)
      queryClient.invalidateQueries({ queryKey: ['prompt', worldId, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['piece', result.pieceId] })
      queryClient.invalidateQueries({ queryKey: ['world', worldId] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', worldId] })
      queryClient.invalidateQueries({ queryKey: ['cluster', worldId] })

      navigate(`/worlds/${worldId}/generate?promptId=${result.promptId}`, { replace: true })
    } catch (err) {
      setSaveState('error')
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [
    canSave,
    lockedMode,
    model,
    navigate,
    normalizedPrompt,
    output,
    prompt,
    queryClient,
    queryPromptId,
    toast,
    versionSourcePromptId,
    worldId,
  ])

  useEffect(() => {
    if (streaming) {
      setSelectedPieceId(null)
      setSaveState('idle')
      setGeneratedAt(null)
    }
  }, [streaming])

  useEffect(() => {
    if (!output) {
      setGeneratedAt(null)
      return
    }
    if (displayComplete && completion === 'completed' && generatedAt === null) {
      setGeneratedAt(Date.now())
    }
  }, [completion, displayComplete, generatedAt, output])

  const modeKey = `${worldId ?? ''}:${queryPromptId ? `prompt:${queryPromptId}` : versionSourcePromptId ? `version-draft:${versionSourcePromptId}` : 'blank'}`
  useEffect(() => {
    if (previousModeKeyRef.current === modeKey) return
    previousModeKeyRef.current = modeKey
    const pendingSelection = pendingSavedSelectionRef.current

    if (pendingSelection && queryPromptId === pendingSelection.promptId) {
      setSelectedPieceId(pendingSelection.pieceId)
      pendingSavedSelectionRef.current = null
    } else {
      setSelectedPieceId(null)
    }

    setSaveState('idle')
    setGeneratedAt(null)
    resetGenerationRef.current()
  }, [modeKey, queryPromptId])

  useEffect(() => {
    if (!displayComplete || completion !== 'completed' || !output || generationError || saveState !== 'idle') return
    void handleSave()
  }, [completion, displayComplete, generationError, handleSave, output, saveState])

  const prepareGeneration = useCallback(() => {
    setSelectedPieceId(null)
    setGeneratedAt(null)
  }, [])

  return {
    saveState,
    selectedPieceId,
    setSelectedPieceId,
    viewingSavedPiece,
    displayedOutput,
    outputDisplayComplete,
    displayedPieceMetaLabel,
    prepareGeneration,
  }
}

function modelLabel(modelId: string | null | undefined) {
  return MODELS.find(option => option.id === modelId)?.label ?? modelId ?? 'Unknown model'
}

function outputCountLabel(text: string) {
  if (containsChinese(text)) {
    const count = Array.from(text).filter(character => !/\s/u.test(character)).length
    return `${count} ${count === 1 ? 'character' : 'characters'}`
  }

  const count = text.match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu)?.length ?? 0
  return `${count} ${count === 1 ? 'word' : 'words'}`
}

function containsChinese(text: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text)
}
