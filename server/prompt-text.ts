import { sql } from 'drizzle-orm'

export function normalizePromptInput(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function promptTextMatchesNormalized(column: unknown, value: string) {
  return sql`rtrim(${column}, ' ' || char(9) || char(10) || char(13)) = ${value}`
}
