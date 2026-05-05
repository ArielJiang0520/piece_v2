import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { apiFetch } from '../../../api'
import { DEFAULT_MODEL_ID } from '../../../config'
import { useGeneration } from '../../../hooks/useGeneration'
import { usePromptMatch } from '../../../hooks/usePromptMatch'
import { useTopNavConfig } from '../../../components/topNavConfig'
import { useToast } from '../../../components/Toast'
import PromptCard from './PromptCard'
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
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [temperature, setTemperature] = useState(1)
  const [useThinking, setUseThinking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [promptCompact, setPromptCompact] = useState(false)
  const [saveResult, setSaveResult] = useState<SaveResponse | null>(null)
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
  const generateButtonLabel =
    phase === 'waiting_provider' ? 'Waiting...'
      : phase === 'thinking' ? 'Thinking...'
        : phase === 'writing' ? 'Writing...'
          : promptPieceCount === 0 ? 'First take' : 'Another take'

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
            settingsOpen={settingsOpen}
            onSettingsToggle={() => setSettingsOpen(open => !open)}
            settings={
              <SettingsPanel
                open={settingsOpen}
                disabled={streaming}
                model={model}
                onModelChange={setModel}
                temperature={temperature}
                onTemperatureChange={setTemperature}
                useThinking={useThinking}
                onUseThinkingChange={setUseThinking}
              />
            }
          />

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className="min-h-11 min-w-0 flex-1 rounded-full border border-rose bg-rose px-5 py-2 text-sm font-medium text-white shadow-[0_14px_28px_rgba(205,83,106,0.30)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_16px_32px_rgba(205,83,106,0.38)] focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
              onClick={handleGenerate}
              disabled={streaming || loadingPrompt || !prompt.trim()}
            >
              {generateButtonLabel}
            </button>
            {streaming && (
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-full border border-paper-3 bg-paper-2 text-ink shadow-[0_12px_24px_rgba(54,44,38,0.14)] transition-all hover:-translate-y-0.5 hover:border-rose hover:text-rose-deep focus:outline-none focus:ring-4 focus:ring-rose/20"
                onClick={stop}
                aria-label="Stop generation"
                title="Stop generation"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <OutputPanel
          output={output}
          streaming={streaming}
          displayComplete={displayComplete}
          pieceNumber={pieceNumber}
          isFirstTake={promptPieceCount === 0}
          saveState={saveState}
          saveResult={saveResult}
          hasMatchedPrompt={!!matchedPrompt}
          worldId={id}
        />

      </div>
    </>
  )
}
