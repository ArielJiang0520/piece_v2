// Reasons a reader can attach to a liked paragraph — the "why do you like this?" tags.
// Shared by client (the like panel, the profile screen) and server (the distiller, which
// reasons per-dimension), so it stays free of React/DOM imports like pieceStructure.ts.
// (The LanguageId import below is type-only, so it erases at runtime — the server can import
// this module without pulling in any preference/React code.)
//
// THIS array is the single source of truth. To add, remove, relabel, or reorder a tag, edit
// the one list below — the tag keys, the craft/content split, the localized chip labels, and
// the distiller's per-dimension hints all derive from it. Nothing is hardcoded per-tag
// elsewhere.
//
// `craft: true` tags describe HOW the prose reads and generalize globally across worlds.
// `craft: false` (content) describes WHAT is happening and stays tied to the world it came
// from. The distiller and generation-time injection branch on the `content` dimension.

import type { LanguageId } from '@/preferences/language'

// `distill` tells the distiller HOW abstract to be for this dimension — the calibration that
// keeps a specific like specific. Craft dimensions generalize to a transferable pattern;
// `action` (content) must stay concrete, because the exact act IS the preference.
export const TASTE_TAG_DEFS = [
  { key: 'language', craft: true, label: { en: 'The language', zh: '文字' }, hint: 'prose style',
    distill: 'Describe the prose they respond to — rhythm, diction, sensory density, bluntness, restraint. Abstract the style so it transfers; never quote the sentence back.' },
  { key: 'dialogue', craft: true, label: { en: 'The dialogue', zh: '对白' }, hint: 'what the characters say',
    distill: 'Name the KIND of dialogue — subtext, teasing cruelty, blunt confession, deflection. Capture its texture; do not quote the lines.' },
  { key: 'plot direction', craft: true, label: { en: 'The direction', zh: '剧情走向' }, hint: 'unexpected good narrative choices',
    distill: 'Name the narrative MOVE as a transferable pattern (e.g. "withholds the obvious payoff", "lets a scene turn on a small choice"), not the specific event.' },
  { key: 'action', craft: false, label: { en: 'The action', zh: '行动' }, hint: 'the exact action/kink/move',
    distill: 'KEEP THE SPECIFIC act, kink, or physical move, named plainly (e.g. "deep, lingering tongue kisses"). NEVER soften it to a generic category like "physical intimacy" or "sensual contact" — the exact thing is the whole preference.' },
] as const satisfies readonly {
  key: string
  craft: boolean
  label: Record<LanguageId, string>
  hint: string
  distill: string
}[]

export type TasteTag = (typeof TASTE_TAG_DEFS)[number]['key']

// Ordered list of tag keys — chip order in the like panel, group order on the profile screen.
export const TASTE_TAGS: readonly TasteTag[] = TASTE_TAG_DEFS.map(d => d.key)

const DEF_BY_KEY = new Map(TASTE_TAG_DEFS.map(d => [d.key, d] as const))

export function isTasteTag(value: unknown): value is TasteTag {
  return typeof value === 'string' && DEF_BY_KEY.has(value as TasteTag)
}

// Content dimensions (craft: false) describe WHAT happens and stay tied to their world; craft
// dimensions generalize globally. The distiller and generation-time injection branch on this.
export function isCraftTag(tag: TasteTag): boolean {
  return DEF_BY_KEY.get(tag)?.craft ?? true
}

// The reader-facing chip label for a tag in the given UI language.
export function tasteTagLabel(tag: TasteTag, lang: LanguageId): string {
  return DEF_BY_KEY.get(tag)?.label[lang] ?? tag
}
