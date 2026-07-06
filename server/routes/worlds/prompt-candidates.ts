import { BLACKLISTED_PROVIDERS, type ModelOption } from '../../../src/preferences/generationModel'
import { withGenerationSlot } from '../../generation-lock'

// Shared brainstorming path for the prompt-generation features ("similar prompts", "spark ideas").
// Both ask a fixed model for a JSON array of short prompt strings; they differ only in the system
// prompt and temperature. Keeping the OpenRouter call in one place means it shares the single-session
// slot, so overlapping either feature with story generation can't 429 the account.

// Tolerant of models that wrap the JSON in prose or fall back to a bulleted list.
export function extractCandidates(content: string): string[] {
  const tryParse = (text: string): any => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = tryParse(content)
  if (!parsed) {
    const objectMatch = content.match(/\{[\s\S]*\}/)
    const arrayMatch = content.match(/\[[\s\S]*\]/)
    parsed = (objectMatch && tryParse(objectMatch[0])) || (arrayMatch && tryParse(arrayMatch[0])) || null
  }

  let list: unknown = null
  if (Array.isArray(parsed)) list = parsed
  else if (parsed && Array.isArray(parsed.prompts)) list = parsed.prompts

  if (Array.isArray(list)) {
    return list.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  }

  // Last resort: treat non-empty lines as candidates, stripping bullets/numbering.
  return content
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

export interface CandidateRequest {
  apiKey: string
  model: ModelOption
  messages: Array<{ role: string; content: string }>
  temperature: number
  count: number
  timeoutMs: number
}

export interface CandidateResult {
  candidates: string[]
  failure: { status: number; message: string } | null
}

export async function requestPromptCandidates({
  apiKey,
  model,
  messages,
  temperature,
  count,
  timeoutMs,
}: CandidateRequest): Promise<CandidateResult> {
  const provider: Record<string, unknown> = { sort: 'latency', require_parameters: true }
  if (model.preferredProviders.length > 0) provider.only = model.preferredProviders
  if (BLACKLISTED_PROVIDERS.length > 0) provider.ignore = BLACKLISTED_PROVIDERS

  // A holder object so the assignments inside the slot closure survive TS's control-flow
  // narrowing (a plain `let` would be narrowed back to its initial value after the await).
  const out: CandidateResult = { candidates: [], failure: null }

  // Same OpenRouter chat endpoint as story generation, so it shares the single-session slot —
  // overlapping the two would 429 the whole account.
  await withGenerationSlot(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id,
          temperature,
          reasoning: { effort: 'none' },
          stream: false,
          provider,
          response_format: { type: 'json_object' },
          messages,
        }),
      })

      if (!response.ok) {
        const raw = await response.text().catch(() => '')
        console.error('[prompt-candidates error]', response.status, raw)
        out.failure = { status: 502, message: `OpenRouter ${response.status} ${response.statusText}`.trim() }
        return
      }

      const body = (await response.json()) as any
      const content = body?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        out.failure = { status: 502, message: 'No candidates returned' }
        return
      }
      out.candidates = extractCandidates(content).slice(0, count)
    } catch (error) {
      console.error('[prompt-candidates error]', error)
      out.failure = { status: 502, message: 'Failed to reach the model' }
    } finally {
      clearTimeout(timeout)
    }
  })

  return out
}
