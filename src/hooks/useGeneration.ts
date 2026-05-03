import { useEffect, useReducer, useRef } from 'react'
import { createRandomId } from '../utils/id'

export type GenerationPhase = 'idle' | 'waiting_provider' | 'thinking' | 'writing'

export interface GenerateInput {
  prompt: string
  promptId?: number
  model: string
  temperature: number
  useThinking: boolean
}

interface State {
  phase: GenerationPhase
  output: string
  error: string
}

type Action =
  | { type: 'start' }
  | { type: 'phase'; phase: GenerationPhase }
  | { type: 'chunk'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

const initialState: State = { phase: 'idle', output: '', error: '' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { phase: 'waiting_provider', output: '', error: '' }
    case 'phase':
      // 'thinking' must not downgrade an already-writing stream
      if (action.phase === 'thinking' && state.phase === 'writing') return state
      return { ...state, phase: action.phase }
    case 'chunk':
      return { ...state, phase: 'writing', output: state.output + action.content }
    case 'error':
      return { ...state, phase: 'idle', error: action.message }
    case 'done':
      return { ...state, phase: 'idle' }
  }
}

interface UseGenerationOptions {
  worldId: string | undefined
  onDone?: (result: { promptId: number | null }) => void
}

export function useGeneration({ worldId, onDone }: UseGenerationOptions) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const activeGenerationIdRef = useRef<string | null>(null)
  const activeRequestControllerRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    return () => {
      activeRequestControllerRef.current?.abort()
    }
  }, [])

  const streaming = state.phase !== 'idle'

  async function generate(input: GenerateInput) {
    if (!worldId || streaming) return
    const generationId = createRandomId()
    const requestController = new AbortController()
    activeGenerationIdRef.current = generationId
    activeRequestControllerRef.current = requestController
    stopRequestedRef.current = false
    dispatch({ type: 'start' })

    try {
      const res = await fetch(`/api/worlds/${worldId}/generate`, {
        method: 'POST',
        credentials: 'include',
        signal: requestController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, generationId }),
      })

      if (!res.ok || !res.body) {
        if (!stopRequestedRef.current) dispatch({ type: 'error', message: 'Request failed' })
        else dispatch({ type: 'done' })
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
              dispatch({ type: 'phase', phase: 'waiting_provider' })
            } else if (msg.type === 'thinking') {
              dispatch({ type: 'phase', phase: 'thinking' })
            } else if (msg.type === 'chunk') {
              dispatch({ type: 'chunk', content: msg.content })
            } else if (msg.type === 'done') {
              dispatch({ type: 'done' })
              onDoneRef.current?.({
                promptId: Number.isInteger(msg.promptId) ? msg.promptId : null,
              })
            } else if (msg.type === 'error') {
              dispatch({ type: 'error', message: msg.message })
            }
          } catch { }
        }
      }
    } catch (e) {
      if (!stopRequestedRef.current) {
        dispatch({ type: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    } finally {
      if (activeGenerationIdRef.current === generationId) {
        activeGenerationIdRef.current = null
        activeRequestControllerRef.current = null
        dispatch({ type: 'done' })
      }
    }
  }

  function stop() {
    const generationId = activeGenerationIdRef.current
    if (!generationId || !worldId) return

    stopRequestedRef.current = true
    dispatch({ type: 'done' })
    void fetch(`/api/worlds/${worldId}/generate/stop`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    }).catch(() => { })

    activeRequestControllerRef.current?.abort()
    activeGenerationIdRef.current = null
    activeRequestControllerRef.current = null
  }

  return {
    phase: state.phase,
    output: state.output,
    error: state.error,
    streaming,
    generate,
    stop,
  }
}
