import { useEffect, useReducer, useRef } from 'react'
import {
  getHiddenReadingSpeedUnitsPerSecond,
  useReadingSpeedUnitsPerSecond,
} from '@/preferences/readingSpeed'
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
}

type Action =
  | { type: 'start' }
  | { type: 'phase'; phase: GenerationPhase }
  | { type: 'chunk'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'stop' }
  | { type: 'reset' }

const initialState: State = { phase: 'idle', output: '', error: '', completion: 'none' }
const DISPLAY_FLUSH_MS = 80
const MAX_DISPLAY_UNITS_PER_FLUSH = 10
const DENSE_SCRIPT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...state, phase: 'waiting_provider', output: '', error: '', completion: 'none' }
    case 'phase':
      // 'thinking' must not downgrade an already-writing stream
      if (action.phase === 'thinking' && state.phase === 'writing') return state
      return { ...state, phase: action.phase }
    case 'chunk':
      return { ...state, phase: 'writing', output: state.output + action.content }
    case 'error':
      return { ...state, phase: 'idle', error: action.message, completion: 'error' }
    case 'done':
      return { ...state, phase: 'idle', completion: 'completed' }
    case 'stop':
      return { ...state, phase: 'idle', output: '', error: '', completion: 'cancelled' }
    case 'reset':
      return initialState
  }
}

function getDisplayUnitCost(char: string) {
  if (!/\S/u.test(char)) return 0
  return DENSE_SCRIPT_PATTERN.test(char) ? 2 : 1
}

function takeDisplaySlice(text: string, maxUnits: number) {
  let unitCount = 0
  let end = 0

  for (const char of text) {
    const cost = getDisplayUnitCost(char)
    if (cost > 0 && unitCount + cost > maxUnits && end > 0) break
    unitCount += cost
    end += char.length
  }

  return {
    visible: text.slice(0, end),
    remaining: text.slice(end),
  }
}

interface UseGenerationOptions {
  worldId: string | undefined
  onDone?: () => void
}

export function useGeneration({ worldId, onDone }: UseGenerationOptions) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const maxDisplayUnitsPerSecond = useReadingSpeedUnitsPerSecond()
  const activeGenerationIdRef = useRef<string | null>(null)
  const activeRequestControllerRef = useRef<AbortController | null>(null)
  const pendingChunkRef = useRef('')
  const chunkFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayUnitBudgetRef = useRef(0)
  const maxDisplayUnitsPerSecondRef = useRef(maxDisplayUnitsPerSecond)
  const lastChunkFlushAtRef = useRef(0)
  const pendingCompletionRef = useRef<Extract<Action, { type: 'done' | 'error' }> | null>(null)
  const stopRequestedRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  maxDisplayUnitsPerSecondRef.current = maxDisplayUnitsPerSecond

  function clearChunkFlushTimer() {
    if (!chunkFlushTimerRef.current) return
    clearTimeout(chunkFlushTimerRef.current)
    chunkFlushTimerRef.current = null
  }

  function resetDisplayPacer() {
    pendingChunkRef.current = ''
    displayUnitBudgetRef.current = 0
    lastChunkFlushAtRef.current = Date.now()
    pendingCompletionRef.current = null
    clearChunkFlushTimer()
  }

  function finishPendingCompletion() {
    if (pendingChunkRef.current || !pendingCompletionRef.current) return

    const completion = pendingCompletionRef.current
    pendingCompletionRef.current = null
    if (completion.type === 'done') {
      dispatch({ type: 'done' })
      onDoneRef.current?.()
    } else {
      dispatch(completion)
    }
  }

  function getDisplayUnitAllowance() {
    const now = Date.now()
    const elapsed = Math.max(0, now - lastChunkFlushAtRef.current)
    lastChunkFlushAtRef.current = now

    const budget = Math.min(
      displayUnitBudgetRef.current
        + (getHiddenReadingSpeedUnitsPerSecond(
          pendingChunkRef.current,
          maxDisplayUnitsPerSecondRef.current,
        ) * elapsed) / 1000,
      MAX_DISPLAY_UNITS_PER_FLUSH,
    )
    const allowance = Math.max(1, Math.floor(budget))
    displayUnitBudgetRef.current = Math.max(0, budget - allowance)

    return allowance
  }

  function scheduleChunkFlush() {
    if (chunkFlushTimerRef.current) return

    chunkFlushTimerRef.current = setTimeout(() => {
      chunkFlushTimerRef.current = null
      flushNextChunkSlice()
    }, DISPLAY_FLUSH_MS)
  }

  function flushNextChunkSlice() {
    const content = pendingChunkRef.current
    if (!content) {
      finishPendingCompletion()
      return
    }

    const { visible, remaining } = takeDisplaySlice(content, getDisplayUnitAllowance())
    if (!visible) {
      scheduleChunkFlush()
      return
    }

    pendingChunkRef.current = remaining
    dispatch({ type: 'chunk', content: visible })

    if (remaining) scheduleChunkFlush()
    else finishPendingCompletion()
  }

  function queueChunk(content: string) {
    pendingChunkRef.current += content
    scheduleChunkFlush()
  }

  function completeAfterDisplay(action: Extract<Action, { type: 'done' | 'error' }>) {
    pendingCompletionRef.current = action
    if (pendingChunkRef.current) scheduleChunkFlush()
    else finishPendingCompletion()
  }

  useEffect(() => {
    return () => {
      clearChunkFlushTimer()
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
    resetDisplayPacer()
    stopRequestedRef.current = false
    dispatch({ type: 'start' })

    let streamSettled = false
    let receivedContent = false
    try {
      const res = await fetch(`/api/worlds/${worldId}/generate`, {
        method: 'POST',
        credentials: 'include',
        signal: requestController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, generationId }),
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
          } else if (msg.type === 'thinking') {
            dispatch({ type: 'phase', phase: 'thinking' })
          } else if (msg.type === 'chunk') {
            if (typeof msg.content === 'string') {
              if (msg.content.length > 0) receivedContent = true
              queueChunk(msg.content)
            }
          } else if (msg.type === 'done') {
            streamSettled = true
            completeAfterDisplay({ type: 'done' })
            return
          } else if (msg.type === 'error') {
            streamSettled = true
            completeAfterDisplay({ type: 'error', message: msg.message })
            return
          }
        } catch { }
      }
    } catch (e) {
      if (!stopRequestedRef.current) {
        streamSettled = true
        completeAfterDisplay({ type: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    } finally {
      if (activeGenerationIdRef.current === generationId) {
        activeGenerationIdRef.current = null
        activeRequestControllerRef.current = null
        if (!streamSettled && !stopRequestedRef.current) {
          completeAfterDisplay(
            receivedContent
              ? { type: 'done' }
              : { type: 'error', message: 'Generation ended before completion' },
          )
        }
      }
    }
  }

  function stop() {
    const generationId = activeGenerationIdRef.current

    stopRequestedRef.current = true
    pendingCompletionRef.current = null
    pendingChunkRef.current = ''
    clearChunkFlushTimer()
    dispatch({ type: 'stop' })
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
    resetDisplayPacer()
    activeRequestControllerRef.current?.abort()
    activeGenerationIdRef.current = null
    activeRequestControllerRef.current = null
    dispatch({ type: 'reset' })
  }

  return {
    phase: state.phase,
    output: state.output,
    error: state.error,
    completion: state.completion,
    displayComplete: state.phase === 'idle' && state.completion === 'completed',
    streaming,
    generate,
    stop,
    reset,
  }
}
