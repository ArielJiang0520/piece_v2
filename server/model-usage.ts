import { and, eq } from 'drizzle-orm'
import { db, modelUsage } from './db'

export type ModelUsageStatus = 'completed' | 'cancelled' | 'error'

interface ModelUsageWrite {
  userId: number
  worldId: number
  localGenerationId: string
  openrouterGenerationId: string | null
  requestedModel: string
  resolvedModel: string | null
  providerName: string | null
  status: ModelUsageStatus
  promptTokens: number
  completionTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  costMicrocredits: number
  rawUsage: unknown
  rawMetadata: unknown
  createdAt: number
  updatedAt?: number
}

function integerValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

function microcreditsValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 1_000_000)) : 0
}

function jsonValue(value: unknown) {
  if (value == null) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function metadataFromResponse(response: any) {
  return {
    id: typeof response?.id === 'string' ? response.id : null,
    object: typeof response?.object === 'string' ? response.object : null,
    model: typeof response?.model === 'string' ? response.model : null,
    created: typeof response?.created === 'number' ? response.created : null,
    choices: Array.isArray(response?.choices)
      ? response.choices.map((choice: any) => ({
        finish_reason: choice?.finish_reason ?? null,
        native_finish_reason: choice?.native_finish_reason ?? null,
      }))
      : [],
  }
}

export function buildModelUsageFromOpenRouterResponse(input: {
  userId: number
  worldId: number
  localGenerationId: string
  requestedModel: string
  status: ModelUsageStatus
  response: any
  createdAt: number
}): ModelUsageWrite | null {
  const usage = input.response?.usage
  if (!usage || typeof usage !== 'object') return null

  const promptTokens = integerValue(usage.prompt_tokens)
  const completionTokens = integerValue(usage.completion_tokens)
  const totalTokens = integerValue(usage.total_tokens) || promptTokens + completionTokens

  return {
    userId: input.userId,
    worldId: input.worldId,
    localGenerationId: input.localGenerationId,
    openrouterGenerationId: typeof input.response?.id === 'string' ? input.response.id : null,
    requestedModel: input.requestedModel,
    resolvedModel: typeof input.response?.model === 'string' ? input.response.model : null,
    providerName: null,
    status: input.status,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: integerValue(usage.completion_tokens_details?.reasoning_tokens),
    cachedTokens: integerValue(usage.prompt_tokens_details?.cached_tokens),
    cacheWriteTokens: integerValue(usage.prompt_tokens_details?.cache_write_tokens),
    costMicrocredits: microcreditsValue(usage.cost),
    rawUsage: usage,
    rawMetadata: metadataFromResponse(input.response),
    createdAt: input.createdAt,
  }
}

export function buildModelUsageFromGenerationMetadata(input: {
  userId: number
  worldId: number
  localGenerationId: string
  requestedModel: string
  status: ModelUsageStatus
  metadata: any
  createdAt: number
}): ModelUsageWrite | null {
  const data = input.metadata?.data
  if (!data || typeof data !== 'object') return null

  const promptTokens = integerValue(data.native_tokens_prompt ?? data.tokens_prompt)
  const completionTokens = integerValue(data.native_tokens_completion ?? data.tokens_completion)
  const totalTokens = promptTokens + completionTokens

  if (promptTokens === 0 && completionTokens === 0 && !data.total_cost && !data.usage) {
    return null
  }

  return {
    userId: input.userId,
    worldId: input.worldId,
    localGenerationId: input.localGenerationId,
    openrouterGenerationId: typeof data.id === 'string' ? data.id : null,
    requestedModel: input.requestedModel,
    resolvedModel: typeof data.model === 'string' ? data.model : null,
    providerName: typeof data.provider_name === 'string' ? data.provider_name : null,
    status: data.cancelled === true ? 'cancelled' : input.status,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: integerValue(data.native_tokens_reasoning),
    cachedTokens: integerValue(data.native_tokens_cached),
    cacheWriteTokens: 0,
    costMicrocredits: microcreditsValue(data.total_cost ?? data.usage),
    rawUsage: {
      tokens_prompt: data.tokens_prompt ?? null,
      tokens_completion: data.tokens_completion ?? null,
      native_tokens_prompt: data.native_tokens_prompt ?? null,
      native_tokens_completion: data.native_tokens_completion ?? null,
      native_tokens_reasoning: data.native_tokens_reasoning ?? null,
      native_tokens_cached: data.native_tokens_cached ?? null,
      total_cost: data.total_cost ?? null,
      usage: data.usage ?? null,
    },
    rawMetadata: {
      id: data.id ?? null,
      model: data.model ?? null,
      provider_name: data.provider_name ?? null,
      created_at: data.created_at ?? null,
      generation_time: data.generation_time ?? null,
      finish_reason: data.finish_reason ?? null,
      native_finish_reason: data.native_finish_reason ?? null,
      cancelled: data.cancelled ?? null,
    },
    createdAt: input.createdAt,
  }
}

export function writeModelUsage(event: ModelUsageWrite) {
  const now = event.updatedAt ?? Date.now()
  const values = {
    world_id: event.worldId,
    openrouter_generation_id: event.openrouterGenerationId,
    requested_model: event.requestedModel,
    resolved_model: event.resolvedModel,
    provider_name: event.providerName,
    status: event.status,
    prompt_tokens: event.promptTokens,
    completion_tokens: event.completionTokens,
    total_tokens: event.totalTokens,
    reasoning_tokens: event.reasoningTokens,
    cached_tokens: event.cachedTokens,
    cache_write_tokens: event.cacheWriteTokens,
    cost_microcredits: event.costMicrocredits,
    raw_usage: jsonValue(event.rawUsage),
    raw_metadata: jsonValue(event.rawMetadata),
    updated_at: now,
  }

  const existing = db
    .select({ id: modelUsage.id })
    .from(modelUsage)
    .where(and(
      eq(modelUsage.user_id, event.userId),
      eq(modelUsage.local_generation_id, event.localGenerationId),
    ))
    .get()

  if (existing) {
    db.update(modelUsage)
      .set(values)
      .where(eq(modelUsage.id, existing.id))
      .run()
    return existing.id
  }

  const row = db.insert(modelUsage).values({
    user_id: event.userId,
    local_generation_id: event.localGenerationId,
    created_at: event.createdAt,
    ...values,
  }).returning({ id: modelUsage.id }).get()

  return row.id
}

export async function fetchOpenRouterGenerationMetadata(apiKey: string, generationId: string) {
  const url = new URL('https://openrouter.ai/api/v1/generation')
  url.searchParams.set('id', generationId)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}
