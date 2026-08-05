import { useEffect, useReducer, useRef } from 'react'
import { createRandomId } from '@/utils/id'
import { readServerSentEvents } from '@/utils/sse'

export type GenerationPhase = 'idle' | 'waiting_provider' | 'thinking' | 'writing'
export type GenerationCompletion = 'none' | 'completed' | 'cancelled' | 'error'

// Mirrors the server's OpenRouterErrorInfo so the UI can show a real debug message.
export interface GenerationErrorDetail {
  status?: number
  providerName?: string
  errorType?: string
  retryAfterSeconds?: number
  raw?: string
}

export interface GenerateInput {
  prompt: string
  model: string
  temperature: number
  useThinking: boolean
  // Whether to feed the reader's distilled taste profile into this generation. Flows
  // straight through into the request body (see the `...input` spread below).
  useTaste: boolean
  // The world additions to append to the world description. The reader's currently switched-on
  // set for a fresh generation; on a resume, the set the piece was written with, so continuing
  // it can't drop a character halfway through.
  additionIds: number[]
}

interface State {
  phase: GenerationPhase
  output: string
  error: string
  errorDetail: GenerationErrorDetail | null
  completion: GenerationCompletion
  provider: string
  // Transient status shown while a retryable failure (e.g. 429) is being backed off.
  notice: string
}

type Action =
  | { type: 'start' }
  | { type: 'start-expand'; seed: string }
  | { type: 'phase'; phase: GenerationPhase }
  | { type: 'provider'; name: string }
  | { type: 'chunk'; content: string }
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string; detail?: GenerationErrorDetail }
  | { type: 'done' }
  | { type: 'stop' }
  | { type: 'reset' }

const initialState: State = { phase: 'idle', output: '', error: '', errorDetail: null, completion: 'none', provider: '', notice: '' }

function extractErrorDetail(msg: any): GenerationErrorDetail | undefined {
  const detail: GenerationErrorDetail = {}
  if (typeof msg.status === 'number') detail.status = msg.status
  if (typeof msg.providerName === 'string') detail.providerName = msg.providerName
  if (typeof msg.errorType === 'string') detail.errorType = msg.errorType
  if (typeof msg.retryAfterSeconds === 'number') detail.retryAfterSeconds = msg.retryAfterSeconds
  if (typeof msg.raw === 'string') detail.raw = msg.raw
  return Object.keys(detail).length > 0 ? detail : undefined
}

// A human-readable headline for the error banner. The structured detail is shown beneath
// it; this turns the most common case (429) into something actionable.
function formatErrorMessage(msg: any): string {
  const base = typeof msg.message === 'string' && msg.message ? msg.message : 'Generation failed'
  if (msg.status === 429) {
    const provider = typeof msg.providerName === 'string' && msg.providerName ? ` from ${msg.providerName}` : ''
    const wait = typeof msg.retryAfterSeconds === 'number' && msg.retryAfterSeconds > 0
      ? ` Try again in about ${msg.retryAfterSeconds}s.`
      : ' Wait a moment and try again.'
    return `Rate limited (429)${provider} after automatic retries.${wait}`
  }
  return base
}

