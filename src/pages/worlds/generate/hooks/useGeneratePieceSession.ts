import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api'
import { useToast } from '@/components/Toast'
import type { GenerationCompletion } from '@/hooks/useGeneration'
import { useLanguageId, type LanguageId } from '@/preferences/language'
import { MODELS } from '@/preferences/generationModel'
import { containsChineseText } from '@/preferences/readingSpeed'
import { relativeTime } from '@/utils/time'
import {
  PIECE_STRIP_LIMIT,
  type PieceDetail,
  type PieceStripPiece,
  type PromptPiecesResponse,
  type SaveResponse,
  type SaveState,
} from '../types'

interface UseGeneratePieceSessionOptions {
  worldId: string | undefined
  queryPromptId: string | null
  lockedMode: boolean
  prompt: string
  normalizedPrompt: string
  output: string
  model: string
  provider: string
  generationId: string | null
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
  provider,
  generationId,
  displayComplete,
  completion,
  generationError,
  versionSourcePromptId,
  promptPieces,
  resetGeneration,
}: UseGeneratePieceSessionOptions) {
  const language = useLanguageId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null)
  const [pieceView, setPieceView] = useState<PieceView>('saved')
  const [pendingPieceNumber, setPendingPieceNumber] = useState<number | null>(null)
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const [generationDurationMs, setGenerationDurationMs] = useState<number | null>(null)
  const [generatedStatsPieceId, setGeneratedStatsPieceId] = useState<number | null>(null)
  const generationFirstOutputAtRef = useRef<number | null>(null)
  const generationDurationMsRef = useRef<number | null>(null)
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
  const displayedOutputCountLabel = outputCountLabel(displayedOutput, language)
  const displayedPieceMetaLabel = displayedPieceCreatedAt
    ? `${relativeTime(displayedPieceCreatedAt, language)} - ${displayedOutputCountLabel}`
    : null
  const displayedPieceModel = viewingPendingPiece ? model : selectedPiece?.model ?? null
  const displayedPieceProvider = viewingPendingPiece ? provider : selectedPiece?.provider ?? null
  const displayedPieceModelLabel = displayedPieceModel
    ? `${MODELS.find(m => m.id === displayedPieceModel)?.label ?? displayedPieceModel} (${displayedPieceProvider || 'Unknown Provider'})`
    : null
  const displayedGenerationDurationMs = viewingPendingPiece
    ? generationDurationMs ?? generationDurationMsRef.current
    : selectedPieceId !== null && selectedPieceId === generatedStatsPieceId
      ? generationDurationMs ?? generationDurationMsRef.current
      : null
  const displayedPieceFooterStatsLabel = displayedGenerationDurationMs !== null
    ? language === 'zh'
      ? `${displayedOutputCountLabel}，生成用时 ${formatGenerationDuration(displayedGenerationDurationMs, language)}`
      : `${displayedOutputCountLabel} generated in ${formatGenerationDuration(displayedGenerationDurationMs, language)}`
    : language === 'zh'
      ? `${displayedOutputCountLabel}已生成`
      : `${displayedOutputCountLabel} generated`

  const handleSave = useCallback(async (bodyOverride?: string) => {
    // Save exactly the text the reader sees. When they save mid-stream (paused),
    // the overlay hands us the revealed text; otherwise fall back to the buffer.
    const body = bodyOverride ?? output
    if (!worldId || !viewingPendingPiece || !body || saveState === 'saving' || saveState === 'saved') return
    setSaveState('saving')
    try {
      const result = await apiFetch(`/api/worlds/${worldId}/pieces`, {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          promptId: lockedMode && queryPromptId ? Number(queryPromptId) : undefined,
          versionSourcePromptId,
          body,
          model,
          provider: provider || undefined,
          generationId,
        }),
      }) as SaveResponse

      setSaveState('saved')
      pendingSavedSelectionRef.current = { promptId: String(result.promptId), pieceId: result.pieceId }
      if (generationDurationMsRef.current !== null) {
        setGeneratedStatsPieceId(result.pieceId)
      }
      setPieceView('saved')
      setPendingPieceNumber(null)
      queryClient.setQueryData(['piece', result.pieceId], {
        id: result.pieceId,
        body,
        model,
        provider: provider || null,
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
    viewingPendingPiece,
    saveState,
    lockedMode,
    generationId,
    model,
    provider,
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
      generationFirstOutputAtRef.current = null
      generationDurationMsRef.current = null
      setGenerationDurationMs(null)
      setGeneratedStatsPieceId(null)
      return
    }
    if (displayComplete && completion === 'completed' && generatedAt === null) {
      setGeneratedAt(Date.now())
    }
  }, [completion, displayComplete, generatedAt, output])

  useEffect(() => {
    if (!viewingPendingPiece || !output) return

    if (generationFirstOutputAtRef.current === null) {
      generationFirstOutputAtRef.current = Date.now()
    }

    if (displayComplete && completion === 'completed' && generationDurationMsRef.current === null) {
      const durationMs = Math.max(0, Date.now() - generationFirstOutputAtRef.current)
      generationDurationMsRef.current = durationMs
      setGenerationDurationMs(durationMs)
    }
  }, [completion, displayComplete, output, viewingPendingPiece])

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
    generationFirstOutputAtRef.current = null
    generationDurationMsRef.current = null
    setGenerationDurationMs(null)
    setGeneratedStatsPieceId(null)
    resetGenerationRef.current()
  }, [modeKey, queryPromptId])

  useEffect(() => {
    if (!lockedMode || viewingPendingPiece || selectedPieceId !== null || latestPieceId === null) return
    setSelectedPieceId(latestPieceId)
  }, [latestPieceId, lockedMode, selectedPieceId, viewingPendingPiece])

  const commitPendingPiece = useCallback((bodyOverride?: string) => {
    if (generationError || saveState !== 'idle') return
    void handleSave(bodyOverride)
  }, [generationError, handleSave, saveState])

  const prepareGeneration = useCallback((pendingBasePieceCount: number) => {
    setSelectedPieceId(null)
    setPieceView('pending')
    setPendingPieceNumber(pendingBasePieceCount + 1)
    setSaveState('idle')
    setGeneratedAt(null)
    generationFirstOutputAtRef.current = null
    generationDurationMsRef.current = null
    setGenerationDurationMs(null)
    setGeneratedStatsPieceId(null)
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
    generationFirstOutputAtRef.current = null
    generationDurationMsRef.current = null
    setGenerationDurationMs(null)
    setGeneratedStatsPieceId(null)
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
    displayedPieceModelLabel,
    displayedPieceFooterStatsLabel,
    prepareGeneration,
    cancelPendingGeneration,
    commitPendingPiece,
  }
}

function formatGenerationDuration(durationMs: number, language: LanguageId) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  if (language === 'zh') {
    if (totalSeconds < 60) return `${totalSeconds}秒`
    const totalMinutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return seconds === 0 ? `${totalMinutes}分钟` : `${totalMinutes}分钟${seconds}秒`
  }

  if (totalSeconds < 60) return `${totalSeconds} ${totalSeconds === 1 ? 'second' : 'seconds'}`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const minuteLabel = `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`
  if (seconds === 0) return minuteLabel

  return `${minuteLabel} ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}

function outputCountLabel(text: string, language: LanguageId) {
  if (language === 'zh') {
    const count = Array.from(text).filter(character => !/\s/u.test(character)).length
    return `${count.toLocaleString()}个字`
  }

  if (containsChineseText(text)) {
    const count = Array.from(text).filter(character => !/\s/u.test(character)).length
    return `${count.toLocaleString()} ${count === 1 ? 'character' : 'characters'}`
  }

  const count = text.match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu)?.length ?? 0
  return `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
}
