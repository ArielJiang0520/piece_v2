import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { apiFetch } from '../api'
import { MODELS, DEFAULT_MODEL_ID } from '../config'

interface PromptResponse {
  prompt: {
    id: number
    text: string
  }
}

type GenerationPhase = 'idle' | 'waiting_provider' | 'thinking' | 'writing'

interface GenerateLocationState {
  promptDraft?: unknown
}

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const [prompt, setPrompt] = useState('')
  const [loadedPromptId, setLoadedPromptId] = useState<number | null>(null)
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [temperature, setTemperature] = useState(1)
  const [useThinking, setUseThinking] = useState(false)
  const [output, setOutput] = useState('')
  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const [error, setError] = useState('')
  const activeGenerationIdRef = useRef<string | null>(null)
  const activeRequestControllerRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const streaming = phase !== 'idle'
  const waitingForProvider = phase === 'waiting_provider'
  const isThinking = phase === 'thinking'
  const generateButtonLabel = waitingForProvider
    ? 'Waiting for provider...'
    : isThinking
      ? 'Thinking...'
      : streaming
        ? 'Writing...'
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

  useEffect(() => {
    return () => {
      activeRequestControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (queryPromptId) return

    const state = location.state as GenerateLocationState | null
    const promptDraft = state?.promptDraft
    if (typeof promptDraft !== 'string') return

    const trimmedDraft = promptDraft.trim()
    if (!trimmedDraft) return

    setPrompt(trimmedDraft)
    setLoadedPromptId(null)
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    )
  }, [location.pathname, location.search, location.state, navigate, queryPromptId])

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
      setError('')
    } else if (promptQuery.isError) {
      setLoadedPromptId(null)
      setError('Could not load prompt')
    }
  }, [queryPromptId, promptQuery.data, promptQuery.isError])

  async function generate() {
    if (!prompt.trim() || streaming) return
    const generationId = crypto.randomUUID()
    const requestController = new AbortController()
    activeGenerationIdRef.current = generationId
    activeRequestControllerRef.current = requestController
    stopRequestedRef.current = false
    setPhase('waiting_provider')
    setOutput('')
    setError('')

    try {
      const res = await fetch(`/api/worlds/${id}/generate`, {
        method: 'POST',
        credentials: 'include',
        signal: requestController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          promptId: loadedPromptId ?? undefined,
          model,
          temperature,
          useThinking,
          generationId,
        }),
      })

      if (!res.ok || !res.body) {
        if (!stopRequestedRef.current) setError('Request failed')
        setPhase('idle')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const line = event.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'status' && msg.status === 'waiting_provider') {
              setPhase('waiting_provider')
            } else if (msg.type === 'thinking') {
              setPhase(prev => prev === 'writing' ? prev : 'thinking')
            } else if (msg.type === 'chunk') {
              setPhase('writing')
              setOutput(prev => prev + msg.content)
            } else if (msg.type === 'done') {
              if (Number.isInteger(msg.promptId)) {
                setLoadedPromptId(msg.promptId)
                queryClient.invalidateQueries({ queryKey: ['prompt', id, String(msg.promptId)] })
              }
              queryClient.invalidateQueries({ queryKey: ['world', id] })
              queryClient.invalidateQueries({ queryKey: ['world-clusters', id] })
              queryClient.invalidateQueries({ queryKey: ['cluster', id] })
              setPhase('idle')
            } else if (msg.type === 'error') {
              setError(msg.message)
              setPhase('idle')
            }
          } catch { }
        }
      }
    } catch (e) {
      if (!stopRequestedRef.current) {
        setError(e instanceof Error ? e.message : 'Unknown error')
        setPhase('idle')
      }
    } finally {
      if (activeGenerationIdRef.current === generationId) {
        activeGenerationIdRef.current = null
        activeRequestControllerRef.current = null
        setPhase('idle')
      }
    }
  }

  function stopGeneration() {
    const generationId = activeGenerationIdRef.current
    if (!generationId) return

    stopRequestedRef.current = true
    setPhase('idle')
    void fetch(`/api/worlds/${id}/generate/stop`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    }).catch(() => { })

    activeRequestControllerRef.current?.abort()
    activeGenerationIdRef.current = null
    activeRequestControllerRef.current = null
  }

  return (
    <div className="min-h-screen page-width px-4 pb-32 pt-6">
      <div className="mb-4">
        <Link to={`/worlds/${id}`} className="text-rose hover:text-rose-deep text-sm">
          Back to {worldName || 'Pieces'}
        </Link>
      </div>

      <h2 className="font-serif-zh text-2xl font-normal text-ink mb-6">{worldName}</h2>

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

      <div className="mb-3">
        <button
          type="button"
          role="switch"
          aria-checked={useThinking}
          disabled={streaming}
          onClick={() => setUseThinking(v => !v)}
          className={`inline-flex items-center rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:border-rose disabled:opacity-50 ${
            useThinking
              ? 'border-rose bg-rose text-white'
              : 'border-paper-3 bg-paper-2 text-ink-3 hover:text-ink'
          }`}
        >
          Thinking {useThinking ? 'on' : 'off'}
        </button>
      </div>

      <div className="mb-4">
        <textarea
          className="w-full bg-paper-2 border border-paper-3 rounded-sm px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:border-rose resize-y"
          rows={4}
          placeholder={loadingPrompt ? 'Loading prompt...' : 'Enter your prompt...'}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={streaming || loadingPrompt}
        />
      </div>

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
            onClick={stopGeneration}
            aria-label="Stop generation"
            title="Stop generation"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="min-h-14 min-w-36 rounded-full border border-rose bg-rose px-6 py-3 text-sm font-medium text-white shadow-[0_16px_34px_rgba(205,83,106,0.34)] transition-all hover:-translate-y-0.5 hover:border-rose-deep hover:bg-rose-deep hover:shadow-[0_18px_38px_rgba(205,83,106,0.42)] focus:outline-none focus:ring-4 focus:ring-rose/25 disabled:pointer-events-none disabled:opacity-50"
          onClick={generate}
          disabled={streaming || loadingPrompt || !prompt.trim()}
        >
          {generateButtonLabel}
        </button>
      </div>
    </div>
  )
}
