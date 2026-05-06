import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Languages, Settings, X } from 'lucide-react'
import { apiFetch } from '../../../api'
import { useGeneration } from '../../../hooks/useGeneration'
import { usePromptMatch } from '../../../hooks/usePromptMatch'
import { useTopNavConfig } from '../../../components/topNavConfig'
import { useToast } from '../../../components/Toast'
import { setGenerationModel, useGenerationModel } from '../../../preferences/generationModel'
import { setReadingFont, useReadingFont } from '../../../preferences/readingFont'
import { setReadingFontSize, useReadingFontSize } from '../../../preferences/readingFontSize'
import {
  setReadingSpeedUnitsPerSecond,
  useReadingSpeedUnitsPerSecond,
} from '../../../preferences/readingSpeed'
import PromptCard from './PromptCard'
import ReadingSettingsPanel from './ReadingSettingsPanel'
import SettingsPanel from './SettingsPanel'
import OutputPanel, { type SaveResponse, type SaveState } from './OutputPanel'

const PROMPT_COMPACT_SCROLL_Y = 80

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const {
    prompt,
    setPrompt,
    normalizedPrompt,
    matchedPrompt,
    promptPieceCount,
    loadingPrompt,
    promptError,
    applyPromptSaved,
  } = usePromptMatch({ worldId: id, queryPromptId })
  const [temperature] = useState(1)
  const [useThinking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [readingSettingsOpen, setReadingSettingsOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [promptCompact, setPromptCompact] = useState(false)
  const [saveResult, setSaveResult] = useState<SaveResponse | null>(null)
  const [lastSavedPiece, setLastSavedPiece] = useState<{ output: string; result: SaveResponse } | null>(null)
  const [hasGeneratedOnScreen, setHasGeneratedOnScreen] = useState(false)
  const readingSpeed = useReadingSpeedUnitsPerSecond()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const model = useGenerationModel()
  const backHref = id ? `/worlds/${id}` : '/worlds'
  useTopNavConfig({ backHref })

  const {
    phase,
    output,
    error: generationError,
    completion,
    displayComplete,
    streaming,
    generate,
    stop,
  } = useGeneration({ worldId: id })

  useEffect(() => {
    if (streaming) {
      setSaveState('idle')
      setSaveResult(null)
    }
  }, [streaming])

  useEffect(() => {
    if (!displayComplete || completion !== 'completed' || !output || generationError || saveState !== 'idle') return
    setHasGeneratedOnScreen(true)
    void handleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayComplete, completion])

  const error = generationError || promptError
  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })

  useEffect(() => {
    if (worldQuery.isError) navigate('/')
  }, [worldQuery.isError, navigate])

  const pieceNumber = saveState === 'saved' ? promptPieceCount : promptPieceCount + 1
  const restoredSavedResult =
    completion === 'cancelled' && output && lastSavedPiece?.output === output ? lastSavedPiece.result : null
  const displayedSaveResult = restoredSavedResult ?? saveResult
  const displayedSaveState: SaveState = restoredSavedResult ? 'saved' : saveState
  const displayedPieceNumber = restoredSavedResult ? restoredSavedResult.pieceCount : pieceNumber
  const outputDisplayComplete = displayComplete || !!restoredSavedResult
  const generateButtonLabel =
    phase === 'waiting_provider' ? 'Waiting...'
      : phase === 'thinking' ? 'Thinking...'
        : phase === 'writing' ? 'Writing...'
          : hasGeneratedOnScreen ? 'Another take' : 'Take it'
  const panelOpen = settingsOpen || readingSettingsOpen

  useEffect(() => {
    let ticking = false

    function readScrollState() {
      const scrollY = window.scrollY

      setPromptCompact(scrollY > PROMPT_COMPACT_SCROLL_Y)
      ticking = false
    }

    function updateScrollState() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(readScrollState)
    }

    readScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  function handleGenerate() {
    if (!prompt.trim()) return
    generate({
      prompt,
      promptId: matchedPrompt?.id,
      model,
      temperature,
      useThinking,
    })
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
          promptId: matchedPrompt?.id,
          body: output,
          model,
        }),
      }) as SaveResponse

      setSaveState('saved')
      setSaveResult(result)
      setLastSavedPiece({ output, result })
      applyPromptSaved({
        id: result.promptId,
        text: normalizedPrompt,
        piece_count: result.pieceCount,
      })
      queryClient.invalidateQueries({ queryKey: ['prompt', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['prompt-head', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['prompt-match', id] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['cluster', id] })
    } catch (err) {
      setSaveState('error')
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return (
    <>
      <div className="min-h-screen page-width px-4 pb-32 pt-6">
        <div className="sticky top-14 z-10 mb-5">
          <PromptCard
            prompt={prompt}
            onPromptChange={setPrompt}
            loading={loadingPrompt}
            streaming={streaming}
            compact={promptCompact}
            promptPieceCount={promptPieceCount}
            error={error}
          />

          <div className="mt-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="min-h-11 min-w-0 flex-1 rounded-full border border-rose bg-rose px-5 py-2 text-sm font-medium text-white shadow-[0_14px_28px_rgba(205,83,106,0.30)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_16px_32px_rgba(205,83,106,0.38)] focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
                onClick={handleGenerate}
                disabled={streaming || loadingPrompt || !prompt.trim() || panelOpen}
              >
                {generateButtonLabel}
              </button>
              <button
                type="button"
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border border-paper-3 bg-paper-2 text-ink shadow-[0_12px_24px_rgba(54,44,38,0.14)] transition-all hover:-translate-y-0.5 hover:border-rose hover:text-rose-deep focus:outline-none focus:ring-4 focus:ring-rose/20 disabled:pointer-events-none disabled:opacity-50 ${readingSettingsOpen ? 'border-rose text-rose-deep ring-4 ring-rose/15' : ''}`}
                onClick={() => {
                  setSettingsOpen(false)
                  setReadingSettingsOpen(open => !open)
                }}
                disabled={streaming}
                aria-label={readingSettingsOpen ? 'Close reading settings' : 'Open reading settings'}
                title={readingSettingsOpen ? 'Close reading settings' : 'Open reading settings'}
                aria-expanded={readingSettingsOpen}
              >
                <Languages className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border border-paper-3 bg-paper-2 text-ink shadow-[0_12px_24px_rgba(54,44,38,0.14)] transition-all hover:-translate-y-0.5 hover:border-rose hover:text-rose-deep focus:outline-none focus:ring-4 focus:ring-rose/20 disabled:pointer-events-none disabled:opacity-50 ${settingsOpen ? 'border-rose text-rose-deep ring-4 ring-rose/15' : ''}`}
                onClick={() => {
                  setReadingSettingsOpen(false)
                  setSettingsOpen(open => !open)
                }}
                disabled={streaming}
                aria-label={settingsOpen ? 'Close generation settings' : 'Open generation settings'}
                title={settingsOpen ? 'Close generation settings' : 'Open generation settings'}
                aria-expanded={settingsOpen}
              >
                <Settings className="size-5" aria-hidden="true" />
              </button>
              {streaming && (
                <button
                  type="button"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-paper-3 bg-paper-2 text-ink shadow-[0_12px_24px_rgba(54,44,38,0.14)] transition-all hover:-translate-y-0.5 hover:border-rose hover:text-rose-deep focus:outline-none focus:ring-4 focus:ring-rose/20"
                  onClick={stop}
                  aria-label="Stop generation"
                  title="Stop generation"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="ml-auto w-full max-w-sm">
              <SettingsPanel
                open={settingsOpen}
                disabled={streaming}
                model={model}
                onModelChange={setGenerationModel}
              />
              <ReadingSettingsPanel
                open={readingSettingsOpen}
                disabled={streaming}
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

        <OutputPanel
          output={output}
          streaming={streaming}
          displayComplete={outputDisplayComplete}
          pieceNumber={displayedPieceNumber}
          isFirstTake={promptPieceCount === 0}
          saveState={displayedSaveState}
          saveResult={displayedSaveResult}
          restoredSavedDisplay={!!restoredSavedResult}
          readingFont={readingFont}
          readingFontSize={readingFontSize}
        />

      </div>
    </>
  )
}
