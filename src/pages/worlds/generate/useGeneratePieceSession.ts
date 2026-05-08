import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useToast } from '@/components/Toast'
import type { GenerationCompletion } from '@/hooks/useGeneration'
import { relativeTime } from '@/utils/time'
import {
  PIECE_STRIP_LIMIT,
  type PieceDetail,
  type PieceStripPiece,
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
  promptPieces: PieceStripPiece[]
  resetGeneration: () => void
}

type PieceView = 'saved' | 'pending'

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
  promptPieces,
  resetGeneration,
}: UseGeneratePieceSessionOptions) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null)
  const [pieceView, setPieceView] = useState<PieceView>('saved')
  const [pendingPieceNumber, setPendingPieceNumber] = useState<number | null>(null)
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
  const latestPieceId = promptPieces[0]?.id ?? null
  const viewingPendingPiece = pieceView === 'pending'
  const viewingSavedPiece = pieceView === 'saved' && selectedPieceId !== null
  const displayedOutput = viewingPendingPiece ? output : viewingSavedPiece ? selectedPiece?.body ?? '' : ''
  const outputDisplayComplete = viewingPendingPiece ? displayComplete : viewingSavedPiece ? !!selectedPiece : false
  const displayedPieceCreatedAt = viewingPendingPiece ? generatedAt : selectedPiece?.created_at ?? null
  const displayedOutputCountLabel = outputCountLabel(displayedOutput)
  const displayedPieceMetaLabel = displayedPieceCreatedAt
    ? `${relativeTime(displayedPieceCreatedAt)} - ${displayedOutputCountLabel}`
    : null

  const canSave = viewingPendingPiece && !streaming && !!output && saveState !== 'saving' && saveState !== 'saved'

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
      setPieceView('saved')
      setPendingPieceNumber(null)
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
      setPieceView('saved')
      pendingSavedSelectionRef.current = null
    } else {
      setSelectedPieceId(null)
      setPieceView('saved')
    }

    setPendingPieceNumber(null)
    setSaveState('idle')
    setGeneratedAt(null)
    resetGenerationRef.current()
  }, [modeKey, queryPromptId])

  useEffect(() => {
    if (!lockedMode || viewingPendingPiece || selectedPieceId !== null || latestPieceId === null) return
    setSelectedPieceId(latestPieceId)
  }, [latestPieceId, lockedMode, selectedPieceId, viewingPendingPiece])

  useEffect(() => {
    if (!displayComplete || completion !== 'completed' || !output || generationError || saveState !== 'idle') return
    void handleSave()
  }, [completion, displayComplete, generationError, handleSave, output, saveState])

  const prepareGeneration = useCallback((pendingBasePieceCount: number) => {
    setSelectedPieceId(null)
    setPieceView('pending')
    setPendingPieceNumber(pendingBasePieceCount + 1)
    setSaveState('idle')
    setGeneratedAt(null)
  }, [])

  const selectPiece = useCallback((pieceId: number) => {
    setSelectedPieceId(pieceId)
    setPieceView('saved')
  }, [])

  const selectPendingPiece = useCallback(() => {
    if (pendingPieceNumber === null) return
    setSelectedPieceId(null)
    setPieceView('pending')
  }, [pendingPieceNumber])

  const cancelPendingGeneration = useCallback(() => {
    setPieceView('saved')
    setPendingPieceNumber(null)
    setSelectedPieceId(latestPieceId)
    setSaveState('idle')
    setGeneratedAt(null)
  }, [latestPieceId])

  return {
    saveState,
    selectedPieceId,
    selectPiece,
    selectPendingPiece,
    viewingPendingPiece,
    viewingSavedPiece,
    pendingPieceNumber,
    displayedOutput,
    outputDisplayComplete,
    displayedPieceMetaLabel,
    prepareGeneration,
    cancelPendingGeneration,
  }
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
