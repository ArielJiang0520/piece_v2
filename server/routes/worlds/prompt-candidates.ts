import { BLACKLISTED_PROVIDERS, type ModelOption } from '../../../src/preferences/generationModel'
import { withGenerationSlot } from '../../generation-lock'
import { budgeted } from '../../llm-budget'

// Shared brainstorming path for the prompt-generation features ("similar prompts", "spark ideas").
// Both ask a fixed model for a handful of short prompt strings; they differ only in the system
// prompt and temperature. Keeping the OpenRouter call in one place means it shares the
// single-session slot, so overlapping either feature with story generation can't 429 the account.
//
// The wire format is one premise per line, NOT JSON. A premise is prose full of quotes, commas,
// em-dashes and (in Chinese) full-width punctuation — exactly the things that make a model's JSON
// come back unparseable, and a half-parsed object used to reach the reader as cards reading `[`
// or `"prompts": [`. Lines have no syntax to get wrong: a mangled line is one bad card we drop,
// not a batch we lose.

// A line has to look like a premise to be one. Below the floor it is punctuation or a stray label;
// above the ceiling the model has written the story instead of the premise.
const MIN_CANDIDATE_CHARS = 8
const MAX_CANDIDATE_CHARS = 700

// The output contract, shared so both features ask for the format this file actually parses.
export function candidateFormatInstruction(count: number): string {
  return [
    '# Output',
    `Write exactly ${count} of them, one per line, in plain text.`,
    '',
    '- One per line. Never break one across two lines, and leave no blank lines between them.',
    '- The line is the text itself: no numbering, no bullets, no quotation marks around it, no labels.',
    '- No JSON, no markdown, no code fences, no headings, no commentary before or after.',
  ].join('\n')
}

// Leading list markers the model adds despite being told not to. Stripped rather than rejected —
// the premise itself is fine, it just arrived wearing a bullet.
const LIST_MARKER = /^(?:[-*•·]|\d+[.)、．]|[（(]\d+[）)])\s*/

// Lines that are structure, not content. A premise never opens with a brace or bracket, and never
// ends with one or with a colon — which covers JSON scaffolding from a model that answered in JSON
// anyway, code fences, markdown headings, and every "Here are your premises:" preamble.
const STRUCTURAL = /^(?:```|[{[]|#{1,6}\s|[\]}(),;]+$)|[{[:：]$/

function unwrapQuotes(text: string): string {
  const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['“', '”'], ['「', '」'], ['『', '』'], ['《', '》']]
  for (const [open, close] of pairs) {
    if (text.length > 2 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(1, -1).trim()
    }
  }
  return text
}

// One premise per line, with every line that isn't one thrown away. Nothing here repairs a broken
// line — a candidate the model garbled is dropped, and the caller ships the ones that survived.
export function extractCandidates(content: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    let text = rawLine.trim()
    if (!text) continue
    text = text.replace(LIST_MARKER, '').trim()
    if (STRUCTURAL.test(text)) continue
    // A model answering in JSON leaves `"...",` per line; drop the wrapper, keep the premise.
    text = unwrapQuotes(text.replace(/,$/, '').trim())
    if (text.length < MIN_CANDIDATE_CHARS || text.length > MAX_CANDIDATE_CHARS) continue
    // Punctuation, digits or stray brackets alone are never a premise.
    if (!/\p{L}/u.test(text)) continue

    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }

  return out
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
        body: JSON.stringify(budgeted({
          model: model.id,
          temperature,
          reasoning: { effort: 'none' },
          stream: false,
          provider,
          messages,
        }, 'prompt candidates')),
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
