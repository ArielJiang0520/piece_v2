import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings, X } from 'lucide-react'
import { apiFetch } from '../../api'
import Skeleton from '../../components/Skeleton'
import { MODELS, DEFAULT_MODEL_ID, entityLabel } from '../../config'
import { useGeneration } from '../../hooks/useGeneration'
import { useTopNavConfig } from '../../components/topNavConfig'
import { useToast } from '../../components/Toast'

const END_REVEAL_DELAY_MS = 900

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SaveResponse {
  promptId: number
  pieceId: number
  pieceCount: number
  isNewPrompt: boolean
}

interface PromptSummary {
  id: number
  text: string
  piece_count: number
}

interface PromptResponse {
  prompt: PromptSummary
}

interface PromptMatchResponse {
  prompt: PromptSummary | null
}

const PROMPT_COMPACT_SCROLL_Y = 80
const PROMPT_MATCH_DEBOUNCE_MS = 300
const promptPillClass = 'rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-medium uppercase leading-none text-ink-4'

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const [prompt, setPrompt] = useState('')
  const [promptMatch, setPromptMatch] = useState<PromptSummary | null>(null)
  const [debouncedPrompt, setDebouncedPrompt] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [temperature, setTemperature] = useState(1)
  const [useThinking, setUseThinking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptError, setPromptError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [promptCompact, setPromptCompact] = useState(false)
  const [saveResult, setSaveResult] = useState<SaveResponse | null>(null)
  const [endRevealed, setEndRevealed] = useState(false)
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
      setEndRevealed(false)
    }
  }, [streaming])

  useEffect(() => {
    if (!displayComplete) {
      setEndRevealed(false)
      return
    }
    const timer = setTimeout(() => setEndRevealed(true), END_REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [displayComplete])

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

  const promptQuery = useQuery({
    queryKey: ['prompt-head', id, queryPromptId],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/prompts/${encodeURIComponent(queryPromptId!)}?limit=1`) as Promise<PromptResponse>,
    enabled: !!id && !!queryPromptId,
  })
  const loadingPrompt = !!queryPromptId && promptQuery.isPending
  const normalizedPrompt = prompt.trim()
  const promptMatchText = promptMatch?.text.trim() ?? ''
  const promptMatchQuery = useQuery({
    queryKey: ['prompt-match', id, debouncedPrompt],
    queryFn: () =>
      apiFetch(`/api/worlds/${id}/prompts/match?text=${encodeURIComponent(debouncedPrompt)}`) as Promise<PromptMatchResponse>,
    enabled: !!id && !!debouncedPrompt && debouncedPrompt === normalizedPrompt && promptMatchText !== debouncedPrompt,
    staleTime: 15_000,
  })
  const matchedPrompt = promptMatch && promptMatch.text.trim() === normalizedPrompt ? promptMatch : null
  const promptPieceCount = matchedPrompt?.piece_count ?? 0
  const pieceNumber = saveState === 'saved' ? promptPieceCount : promptPieceCount + 1
  const pieceCountLabel = `${promptPieceCount} ${entityLabel('piece', { plural: promptPieceCount !== 1 })}`
  const showNewPromptPill = !!normalizedPrompt && promptPieceCount === 0
  const generateButtonLabel =
    phase === 'waiting_provider' ? 'Waiting...'
      : phase === 'thinking' ? 'Thinking...'
        : phase === 'writing' ? 'Writing...'
          : promptPieceCount === 0 ? 'First take' : 'Another take'

  useEffect(() => {
    if (!queryPromptId) {
      setPromptMatch(null)
      return
    }
    if (promptQuery.data) {
      setPrompt(promptQuery.data.prompt.text)
      setPromptMatch(promptQuery.data.prompt)
      setPromptError('')
    } else if (promptQuery.isError) {
      setPromptMatch(null)
      setPromptError(`Could not load ${entityLabel('prompt')}`)
    }
  }, [queryPromptId, promptQuery.data, promptQuery.isError])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedPrompt(normalizedPrompt)
    }, PROMPT_MATCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [normalizedPrompt])

  useEffect(() => {
    if (!normalizedPrompt) {
      setPromptMatch(null)
      return
    }

    setPromptMatch(current => current && current.text.trim() !== normalizedPrompt ? null : current)
  }, [normalizedPrompt])

  useEffect(() => {
    if (debouncedPrompt !== normalizedPrompt || !promptMatchQuery.data) return
    setPromptMatch(promptMatchQuery.data.prompt)
  }, [debouncedPrompt, normalizedPrompt, promptMatchQuery.data])

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
  const promptCardClass = [
    'rounded-md border border-paper-3 bg-paper shadow-[0_10px_24px_rgba(26,18,16,0.10)] transition-[padding,box-shadow] duration-200 ease-out',
    promptCompact ? 'px-3 py-3' : 'px-4 py-4',
  ].join(' ')

  const promptFieldClass = [
    'w-full rounded-sm px-3 text-base text-ink placeholder-ink-4 transition-[height,padding] duration-200 ease-out focus:outline-none focus:ring-0 disabled:opacity-50 sm:text-sm',
    promptCompact ? 'h-[3.35rem] resize-none py-1.5 leading-5' : 'h-32 resize-y py-2',
  ].join(' ')

  const settingsPanelClass = [
    'overflow-hidden border-t border-paper-3 transition-[margin,max-height,opacity,padding] duration-200 ease-out',
    settingsOpen ? 'mt-4 max-h-80 pt-4 opacity-100' : 'max-h-0 pt-0 opacity-0',
  ].join(' ')

  const outputPanelClass = [
    'min-h-[55vh] rounded-md px-1 pt-2 text-sm transition-[padding-bottom] duration-200 ease-out',
    streaming ? 'pb-[45vh]' : 'pb-2',
  ].join(' ')

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
      const savedPromptText = normalizedPrompt
      const savedPromptMatch = {
        id: result.promptId,
        text: savedPromptText,
        piece_count: result.pieceCount,
      }
      setPromptMatch(savedPromptMatch)
      queryClient.setQueryData(['prompt-match', id, savedPromptText], { prompt: savedPromptMatch })
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
          <div className={promptCardClass}>
            {loadingPrompt ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-20" />
                  <button
                    type="button"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30 ${settingsOpen ? 'bg-paper-2 text-ink' : ''}`}
                    onClick={() => setSettingsOpen(open => !open)}
                    aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
                    title={settingsOpen ? 'Close settings' : 'Open settings'}
                  >
                    <Settings aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
                <Skeleton className={promptCompact ? 'h-[3.35rem] w-full' : 'h-32 w-full'} />
              </div>
            ) : (
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <label htmlFor="prompt-input" className="block text-sm uppercase tracking-wide text-ink-3">
                      {`Current ${entityLabel('prompt', { capitalize: true })}`}
                    </label>
                    <span className={promptPillClass}>{pieceCountLabel}</span>
                    {showNewPromptPill && <span className={promptPillClass}>new {entityLabel('prompt')}</span>}
                  </div>
                  <button
                    type="button"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-rose/30 ${settingsOpen ? 'bg-paper-2 text-ink' : ''}`}
                    onClick={() => setSettingsOpen(open => !open)}
                    aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
                    title={settingsOpen ? 'Close settings' : 'Open settings'}
                  >
                    <Settings aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
                <textarea
                  id="prompt-input"
                  className={promptFieldClass}
                  rows={promptCompact ? 2 : 4}
                  placeholder={`Enter your ${entityLabel('prompt')}...`}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  disabled={streaming}
                />
              </div>
            )}

            {error && <p className="mt-3 text-sm text-rose-deep">{error}</p>}

            <div className={settingsPanelClass} aria-hidden={!settingsOpen}>
              <div className="flex flex-col gap-4">
                <label className="block">
                  <select
                    className="w-full rounded-sm border border-paper-3 bg-paper-2 px-3 py-2 text-ink focus:outline-none focus:border-rose disabled:opacity-50"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    disabled={streaming || !settingsOpen}
                  >
                    {MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </label>

                <div className="rounded-sm border border-paper-3 bg-paper-2 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="temperature" className="text-xs font-medium text-ink-3">
                      Temp
                    </label>
                    <span className="min-w-8 text-right text-sm tabular-nums text-ink">
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                  <input
                    id="temperature"
                    className="mt-2 w-full accent-rose disabled:opacity-50"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={e => setTemperature(Number(e.target.value))}
                    disabled={streaming || !settingsOpen}
                    aria-label="Model temperature"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useThinking}
                    aria-label="Thinking"
                    disabled={streaming || !settingsOpen}
                    onClick={() => setUseThinking(v => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:border-rose disabled:opacity-50 ${useThinking
                      ? 'border-rose bg-rose'
                      : 'border-paper-3 bg-paper-2'
                      }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${useThinking ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                    />
                  </button>
                  <span className="text-xs font-medium text-ink-3">Thinking</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-3">
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
            <button
              type="button"
              className="min-h-11 min-w-32 rounded-full border border-rose bg-rose px-5 py-2 text-sm font-medium text-white shadow-[0_14px_28px_rgba(205,83,106,0.30)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_16px_32px_rgba(205,83,106,0.38)] focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
              onClick={handleGenerate}
              disabled={streaming || loadingPrompt || !prompt.trim()}
            >
              {generateButtonLabel}
            </button>
          </div>
        </div>

        <div className={outputPanelClass}>
          {output ? (
            <div>
              {displayComplete && (
                <div className="fade-in-up mb-6 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-4">
                  <span className="h-px flex-1 bg-paper-3" />
                  <span>{`${entityLabel('piece', { capitalize: true })} #${pieceNumber}`}</span>
                  <span className="h-px flex-1 bg-paper-3" />
                </div>
              )}
              <p className="prose whitespace-pre-wrap text-[15px]!">{output}</p>
              {endRevealed && (
                <div className="fade-in-up mt-10">
                  <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-4">
                    <span className="h-px flex-1 bg-paper-3" />
                    <span>{`End of ${entityLabel('piece', { capitalize: true })} #${pieceNumber}`}</span>
                    <span className="h-px flex-1 bg-paper-3" />
                  </div>
                  <div className="mt-4 text-center text-xs text-ink-4">
                    {saveState === 'saving' && <span className="italic">Recording…</span>}
                    {saveState === 'error' && <span className="text-rose-deep">Could not record this {entityLabel('piece')}</span>}
                    {saveState === 'saved' && saveResult && matchedPrompt && (
                      <span>
                        {saveResult.isNewPrompt
                          ? `Recorded as a new ${entityLabel('prompt')} · `
                          : `Added to existing ${entityLabel('prompt')} · `}
                        <Link
                          to={`/worlds/${id}/prompts/${saveResult.promptId}`}
                          className="font-medium text-ink-3 underline decoration-paper-3 underline-offset-4 transition-colors hover:text-rose-deep hover:decoration-rose"
                        >
                          {`View ${entityLabel('prompt')}`}
                        </Link>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-ink-4 leading-10">
              {/* <p>{`${entityLabel('piece', { capitalize: true })} #${promptPieceCount + 1}.`}</p> */}
              <p>{promptPieceCount === 0 ? 'Set your scene and take it.' : 'Ready when you are.'}</p>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
