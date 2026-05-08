import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, GitBranch, Pencil, Settings, X } from 'lucide-react'
import { apiFetch } from '@/api'
import { useGeneration } from '@/hooks/useGeneration'
import { usePromptMatch } from '@/hooks/usePromptMatch'
import { useTopNavConfig } from '@/components/topNavConfig'
import { useToast } from '@/components/Toast'
import { MODELS, setGenerationModel, useGenerationModel } from '@/preferences/generationModel'
import { setReadingFont, useReadingFont } from '@/preferences/readingFont'
import { setReadingFontSize, useReadingFontSize } from '@/preferences/readingFontSize'
import {
  setReadingSpeedUnitsPerSecond,
  useReadingSpeedUnitsPerSecond,
} from '@/preferences/readingSpeed'
import { relativeTime } from '@/utils/time'
import PromptCard from './PromptCard'
import SettingsPanel from './SettingsPanel'
import PieceStrip, { type PieceStripPiece } from './PieceStrip'
import OutputPanel from './OutputPanel'

const PIECE_STRIP_LIMIT = 24

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SaveResponse {
  promptId: number
  pieceId: number
  pieceCount: number
  clusterId: number | null
  isNewPrompt: boolean
}

interface PromptDetail {
  cluster_id: number | null
  piece_count: number
}

interface PromptPiecesResponse {
  prompt: PromptDetail
  pieces: PieceStripPiece[]
}

interface PieceDetail {
  id: number
  body: string
  model: string | null
  created_at: number
}

