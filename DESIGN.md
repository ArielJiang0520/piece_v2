# Design

Piece looks like an ordinary commercial social app: clear widgets, obvious tap targets, nothing
artistic. If a control isn't instantly recognisable as a button, field, tab or chip, it's wrong.

Everything below lives in `src/tokens.css` as component classes. Use them; don't hand-roll a
one-off button or card with raw utilities.

## Palette

- `paper` page background (light grey), `surface` cards / bars / inputs (white), `paper-2` quiet
  fills (chips at rest, segmented track, callouts), `paper-3` pressed, `line` borders.
- `ink` → `ink-4` text, darkest to faintest.
- `rose` is the brand: primary buttons, the active tab underline, the FAB. `rose-pale` /
  `rose-deep` for tonal fills and badges.
- `signal-green` / `signal-red` for status and destructive actions.
- Every token has a dark-mode value (`:root.dark`); never hard-code a colour.

## Type

UI is sans (`system-ui`) everywhere. Serif is only the reading prose of a story (`.prose`, the
reader's reading-font preference). No italics, no tracked uppercase labels.

| Class | Use |
|---|---|
| `.t-title` | Page title (a world's name on About). |
| `.t-section` | Section heading ("Bookmarked", "Characters", "For readers"). |
| `.t-headline` | Card title. |
| `.t-label` | Form field label, above its field. |
| `.t-body` | Body copy, blurbs, lore. |
| `.t-meta` / `.t-hint` | Secondary facts, helper text. |

## Widgets

- **Buttons** — `.btn` + one of `.btn-primary` (one per screen area), `.btn-secondary`,
  `.btn-tonal`, `.btn-ghost`, `.btn-danger`; sizes `.btn-sm` / `.btn-lg`; `.btn-block` for full
  width. Buttons carry an icon + a text label. `.icon-btn` only in the top bar / transport.
- **FAB** — `.fab`, bottom-left (left thumb), icon + label. One per screen (New world, New scene).
- **Cards** — `.card` for every list item and content block; add `.card-press` when the whole card
  is the tap target (no separate "Open" button). Lists are cards with `gap-3`, not hairlines.
- **Chips** — `.chip` for filters and selectable options; `aria-pressed="true"` (or `.chip-on`)
  fills it. Tags on cards are `.tag`; status is `.badge` (`.badge-rose`, `.badge-green`).
- **Fields** — `.input` / `.textarea` with a `.t-label` above. Never underline-only fields.
- **Segmented control** — `.segmented` with `<button aria-pressed>` children, for 2–3 mutually
  exclusive options (language, theme, Expand/Continue).
- **Tabs** — `components/TabBar.tsx`, the only tab strip.
- **Menus** — `.menu` + `.menu-item`. **Dialogs** — `ConfirmDialog` (Cancel + primary, equal width).
- **Callouts** — `.callout` with an icon for hints; `.error-box` for errors.
- **Empty states** — a card with a muted icon, one line, and an action button when there is one.

## Rules

- Mobile-only touch app: no hover/focus affordances; press feedback via `:active`.
- One-handed, left thumb: primary actions sit left (action rows start with the primary button,
  FABs are bottom-left).
- Icons are lucide, paired with text wherever space allows.
