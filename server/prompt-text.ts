export function normalizePromptInput(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
