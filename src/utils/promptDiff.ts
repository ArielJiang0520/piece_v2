interface SegmenterLike {
  segment(text: string): Iterable<{ segment: string }>
}

interface SegmenterConstructorLike {
  new (locale?: string | string[], options?: { granularity?: 'word' }): SegmenterLike
}

export interface PromptDiff {
  added: string
  removed: string
}

function getSegmenter() {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructorLike }).Segmenter
  return Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null
}

function tokenize(text: string) {
  const segmenter = getSegmenter()
  if (!segmenter) return Array.from(text)

  return Array.from(segmenter.segment(text), item => item.segment)
}

const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const WORD_CHAR = /[\p{L}\p{N}]/u

function isSpaceSeparatedWordChar(ch: string) {
  return WORD_CHAR.test(ch) && !CJK_SCRIPT.test(ch)
}

function formatTokens(tokens: string[]) {
  let result = ''
  for (const token of tokens) {
    if (!token) continue
    const lastChar = result[result.length - 1]
    const firstChar = token[0]
    if (
      lastChar &&
      isSpaceSeparatedWordChar(lastChar) &&
      isSpaceSeparatedWordChar(firstChar)
    ) {
      result += ' '
    }
    result += token
  }
  return result.replace(/\s+/g, ' ').trim()
}

export function diffPromptText(previous: string, current: string): PromptDiff | null {
  if (previous === current) return null

  const previousTokens = tokenize(previous)
  const currentTokens = tokenize(current)
  const lengths = Array.from({ length: previousTokens.length + 1 }, () =>
    Array<number>(currentTokens.length + 1).fill(0),
  )

  for (let i = previousTokens.length - 1; i >= 0; i -= 1) {
    for (let j = currentTokens.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = previousTokens[i] === currentTokens[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const removed: string[] = []
  const added: string[] = []
  let i = 0
  let j = 0

  while (i < previousTokens.length && j < currentTokens.length) {
    if (previousTokens[i] === currentTokens[j]) {
      i += 1
      j += 1
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      removed.push(previousTokens[i])
      i += 1
    } else {
      added.push(currentTokens[j])
      j += 1
    }
  }

  removed.push(...previousTokens.slice(i))
  added.push(...currentTokens.slice(j))

  const diff = {
    added: formatTokens(added),
    removed: formatTokens(removed),
  }

  return diff.added || diff.removed ? diff : null
}
