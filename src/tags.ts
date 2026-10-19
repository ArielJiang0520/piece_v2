// Tags are freeform; this is the one place two spellings become the same tag. Shared by client
// (to show and dedupe what the reader typed) and server (the stored tags.name).
//   - NFKC folds full-width forms to half-width (ＢＤＳＭ → BDSM, ， → ,)
//   - case-folded
//   - '-', '_' and runs of whitespace all become a single space
//   - a leading '#' is dropped, as typed out of habit
export function normalizeTag(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[-_\s]+/g, ' ')
    .trim()
}

// Normalized, empty ones dropped, duplicates collapsed, typed order kept.
export function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const tag = normalizeTag(value)
    if (tag) seen.add(tag)
  }
  return [...seen]
}
