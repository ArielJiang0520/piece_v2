import { DEFAULT_LANGUAGE_ID, type LanguageId } from './preferences/language'

export const ENTITY_LABELS = {
  en: {
    world: { singular: 'world', plural: 'worlds' },
    prompt: { singular: 'scene', plural: 'scenes' },
    piece: { singular: 'take', plural: 'takes' },
  },
  zh: {
    world: { label: '设定集', count: '个设定集' },
    prompt: { label: '场景', count: '个场景' },
    piece: { label: '生成', count: '次生成' },
  },
} as const

export type EntityKey = keyof typeof ENTITY_LABELS.en

export function entityLabel(
  key: EntityKey,
  options: { plural?: boolean; capitalize?: boolean } = {},
  language: LanguageId = DEFAULT_LANGUAGE_ID,
) {
  let label = language === 'zh'
    ? ENTITY_LABELS.zh[key].label
    : options.plural
      ? ENTITY_LABELS.en[key].plural
      : ENTITY_LABELS.en[key].singular

  if (language === 'en' && options.capitalize) {
    label = label.charAt(0).toUpperCase() + label.slice(1)
  }

  return label
}

export function formatEntityCount(
  count: number,
  key: EntityKey,
  language: LanguageId = DEFAULT_LANGUAGE_ID,
) {
  if (language === 'zh') return `${count}${ENTITY_LABELS.zh[key].count}`
  return `${count} ${entityLabel(key, { plural: count !== 1 }, language)}`
}

export function formatPieceTitle(pieceNumber: number, language: LanguageId = DEFAULT_LANGUAGE_ID) {
  if (language === 'zh') return `生成 #${pieceNumber}`
  return `Take #${pieceNumber}`
}

export function formatEndOfPiece(pieceNumber: number | null, language: LanguageId = DEFAULT_LANGUAGE_ID) {
  if (!pieceNumber) return language === 'zh' ? '结束' : 'End'
  if (language === 'zh') return `生成#${pieceNumber}结束`
  return `End of Take #${pieceNumber}`
}
