import { diffWordsWithSpace } from 'diff'

export type PromptEditKind = 'same' | 'added' | 'removed'

export interface PromptEditMark {
  kind: PromptEditKind
  value: string
}

export function diffPromptInlineEdits(previous: string, current: string): PromptEditMark[] | null {
  if (previous === current) return null

  const marks = diffWordsWithSpace(previous, current)
    .filter(change => change.value.length > 0)
    .map<PromptEditMark>(change => ({
      kind: change.added ? 'added' : change.removed ? 'removed' : 'same',
      value: change.value,
    }))

  return marks.some(mark => mark.kind !== 'same') ? marks : null
}