interface ClusterResponse {
  prompts: Array<{
    id: number
  }>
}

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const lockedMode = !!queryPromptId
  const routeState = location.state as { draftPrompt?: unknown } | null
  const draftPrompt = typeof routeState?.draftPrompt === 'string' ? routeState.draftPrompt : ''

  const {
    prompt,
    setPrompt,
    normalizedPrompt,
    matchedPrompt,
    promptPieceCount,
    loadingPrompt,
    promptError,
    loadedPrompt,
    applyPromptSaved,
  } = usePromptMatch({ worldId: id, queryPromptId })
  const [temperature] = useState(1)
  const [useThinking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null)
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const modeKeyRef = useRef<string | null>(null)
  const pendingSavedSelectionRef = useRef<{ promptId: string; pieceId: number } | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const readingSpeed = useReadingSpeedUnitsPerSecond()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()
  const backHref = id ? `/worlds/${id}` : '/worlds'
  useTopNavConfig({ backHref, secondaryTitle: 'scene' })

  const {
    phase,
    output,
    error: generationError,
    completion,
    displayComplete,
    streaming,
    generate,
    stop,
    reset,
  } = useGeneration({ worldId: id })

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })

  const promptDetailsQuery = useQuery({
    queryKey: ['prompt', id, queryPromptId, 'generate', PIECE_STRIP_LIMIT],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/prompts/${encodeURIComponent(queryPromptId!)}?limit=${PIECE_STRIP_LIMIT}`) as Promise<PromptPiecesResponse>,
    enabled: !!id && lockedMode && !!queryPromptId,
  })

  const activePrompt = promptDetailsQuery.data?.prompt ?? null
  const promptPieces = promptDetailsQuery.data?.pieces ?? []
  const activeClusterId = activePrompt?.cluster_id ?? loadedPrompt?.cluster_id ?? null

  const clusterQuery = useQuery({
    queryKey: ['cluster', id, String(activeClusterId)],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/clusters/${activeClusterId}`) as Promise<ClusterResponse>,
    enabled: !!id && lockedMode && activeClusterId != null,
  })

  const selectedPieceQuery = useQuery({
    queryKey: ['piece', selectedPieceId],
    queryFn: () => apiFetch(`/api/pieces/${selectedPieceId}`) as Promise<PieceDetail>,
    enabled: selectedPieceId != null,
  })

  const selectedPiece = selectedPieceQuery.data ?? null
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
  }, [worldQuery.isError, navigate])

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

  const modeKey = `${id ?? ''}:${queryPromptId ? `prompt:${queryPromptId}` : 'blank'}`
  useEffect(() => {
    if (modeKeyRef.current === modeKey) return
    modeKeyRef.current = modeKey
    const pendingSelection = pendingSavedSelectionRef.current

    if (pendingSelection && queryPromptId === pendingSelection.promptId) {
      setSelectedPieceId(pendingSelection.pieceId)
      pendingSavedSelectionRef.current = null
    } else {
      setSelectedPieceId(null)
    }

    setSaveState('idle')
    setGeneratedAt(null)
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey])

  useEffect(() => {
    if (queryPromptId || !draftPrompt) return
    setPrompt(draftPrompt)
  }, [draftPrompt, queryPromptId, setPrompt])

  useEffect(() => {
    if (!displayComplete || completion !== 'completed' || !output || generationError || saveState !== 'idle') return
    void handleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayComplete, completion])

  useEffect(() => {
    if (!settingsOpen) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false)
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [settingsOpen])

  useEffect(() => {
    const node = topSentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(entries => {
      setShowScrollTop(!entries.some(entry => entry.isIntersecting))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const error = generationError || promptError
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
  const generateButtonLabel =
    phase === 'waiting_provider' ? 'Waiting...'
      : phase === 'thinking' ? 'Thinking...'
        : phase === 'writing' ? 'Writing...'
          : 'Take it'
  const panelOpen = settingsOpen
  const generateDisabled =
    streaming ||
    saveState === 'saving' ||
    loadingPrompt ||
    promptDetailsQuery.isLoading ||
    !normalizedPrompt ||
    panelOpen
  const iconButtonClass =
    'flex size-11 shrink-0 items-center justify-center rounded-full bg-paper/85 text-ink-3 shadow-(--shadow-feather) transition-all duration-200 hover:-translate-y-px hover:text-ink focus:outline-none focus:ring-4 focus:ring-rose/20 disabled:pointer-events-none disabled:opacity-50'
  const activeIconButtonClass = 'text-ink ring-1 ring-ink-4/30'

  function handleGenerate() {
    if (generateDisabled) return
    setSelectedPieceId(null)
    setGeneratedAt(null)
    generate({
      prompt,
      promptId: lockedMode && queryPromptId ? Number(queryPromptId) : matchedPrompt?.id,
      model,
      temperature,
      useThinking,
    })
  }

  function handleCopyEdit() {
    if (!id || !queryPromptId || streaming) return
    navigate(`/worlds/${id}/generate`, { state: { draftPrompt: prompt } })
  }

  const canSave = !streaming && !!output && saveState !== 'saving' && saveState !== 'saved'

  async function handleSave() {
    if (!id || !canSave) return
    setSaveState('saving')
    try {
      const result = await apiFetch(`/api/worlds/${id}/pieces`, {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          promptId: lockedMode && queryPromptId ? Number(queryPromptId) : matchedPrompt?.id,
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
        ['prompt', id, String(result.promptId), 'generate', PIECE_STRIP_LIMIT],
        current => ({
          prompt: {
            ...current?.prompt,
            cluster_id: result.clusterId,
            piece_count: result.pieceCount,
          },
          pieces: [
            { id: result.pieceId },
            ...(current?.pieces.filter(piece => piece.id !== result.pieceId) ?? []),
          ].slice(0, PIECE_STRIP_LIMIT),
        }),
      )
      setSelectedPieceId(result.pieceId)
      applyPromptSaved({
        id: result.promptId,
        cluster_id: result.clusterId,
        text: normalizedPrompt,
        piece_count: result.pieceCount,
      })
      queryClient.invalidateQueries({ queryKey: ['prompt', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['prompt-head', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['prompt-match', id] })
      queryClient.invalidateQueries({ queryKey: ['piece', result.pieceId] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['cluster', id] })

      navigate(`/worlds/${id}/generate?promptId=${result.promptId}`, { replace: true })
    } catch (err) {
      setSaveState('error')
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div className="page-fade-in min-h-screen page-width px-4 pb-32 pt-6">
        <div ref={topSentinelRef} className="h-px" aria-hidden="true" />
        <div className={`${viewingSavedPiece && !streaming ? 'mb-1' : 'mb-8'} bg-paper/95`}>
          {lockedMode && (
            <div className="flex items-center justify-between gap-3 px-1 py-2">
              <button
                type="button"
                className="t-meta inline-flex min-w-0 items-center gap-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 disabled:opacity-50"
                onClick={handleCopyEdit}
                disabled={streaming || !queryPromptId}
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>Copy & edit</span>
              </button>

              {showHistoryLink && (
                <Link
                  to={`/worlds/${id}/clusters/${activeClusterId}`}
                  state={{ backHref: `/worlds/${id}/generate?promptId=${queryPromptId}` }}
                  className="t-meta inline-flex shrink-0 items-center gap-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
                  aria-label="Open scene history"
                  title="Scene history"
                >
                  <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{variationNumber ? `v${variationNumber}` : 'History'}</span>
                </Link>
              )}
            </div>
          )}

          <PromptCard
            prompt={prompt}
            onPromptChange={setPrompt}
            loading={loadingPrompt || promptDetailsQuery.isLoading}
            streaming={streaming}
            promptPieceCount={promptCardPieceCount}
            error={error}
            locked={lockedMode}
          />

          {lockedMode && (
            <PieceStrip
              pieces={promptPieces}
              promptPieceCount={activePrompt?.piece_count ?? promptPieces.length}
              selectedPieceId={selectedPieceId}
              disabled={streaming}
              onSelectNew={() => setSelectedPieceId(null)}
              onSelectPiece={pieceId => setSelectedPieceId(pieceId)}
            />
          )}

          {(!viewingSavedPiece || streaming) && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                {!viewingSavedPiece && (
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 rounded-full bg-rose px-5 py-2.5 font-serif-zh text-[15px] italic leading-none text-white shadow-(--shadow-cta) transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-deep hover:shadow-(--shadow-cta-hover) focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
                    onClick={handleGenerate}
                    disabled={generateDisabled}
                  >
                    {generateButtonLabel}
                  </button>
                )}
                {!viewingSavedPiece && (
                  <button
                    type="button"
                    className={`${iconButtonClass} ${settingsOpen ? activeIconButtonClass : ''}`}
                    onClick={() => setSettingsOpen(open => !open)}
                    aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
                    title={settingsOpen ? 'Close settings' : 'Open settings'}
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="size-5" aria-hidden="true" />
                  </button>
                )}
                {streaming && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={stop}
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <OutputPanel
          output={displayedOutput}
          streaming={streaming}
          displayComplete={outputDisplayComplete}
          pieceMetaLabel={displayedPieceMetaLabel}
          readingFont={readingFont}
          readingFontSize={readingFontSize}
        />

      </div>
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-7 left-1/2 z-40 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-(--shadow-feather) transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ink-4/20"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ArrowUp aria-hidden="true" className="h-6 w-6" />
        </button>
      )}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-8"
          role="presentation"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-settings-title"
            className="max-h-[calc(100dvh-4rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-paper-3 bg-paper px-5 py-5 shadow-[0_24px_70px_rgba(26,18,16,0.22)]"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <h2 id="generate-settings-title" className="font-serif-zh text-xl leading-tight text-ink">
                Settings
              </h2>
              <button
                type="button"
                className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                title="Close settings"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              <SettingsPanel
                open={settingsOpen}
                disabled={streaming}
                model={model}
                onModelChange={setGenerationModel}
                readingSpeed={readingSpeed}
                onReadingSpeedChange={setReadingSpeedUnitsPerSecond}
                readingFont={readingFont}
                onReadingFontChange={setReadingFont}
                readingFontSize={readingFontSize}
                onReadingFontSizeChange={setReadingFontSize}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function modelLabel(modelId: string | null | undefined) {
  return MODELS.find(option => option.id === modelId)?.label ?? modelId ?? 'Unknown model'
}

function outputCountLabel(text: string) {
  if (containsChinese(text)) {
    const count = Array.from(text).filter(character => !/\s/u.test(character)).length
    return `${count} ${count === 1 ? 'character' : 'characters'}`
  }

  const count = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
  return `${count} ${count === 1 ? 'word' : 'words'}`
}

function containsChinese(text: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text)
}
