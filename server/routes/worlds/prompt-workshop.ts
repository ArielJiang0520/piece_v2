import { type ModelOption } from '../../../src/preferences/generationModel'
import { openRouterProvider } from '../../openrouter-provider'
import { withGenerationSlot } from '../../generation-lock'
import { budgeted } from '../../llm-budget'

// Shared path for the two prompt-workshop features ("similar prompts", "spark ideas"). Both hand
// the model a conversation and get ONE prompt back; they differ only in the system prompt and in
// what the workshop is anchored to (a world setting, or an existing prompt). Keeping the
// OpenRouter call in one place means it shares the single-session slot, so overlapping either
// feature with story generation can't 429 the account.
//
// The response IS the draft — no list format, no per-line parsing. An earlier version of this file
// dealt five candidates at once and needed a one-per-line wire format to ship five things safely
// past a model's mangled JSON. One draft has nothing to get wrong: whatever comes back, trimmed
// and unwrapped, is the prompt.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

// The whole shared instruction, in as few words as it can be put.
//
// Length is the entire difficulty of this feature, and every attempt to fix it by SAYING more
// failed: "short enough to take in at a glance", "ONE sentence, around 30 words", the writer's own
// prompts listed under "match these", and finally those prompts replayed as fake assistant turns.
// All of them produced three paragraphs.
//
// The cause was the instructions themselves. A model answers in the register it is addressed in —
// several hundred words of careful, sectioned, high-effort prose is read as "this is a serious
// task, be thorough", and no sentence inside that wall can cancel what the wall itself says. The
// fix is not another sentence. It is deleting the wall.
//
// What a bad prompt looks like is known precisely, so it is named precisely: the model writes the
// situation, then breaks the whole scene down beat by beat with dialogue and blocking, then adds
// what to focus on. The first and last are wanted. The middle is what makes it unusable, and it is
// the only thing forbidden here.
export function workshopInstruction(): string {
  return [
    'You write story prompts. A prompt is a short brief handed to another writer: what to write, and one note on how — where to focus, what mood, whose eyes.',
    '',
    'Never break the scene down. No beats, no sequence of actions, no dialogue, no describing what happens moment by moment. That is the writer\'s job, not yours. Say what the scene is and what matters in it; stop there.',
    '',
    'Keep it to a couple of sentences. Answer with the prompt alone — no preamble, no options, no explanation.',
  ].join('\n')
}

// The workshop is a conversation, and every turn after the first is a revision of the prompt in
// the turn before it. Without this a model treats each new note as a fresh commission and throws
// away everything the writer already accepted.
export function revisionInstruction(): string {
  return [
    'When the writer asks for a change, return the whole revised prompt — not a diff, not a note about what you changed. Change what they asked for and leave the rest.',
    'Revising never makes it longer.',
  ].join('\n')
}

function unwrapQuotes(text: string): string {
  const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['“', '”'], ['「', '」'], ['『', '』'], ['《', '》']]
  for (const [open, close] of pairs) {
    if (text.length > 2 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(1, -1).trim()
    }
  }
  return text
}

// The model's reply as the draft. A model that wraps its answer in quotes despite being told not
// to has still written the prompt — that one wrapper is unwrapped, and nothing else is repaired.
export function extractDraft(content: string): string {
  return unwrapQuotes(content.trim())
}

// --- The workshop conversation ---------------------------------------------------------------
//
// The trail the writer has built: what they asked for, and what came back each time. The two
// arrays travel together and are always the same length — `notes[i]` produced `drafts[i]` — which
// is what lets the client throw away everything after a draft it has stepped back to.
//
// Nothing negative is ever sent. A draft the writer revised away is simply not in the trail; it is
// never described to the model as rejected.

export interface WorkshopInput {
  notes: string[]
  drafts: string[]
}

export function parseWorkshopInput(body: any): WorkshopInput {
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
      : []
  const notes = strings(body?.notes)
  const drafts = strings(body?.drafts)
  // The turn about to run is the last note, which has no draft yet. Anything beyond that pairing
  // is a client out of step with itself; trim to the pairs that make a conversation.
  const paired = Math.min(notes.length, drafts.length)
  return { notes: notes.slice(0, paired + 1), drafts: drafts.slice(0, paired) }
}

// The workshop as an actual conversation: what the writer asked for, what you wrote, what they
// want changed. A model reads its own prior drafts as its own turns, so a revision lands as a
// revision rather than as a new commission.
export function workshopMessages(systemPrompt: string, { notes, drafts }: WorkshopInput): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]
  notes.forEach((note, index) => {
    messages.push({ role: 'user', content: note })
    const draft = drafts[index]
    if (draft) messages.push({ role: 'assistant', content: draft })
  })
  return messages
}

export interface DraftRequest {
  apiKey: string
  model: ModelOption
  messages: ChatMessage[]
  temperature: number
  timeoutMs: number
}

export interface DraftResult {
  draft: string
  failure: { status: number; message: string } | null
}

export async function requestDraft({
  apiKey,
  model,
  messages,
  temperature,
  timeoutMs,
}: DraftRequest): Promise<DraftResult> {
  const provider = openRouterProvider(model.preferredProviders)

  // A holder object so the assignments inside the slot closure survive TS's control-flow
  // narrowing (a plain `let` would be narrowed back to its initial value after the await).
  const out: DraftResult = { draft: '', failure: null }

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
        }, 'prompt workshop')),
      })

      if (!response.ok) {
        const raw = await response.text().catch(() => '')
        console.error('[prompt-workshop error]', response.status, raw)
        out.failure = { status: 502, message: `OpenRouter ${response.status} ${response.statusText}`.trim() }
        return
      }

      const body = (await response.json()) as any
      const content = body?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        out.failure = { status: 502, message: 'No prompt returned' }
        return
      }
      const draft = extractDraft(content)
      if (!draft) {
        out.failure = { status: 502, message: 'No prompt returned' }
        return
      }
      out.draft = draft
    } catch (error) {
      console.error('[prompt-workshop error]', error)
      out.failure = { status: 502, message: 'Failed to reach the model' }
    } finally {
      clearTimeout(timeout)
    }
  })

  return out
}
