import { useEffect, useReducer, useRef, useState } from 'react'
import { createRandomId } from '@/utils/id'
import { readServerSentEvents } from '@/utils/sse'

export type GenerationPhase = 'idle' | 'waiting_provider' | 'thinking' | 'writing'
export type GenerationCompletion = 'none' | 'completed' | 'cancelled' | 'error'

export interface GenerateInput {
  prompt: string
  model: string
  temperature: number
  useThinking: boolean
}

interface State {
  phase: GenerationPhase
  output: string
  error: string
  completion: GenerationCompletion
  provider: string
}

type Action =
  | { type: 'start' }
  | { type: 'start-expand'; seed: string }
  | { type: 'phase'; phase: GenerationPhase }
  | { type: 'provider'; name: string }
  | { type: 'chunk'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'stop' }
  | { type: 'reset' }

const initialState: State = { phase: 'idle', output: '', error: '', completion: 'none', provider: '' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...state, phase: 'waiting_provider', output: '', error: '', completion: 'none', provider: '' }
    case 'start-expand':
      // Seed the buffer with the kept prefix; streamed chunks append below it.
      return { ...state, phase: 'waiting_provider', output: action.seed, error: '', completion: 'none', provider: '' }
    case 'phase':
      // 'thinking' must not downgrade an already-writing stream
      if (action.phase === 'thinking' && state.phase === 'writing') return state
      return { ...state, phase: action.phase }
    case 'provider':
      return { ...state, provider: action.name }
    case 'chunk':
      return { ...state, phase: 'writing', output: state.output + action.content }
    case 'error':
      return { ...state, phase: 'idle', error: action.message, completion: 'error' }
    case 'done':
      return { ...state, phase: 'idle', completion: 'completed' }
    case 'stop':
      return { ...state, phase: 'idle', output: '', error: '', completion: 'cancelled', provider: '' }
    case 'reset':
      return initialState
  }
}

interface UseGenerationOptions {
  worldId: string | undefined
  onDone?: () => void
}

export function useGeneration({ worldId, onDone }: UseGenerationOptions) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [lastGenerationId, setLastGenerationId] = useState<string | null>(null)
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

  // 'expand' dwells on the last paragraph; 'continue' resumes the story from the
  // full existing text. Both seed the buffer with priorText and stream below it.
  async function runGeneration(input: GenerateInput, priorText: string, mode: 'fresh' | 'expand' | 'continue' | 'fast-forward') {
    if (!worldId) return
    const isContinuation = priorText.length > 0
    // A continuation replaces whatever is currently streaming, so abort it first.
    // Each run keys off its own AbortController/generationId, so a replaced run
    // suppresses its own error/done in catch/finally below. Aborting the fetch
    // closes the connection (which the server treats as cancellation), and we also
    // post /stop so OpenRouter's still-running fast generation is torn down even if
    // the in-flight run hadn't finished buffering yet.
    const replacedGenerationId = activeGenerationIdRef.current
    activeRequestControllerRef.current?.abort()
    if (replacedGenerationId) {
      void fetch(`/api/worlds/${worldId}/generate/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: replacedGenerationId }),
      }).catch(() => { })
    }
    const generationId = createRandomId()
    const requestController = new AbortController()
    activeGenerationIdRef.current = generationId
    activeRequestControllerRef.current = requestController
    setLastGenerationId(generationId)
    stopRequestedRef.current = false
    dispatch(isContinuation ? { type: 'start-expand', seed: priorText } : { type: 'start' })

    let streamSettled = false
    let receivedContent = false
    try {
      const res = await fetch(`/api/worlds/${worldId}/generate`, {
        method: 'POST',
        credentials: 'include',
        signal: requestController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          generationId,
          ...(mode !== 'fresh' ? { mode, priorText } : {}),
        }),
      })

      if (!res.ok || !res.body) {
        streamSettled = true
        if (!stopRequestedRef.current) dispatch({ type: 'error', message: 'Request failed' })
        else dispatch({ type: 'stop' })
        return
      }

      for await (const data of readServerSentEvents(res.body)) {
        try {
          const msg = JSON.parse(data)
          if (msg.type === 'status' && msg.status === 'waiting_provider') {
            dispatch({ type: 'phase', phase: 'waiting_provider' })
          } else if (msg.type === 'provider') {
            if (typeof msg.name === 'string' && msg.name) {
              dispatch({ type: 'provider', name: msg.name })
            }
          } else if (msg.type === 'thinking') {
            dispatch({ type: 'phase', phase: 'thinking' })
          } else if (msg.type === 'chunk') {
            if (typeof msg.content === 'string' && msg.content.length > 0) {
              receivedContent = true
              dispatch({ type: 'chunk', content: msg.content })
            }
          } else if (msg.type === 'done') {
            streamSettled = true
            dispatch({ type: 'done' })
            onDoneRef.current?.()
            return
          } else if (msg.type === 'error') {
            streamSettled = true
            dispatch({ type: 'error', message: msg.message })
            return
          }
        } catch { }
      }
    } catch (e) {
      // A run aborted by stop() or by a replacing expansion must stay silent.
      if (!requestController.signal.aborted && !stopRequestedRef.current) {
        streamSettled = true
        dispatch({ type: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    } finally {
      if (activeGenerationIdRef.current === generationId) {
        activeGenerationIdRef.current = null
        activeRequestControllerRef.current = null
        if (!streamSettled && !stopRequestedRef.current) {
          if (receivedContent) {
            dispatch({ type: 'done' })
            onDoneRef.current?.()
          } else {
            dispatch({ type: 'error', message: 'Generation ended before completion' })
          }
        }
      }
    }
  }

  function generate(input: GenerateInput) {
    if (streaming) return
    void runGeneration(input, '', 'fresh')
  }

  function expand(input: GenerateInput & { priorText: string }) {
    const { priorText, ...rest } = input
    if (!priorText) return
    void runGeneration(rest, priorText, 'expand')
  }

  function continueStory(input: GenerateInput & { priorText: string }) {
    const { priorText, ...rest } = input
    if (!priorText) return
    void runGeneration(rest, priorText, 'continue')
  }

  // Skip ahead: keep the current paragraph, abort the rest of the buffered run, and
  // ask the model to wrap up the current beat and move on to the next natural action.
  function fastForward(input: GenerateInput & { priorText: string }) {
    const { priorText, ...rest } = input
    if (!priorText) return
    void runGeneration(rest, priorText, 'fast-forward')
  }

  function stop() {
    const generationId = activeGenerationIdRef.current

    stopRequestedRef.current = true
    dispatch({ type: 'stop' })
    setLastGenerationId(null)
    if (generationId && worldId) {
      void fetch(`/api/worlds/${worldId}/generate/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      }).catch(() => { })
    }

    activeRequestControllerRef.current?.abort()
    activeGenerationIdRef.current = null
    activeRequestControllerRef.current = null
  }

  function reset() {
    activeRequestControllerRef.current?.abort()
    activeGenerationIdRef.current = null
    activeRequestControllerRef.current = null
    setLastGenerationId(null)
    dispatch({ type: 'reset' })
  }

  return {
    phase: state.phase,
    output: state.output,
    error: state.error,
    completion: state.completion,
    provider: state.provider,
    generationId: lastGenerationId,
    displayComplete: state.phase === 'idle' && state.completion === 'completed',
    streaming,
    generate,
    expand,
    continueStory,
    fastForward,
    stop,
    reset,
  }
}