function formatRetryNotice(msg: any): string {
  const status = typeof msg.status === 'number' ? msg.status : null
  const label = status === 429 ? 'Rate limited' : status ? `Provider error (${status})` : 'Provider error'
  const provider = typeof msg.providerName === 'string' && msg.providerName ? ` from ${msg.providerName}` : ''
  const wait = typeof msg.waitSeconds === 'number' && msg.waitSeconds > 0 ? ` in ${msg.waitSeconds}s` : ''
  return `${label}${provider} — retrying${wait}…`
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...state, phase: 'waiting_provider', output: '', error: '', errorDetail: null, completion: 'none', provider: '', notice: '' }
    case 'start-expand':
      // Seed the buffer with the kept prefix; streamed chunks append below it.
      return { ...state, phase: 'waiting_provider', output: action.seed, error: '', errorDetail: null, completion: 'none', provider: '', notice: '' }
    case 'phase':
      // 'thinking' must not downgrade an already-writing stream
      if (action.phase === 'thinking' && state.phase === 'writing') return state
      return { ...state, phase: action.phase }
    case 'provider':
      return { ...state, provider: action.name }
    case 'chunk':
      // First real token clears any lingering retry notice.
      return { ...state, phase: 'writing', output: state.output + action.content, notice: '' }
    case 'notice':
      return { ...state, notice: action.message }
    case 'error':
      return { ...state, phase: 'idle', error: action.message, errorDetail: action.detail ?? null, completion: 'error', notice: '' }
    case 'done':
      return { ...state, phase: 'idle', completion: 'completed', notice: '' }
    case 'stop':
      return { ...state, phase: 'idle', output: '', error: '', errorDetail: null, completion: 'cancelled', provider: '', notice: '' }
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
  async function runGeneration(input: GenerateInput, priorText: string, mode: 'fresh' | 'expand' | 'continue' | 'regenerate', direction = '') {
    if (!worldId) return
    const isContinuation = priorText.length > 0
    // A continuation replaces whatever is currently streaming. Abort the prior client
    // fetch so we stop reading its stream, then just fire the new request: the server
    // enforces a single OpenRouter session and fully drains the replaced run before it
    // opens this one, so there is never more than one provider session at a time. Each
    // run keys off its own AbortController/generationId, so a replaced run stays silent
    // in the catch/finally below.
    activeRequestControllerRef.current?.abort()
    const generationId = createRandomId()
    const requestController = new AbortController()
    activeGenerationIdRef.current = generationId
    activeRequestControllerRef.current = requestController
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
          ...(mode !== 'fresh' ? { mode, priorText } : {}),
          ...(direction ? { direction } : {}),
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
          } else if (msg.type === 'retry') {
            dispatch({ type: 'notice', message: formatRetryNotice(msg) })
          } else if (msg.type === 'done') {
            streamSettled = true
            dispatch({ type: 'done' })
            onDoneRef.current?.()
            return
          } else if (msg.type === 'error') {
            streamSettled = true
            dispatch({ type: 'error', message: formatErrorMessage(msg), detail: extractErrorDetail(msg) })
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

  function expand(input: GenerateInput & { priorText: string; direction?: string }) {
    const { priorText, direction, ...rest } = input
    if (!priorText) return
    void runGeneration(rest, priorText, 'expand', direction)
  }

  function continueStory(input: GenerateInput & { priorText: string; direction?: string }) {
    const { priorText, direction, ...rest } = input
    if (!priorText) return
    void runGeneration(rest, priorText, 'continue', direction)
  }

  // Regenerate from a cut point: the same request as `continueStory` — the kept text is fed
  // back as an assistant prefill and continued. The only difference is that the caller cuts
  // `priorText` at the tapped paragraph instead of sending the whole story.
  function regenerate(input: GenerateInput & { priorText: string; direction?: string }) {
    const { priorText, direction, ...rest } = input
    if (!priorText) return
    void runGeneration(rest, priorText, 'regenerate', direction)
  }

  function stop() {
    const hadActive = activeGenerationIdRef.current !== null

    stopRequestedRef.current = true
    dispatch({ type: 'stop' })
    if (hadActive && worldId) {
      // Abort this owner's active OpenRouter session server-side; the body is unused.
      void fetch(`/api/worlds/${worldId}/generate/stop`, {
        method: 'POST',
        credentials: 'include',
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
    dispatch({ type: 'reset' })
  }

  return {
    phase: state.phase,
    output: state.output,
    error: state.error,
    errorDetail: state.errorDetail,
    notice: state.notice,
    completion: state.completion,
    provider: state.provider,
    displayComplete: state.phase === 'idle' && state.completion === 'completed',
    streaming,
    generate,
    expand,
    continueStory,
    regenerate,
    stop,
    reset,
  }
}
