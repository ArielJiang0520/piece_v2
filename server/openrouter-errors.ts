// Turning an OpenRouter failure into something the UI can actually show — HTTP status,
// which upstream provider failed, retry timing — instead of a bare string. Shared by every
// route that talks to OpenRouter's streaming chat endpoint.
// See https://openrouter.ai/docs/api/reference/errors-and-debugging

// Structured shape mirrored to the client so the UI can show a real debug message.
export interface OpenRouterErrorInfo {
  status: number
  message: string
  providerName?: string
  errorType?: string
  retryAfterSeconds?: number
  raw?: string
}

function stringifyRaw(raw: unknown): string | undefined {
  if (raw == null) return undefined
  return typeof raw === 'string' ? raw : JSON.stringify(raw)
}

// OpenRouter returns Retry-After on 429s; honor it before retrying. Supports both the
// delta-seconds and HTTP-date forms.
export function readRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const when = Date.parse(header)
  if (!Number.isNaN(when)) return Math.max(0, Math.ceil((when - Date.now()) / 1000))
  return undefined
}

export async function parseOpenRouterError(response: Response): Promise<OpenRouterErrorInfo> {
  const info: OpenRouterErrorInfo = {
    status: response.status,
    message: `OpenRouter ${response.status} ${response.statusText}`.trim(),
    retryAfterSeconds: readRetryAfter(response),
  }
  const rawBody = await response.text().catch(() => '')
  if (!rawBody) return info

  try {
    const parsed = JSON.parse(rawBody) as any
    const err = parsed?.error
    const metadata = err?.metadata
    const message = err?.message ?? metadata?.raw ?? parsed?.message
    if (typeof message === 'string' && message) info.message = message
    if (typeof metadata?.provider_name === 'string') info.providerName = metadata.provider_name
    if (typeof metadata?.error_type === 'string') info.errorType = metadata.error_type
    info.raw = stringifyRaw(metadata?.raw)
  } catch {
    info.raw = rawBody
  }
  return info
}

// Mid-stream errors arrive as an SSE payload with the same error/metadata shape.
export function describeStreamError(error: any, fallbackStatus: number): OpenRouterErrorInfo {
  const metadata = error?.metadata
  return {
    status: typeof error?.code === 'number' ? error.code : fallbackStatus,
    message: typeof error?.message === 'string' ? error.message : JSON.stringify(error),
    providerName: typeof metadata?.provider_name === 'string' ? metadata.provider_name : undefined,
    errorType: typeof metadata?.error_type === 'string' ? metadata.error_type : undefined,
    raw: stringifyRaw(metadata?.raw),
  }
}
