import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { apiFetch } from '../../api'
import TextField from '../../components/TextField'
import { MODELS, DEFAULT_MODEL_ID, entityLabel } from '../../config'
import { useGeneration } from '../../hooks/useGeneration'
import { useTopNavConfig } from '../../components/TopNav'
import { useToast } from '../../components/Toast'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SaveResponse {
  promptId: number
  pieceId: number
  isNewPrompt: boolean
}

interface PromptResponse {
  prompt: {
    id: number
    text: string
  }
}

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const [prompt, setPrompt] = useState('')
  const [loadedPromptId, setLoadedPromptId] = useState<number | null>(null)
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [temperature, setTemperature] = useState(1)
  const [useThinking, setUseThinking] = useState(false)
  const [promptError, setPromptError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const backHref = id ? `/worlds/${id}` : '/worlds'
  useTopNavConfig({ title: 'Generate', backHref })

  const {
    phase,
    output,
    error: generationError,
    streaming,
    generate,
    stop,
  } = useGeneration({ worldId: id })

  useEffect(() => {
    if (streaming) setSaveState('idle')
  }, [streaming])

  useEffect(() => {
    if (streaming) return
    if (!output || generationError || saveState !== 'idle') return
    void handleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  const error = generationError || promptError
  const generateButtonLabel =
    phase === 'waiting_provider' ? 'Waiting...'
      : phase === 'thinking' ? 'Thinking...'
        : phase === 'writing' ? 'Writing...'
          : 'Generate'

  const worldQuery = useQuery({
    queryKey: ['world', id],
    queryFn: () => apiFetch(`/api/worlds/${id}`) as Promise<{ name: string }>,
    enabled: !!id,
  })
  const worldName = worldQuery.data?.name ?? ''

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

  useEffect(() => {
    if (!queryPromptId) {
      setLoadedPromptId(null)
      return
    }
    if (promptQuery.data) {
      setPrompt(promptQuery.data.prompt.text)
      setLoadedPromptId(promptQuery.data.prompt.id)
      setPromptError('')
    } else if (promptQuery.isError) {
      setLoadedPromptId(null)
      setPromptError(`Could not load ${entityLabel('prompt')}`)
    }
  }, [queryPromptId, promptQuery.data, promptQuery.isError])

  function handleGenerate() {
    if (!prompt.trim()) return
    generate({
      prompt,
      promptId: loadedPromptId ?? undefined,
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
          promptId: loadedPromptId ?? undefined,
          body: output,
          model,
        }),
      }) as SaveResponse

      setSaveState('saved')
      setLoadedPromptId(result.promptId)
      queryClient.invalidateQueries({ queryKey: ['prompt', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['prompt-head', id, String(result.promptId)] })
      queryClient.invalidateQueries({ queryKey: ['world', id] })
      queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
      queryClient.invalidateQueries({ queryKey: ['cluster', id] })

      toast.show({
        kind: 'success',
        title: result.isNewPrompt
          ? `New ${entityLabel('prompt')} created`
          : `${entityLabel('piece', { capitalize: true })} added to existing ${entityLabel('prompt')}`,
        action: { label: `View ${entityLabel('prompt')}`, href: `/worlds/${id}/prompts/${result.promptId}` },
      })
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
    <div className="min-h-screen page-width px-4 pb-32 pt-6">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <select
          className="w-full sm:flex-1 bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink focus:outline-none focus:border-rose disabled:opacity-50"
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={streaming}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <div className="w-full sm:w-56 bg-paper-2 border border-paper-3 rounded-sm px-3 py-2">
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
            disabled={streaming}
            aria-label="Model temperature"
          />
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={useThinking}
          aria-label="Thinking"
          disabled={streaming}
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

      <TextField
        containerClassName="mb-4"
        label={entityLabel('prompt', { capitalize: true })}
        multiline
        rows={4}
        placeholder={loadingPrompt ? `Loading ${entityLabel('prompt')}...` : `Enter your ${entityLabel('prompt')}...`}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        disabled={streaming || loadingPrompt}
      />

      {error && <p className="text-rose-deep text-sm mb-4">{error}</p>}

      <div className="text-sm h-175 overflow-y-auto rounded-md border border-paper-3 bg-paper-2 px-4 py-4">
        {output ? (
          <p className="prose whitespace-pre-wrap text-[15px]!">{output}</p>
        ) : (
          <p className="text-ink-4">Generated text will appear here.</p>
        )}
      </div>

      <div className="fixed bottom-6 right-[max(1.75rem,calc((100vw-480px)/2+1.75rem))] flex items-center gap-3">
        {streaming && (
          <button
            type="button"
            className="flex size-14 items-center justify-center rounded-full border border-paper-3 bg-paper-2 text-ink shadow-[0_14px_30px_rgba(54,44,38,0.16)] transition-all hover:-translate-y-0.5 hover:border-rose hover:text-rose-deep focus:outline-none focus:ring-4 focus:ring-rose/20"
            onClick={stop}
            aria-label="Stop generation"
            title="Stop generation"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="min-h-14 min-w-36 rounded-full border border-rose bg-rose px-6 py-3 text-sm font-medium text-white shadow-[0_16px_34px_rgba(205,83,106,0.34)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.42)] focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
          onClick={handleGenerate}
          disabled={streaming || loadingPrompt || !prompt.trim()}
        >
          {generateButtonLabel}
        </button>
      </div>
    </div>
  )
}
