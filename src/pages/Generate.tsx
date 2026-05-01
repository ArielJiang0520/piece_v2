import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { MODELS, DEFAULT_MODEL_ID } from '../config'

interface PromptResponse {
  prompt: {
    id: number
    text: string
  }
}

type GenerationPhase = 'idle' | 'waiting_provider' | 'thinking' | 'writing'

export default function Generate() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryPromptId = searchParams.get('promptId')
  const [worldName, setWorldName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loadedPromptId, setLoadedPromptId] = useState<number | null>(null)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [model, setModel] = useState(DEFAULT_MODEL_ID)
  const [temperature, setTemperature] = useState(1)
  const [output, setOutput] = useState('')
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
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <Link to={`/worlds/${id}/pieces`} className="text-violet-400 hover:text-violet-300 text-sm">
          ← {worldName || 'Pieces'}
        </Link>
      </div>

      <h2 className="text-lg font-semibold text-zinc-100 mb-6">{worldName}</h2>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <select
          className="w-full sm:flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-violet-500 disabled:opacity-50"
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={streaming}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <div className="w-full sm:w-56 bg-zinc-800 border border-zinc-700 rounded px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="temperature" className="text-xs font-medium text-zinc-300">
              Temp
            </label>
            <span className="min-w-8 text-right text-sm tabular-nums text-zinc-100">
              {temperature.toFixed(1)}
            </span>
          </div>
          <input
            id="temperature"
            className="mt-2 w-full accent-violet-500 disabled:opacity-50"
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
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-y"
          rows={4}
          placeholder={loadingPrompt ? 'Loading prompt...' : 'Enter your prompt...'}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={streaming || loadingPrompt}
        />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button
          className="bg-violet-600 hover:bg-violet-500 text-white rounded px-5 py-2 font-medium transition-colors disabled:opacity-50"
          onClick={generate}
          disabled={streaming || loadingPrompt || !prompt.trim()}
        >
          {waitingForProvider ? 'Waiting for provider...' : isThinking ? 'Thinking...' : streaming ? 'Writing...' : 'Generate'}
        </button>
        {pieceId && (
          <button
            className="border border-violet-500 text-violet-400 hover:text-violet-300 hover:border-violet-400 rounded px-5 py-2 font-medium transition-colors"
            onClick={() => navigate(`/pieces/${pieceId}`)}
          >
            Read
          </button>
        )}
      </div>

      {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

      {pendingStatus && (
        <div className="bg-zinc-800 border border-zinc-700 rounded px-4 py-4">
          <div className="flex items-center gap-3 text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" aria-hidden="true" />
            <p className="text-sm">{pendingStatus}</p>
          </div>
        </div>
      )}

      {output && (
        <div className="bg-zinc-800 border border-zinc-700 rounded px-4 py-4">
          <p className="text-zinc-100 text-[17px] leading-relaxed whitespace-pre-wrap">{output}</p>
        </div>
      )}
    </div>
  )
}
