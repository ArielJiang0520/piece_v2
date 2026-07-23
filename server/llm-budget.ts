// The only two size limits in this app: how much text one model call may take in, and how much it
// may write back. They are enforced here, at the call, and nowhere else — every OpenRouter chat
// request goes through `budgeted()`.
//
// Nothing truncates an individual item anywhere upstream. A world body, a premise, a prompt is
// sent whole or not sent: half a premise is not a smaller premise, it is a wrong one, and a
// profile distilled from sentences that stop mid-clause learns the truncation as much as the
// taste. When a caller has more material than it wants to send, that is a ranking decision it
// makes in SQL — most stories written, favorited, most recent — not a slicing decision.
//
// Both numbers are deliberately far above anything a real world produces. They are here to stay
// inside a context window, not to ration.

// ~50k tokens of input: comfortably inside every model this app pins, and far past what a world
// plus its whole prompt history comes to.
export const MAX_INPUT_CHARS = 200_000
// One ceiling for every call, so it has to clear the longest thing the app writes — a story, not
// a profile. It is a runaway-provider stop, not a length target: nothing in the app asks for this
// much, and the model stops when the piece is done.
export const MAX_OUTPUT_TOKENS = 16_000

interface ChatBody {
  messages: Array<{ role: string; content: string }>
  max_tokens?: number
  [key: string]: unknown
}

// Wrap every chat-completions body. Caps the output, and reports an input that has outgrown the
// budget — loudly, but without editing it: the text belongs to the writer, and quietly sending a
// mangled world is worse than a provider error that says what actually happened.
export function budgeted<T extends ChatBody>(body: T, label: string): T {
  const size = body.messages.reduce((total, message) => total + message.content.length, 0)
  if (size > MAX_INPUT_CHARS) {
    console.warn(`[llm-budget] ${label}: input is ${size} chars, over the ${MAX_INPUT_CHARS} budget`)
  }
  return { ...body, max_tokens: body.max_tokens ?? MAX_OUTPUT_TOKENS }
}
