import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
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
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const [worldName, setWorldName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loadedPromptId, setLoadedPromptId] = useState<number | null>(null)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [temperature, setTemperature] = useState(1)
  const [output, setOutput] = useState('')
  const [thinkingOutput, setThinkingOutput] = useState('')
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const [pieceId, setPieceId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const streaming = phase !== 'idle'
  const waitingForProvider = phase === 'waiting_provider'
  const isThinking = phase === 'thinking'
  const pendingStatus = waitingForProvider
    ? 'Waiting for provider...'
    : isThinking
      ? 'Thinking...'
      : ''

  useEffect(() => {
    apiFetch(`/api/worlds/${id}`)
      .then(w => setWorldName(w.name))
      .catch(() => navigate('/'))
  }, [id, navigate])

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

  useEffect(() => {
    if (!queryPromptId) {
      setLoadedPromptId(null)
      return
    }

    let cancelled = false
    setLoadingPrompt(true)
    setError('')

    apiFetch(`/api/worlds/${id}/prompts/${encodeURIComponent(queryPromptId)}?limit=1`)
      .then((response: PromptResponse) => {
        if (cancelled) return
        setPrompt(response.prompt.text)
        setLoadedPromptId(response.prompt.id)
      })
      .catch(() => {
        if (cancelled) return
        setLoadedPromptId(null)
        setError('Could not load prompt')
      })
      .finally(() => {
        if (!cancelled) setLoadingPrompt(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, queryPromptId])

  async function generate() {
    if (!prompt.trim() || streaming) return
    setPhase('waiting_provider')
    setOutput('')
    setThinkingOutput('')
    setThinkingExpanded(false)
    setPieceId(null)
    setError('')

    try {
      const res = await fetch(`/api/worlds/${id}/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          promptId: loadedPromptId ?? undefined,
          model,
          temperature,
        }),
      })

      if (!res.ok || !res.body) {
        setError('Request failed')
        setPhase('idle')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedContent = false

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
              if (typeof msg.content === 'string' && msg.content) {
                setThinkingOutput(prev => prev + msg.content)
              }
              if (!receivedContent) setThinkingExpanded(true)
            } else if (msg.type === 'chunk') {
              receivedContent = true
              setPhase('writing')
              setThinkingExpanded(false)
              setOutput(prev => prev + msg.content)
            } else if (msg.type === 'done') {
              setPieceId(msg.pieceId)
              setPhase('idle')
            } else if (msg.type === 'error') {
              setError(msg.message)
              setPhase('idle')
            }
          } catch {}
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('idle')
    }
  }

  return (
    <div className="min-h-screen page-width px-4 py-6">
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

      <div className="flex items-center gap-3 mb-6">
        <button
          className="bg-rose hover:bg-rose-deep text-white rounded-sm px-5 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={generate}
          disabled={streaming || loadingPrompt || !prompt.trim()}
        >
          {waitingForProvider ? 'Waiting for provider...' : isThinking ? 'Thinking...' : streaming ? 'Writing...' : 'Generate'}
        </button>
        {pieceId && (
          <button
            className="border border-rose text-rose hover:text-rose-deep hover:border-rose-deep rounded-sm px-5 py-2 font-medium transition-colors"
            onClick={() => navigate(`/pieces/${pieceId}`)}
          >
            Read
          </button>
        )}
      </div>

      {error && <p className="text-rose-deep text-sm mb-4">{error}</p>}

      {pendingStatus && (
        <div className="bg-paper border border-paper-3 rounded-md px-4 py-4">
          <div className="flex items-center gap-3 text-ink-2">
            <span className="h-2 w-2 rounded-full bg-rose animate-pulse" aria-hidden="true" />
            <p className="text-sm">{pendingStatus}</p>
          </div>
        </div>
      )}

      {thinkingOutput && (
        <details
          className="mb-4 bg-paper-2 border border-paper-3 rounded-md px-4 py-3"
          open={thinkingExpanded}
          onToggle={e => setThinkingExpanded(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm text-ink-2 select-none">
            Thinking
          </summary>
          <p className="mt-3 text-ink-3 text-sm leading-relaxed whitespace-pre-wrap">{thinkingOutput}</p>
        </details>
      )}

      {output && (
        <div className="bg-paper border border-paper-3 rounded-md px-4 py-4">
          <p className="prose whitespace-pre-wrap">{output}</p>
        </div>
      )}
    </div>
  )
}
