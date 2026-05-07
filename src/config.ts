export const ENTITY_LABELS = {
  world: 'world',
  prompt: 'scene',
  piece: 'take',
} as const

export type EntityKey = keyof typeof ENTITY_LABELS

export function entityLabel(
  key: EntityKey,
  options: { plural?: boolean; capitalize?: boolean } = {},
) {
  let label: string = ENTITY_LABELS[key]
  if (options.plural) label += 's'
  if (options.capitalize) label = label.charAt(0).toUpperCase() + label.slice(1)
  return label
}
