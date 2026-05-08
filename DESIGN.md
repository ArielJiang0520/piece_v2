# Design principles

## The brief, in one sentence

**Editorial spine, sensual surface.** Vogue's discipline (type-led, no chrome, cool ink so pink is the only warm note) wrapped in soft shadows, fade-ins, and warm whites that make the app pleasurable to use rather than austere to admire.

This is a writing app with **zero images**. Type, color, and rhythm carry every screen. That constraint is the gift — it means the design rules are few and they must be obeyed.

## The five pillars

### 1. Cool ink, warm paper, structural pink

The palette has one job: make pink the only warm color on screen. Everything else is cool charcoal or warm white.

- Ink ramp is cool (`#0e0d10` → `#c9c4cf`). Never sepia, never brown.
- Paper is warm white (`#fbf9f7`). This is what stops the design from being austere.
- Pink has three roles: anchor (`rose`), structure (`rose-line`), tint (`rose-tint`). Use the right one.
- One screen, one solid-pink anchor moment. Everything else is hairline, dot, or a single numeral.

### 2. Typography is the protagonist, not chrome

Four roles. Use them ruthlessly. Anything that doesn't fit one of these roles probably shouldn't exist.

| Role | Class | Where |
|---|---|---|
| Display | `.t-display` | Once per page. World title, prompt opening. |
| Headline | `.t-headline` | List-item titles. World card name, scene preview. |
| Eyebrow | `.t-eyebrow` | Section labels. Tracked uppercase, optional pink hairline via `.eyebrow-rule`. |
| Meta | `.t-meta` | Timestamps, counts, tags. **Italic Domine, not sans.** This is the single biggest editorial gesture. |

Tag pills are dead. Metadata phrases are inline italic serif separated by em-dashes:
*original — explicit · 382 scenes*

### 3. Lists, not cards. Air, not borders.

Cards with `border + bg + radius` read as "boxed form fields." Editorial layout uses negative space and a single hairline.

The pattern is `.hairline-list`:

```tsx
<ul className="hairline-list flex flex-col px-6">
  {items.map(item => (
    <li className="py-7"> ... </li>
  ))}
</ul>
```

Rules:
- No background fill at rest. No border at rest.
- Vertical padding ≥ `py-7` (32px gap between items, total).
- Hover = `-translate-y-px` lift, optional `shadow-(--shadow-feather)`. Never a background-color change at rest.
- Last item has no bottom rule (handled by `> * + *`).

### 4. Pink usage rules — strict

Pink **appears in** (and roughly only in):
- Hairline rules between list items (`border-rose-line`)
- The unread/recent dot indicator (fresh items only)
- The eyebrow underline (`.eyebrow-rule`)
- List-item index numbers (`#23` etc.) — italic serif rose
- Section-header count numerals (`382` rose, `scenes` ink-3)
- Drop-cap (Domine italic, oversized first character, rose)
- The primary CTA — solid rose, soft shadow

Pink **does not appear in**:
- Body text
- Section titles or headlines
- Timestamps and metadata pills
- Backgrounds at rest
- Secondary buttons or links

### 5. Motion is pleasure, not utility

The design *needs* the soft animation; without it it becomes correct-but-cold. Three motion primitives:

- `.page-fade-in` — every page container. 220ms opacity fade on mount.
- `.list-item-reveal` — list items, with a per-item stagger:
  ```tsx
  <li
    className="list-item-reveal"
    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
  />
  ```
  Cap the index at 8 so late items don't feel held up.
- `hover:-translate-y-px` — universal hover for any interactive list row. Not a color change.

Three shadow tokens, used wherever shadows go:

| Token | Use |
|---|---|
| `--shadow-feather` | hairline-list hover, scroll-to-top button, soft chrome |
| `--shadow-cta` | primary CTA at rest |
| `--shadow-cta-hover` | primary CTA on hover |

The old `shadow-[0_16px_34px_rgba(...)]` arbitrary shadows are dead — use tokens.

## Anti-patterns (what to delete on sight)

- `border-paper-3` on list items, cards, or detail sections → use `.hairline-list` or `border-rose-line`.
- `bg-paper-2` as a card background → use whitespace.
- `text-ink-3 text-xs` for metadata → use `.t-meta`.
- Boxed pill tags (`rounded-sm bg-paper-2 px-1.5 py-0.5`) → italic serif phrase with em-dash.
- Sans-serif numbers in metadata positions → italic serif. Numbers want rose if they are a count of something.
- `font-medium`/`font-semibold` on titles → Domine at weight 400 already feels confident; don't bold it.
- `rounded-md` + heavy shadow on the CTA → `rounded-full` + `shadow-(--shadow-cta)`.
- Hover state that changes background color → use translate + shadow instead.

## Worked example

Before (cheap card):

```tsx
<button className="rounded-md border border-paper-3 bg-paper px-5 py-4">
  <div className="text-xs text-ink-4">Updated 2 days ago</div>
  <div className="text-xl font-semibold text-ink">Sally in LA</div>
  <div className="flex gap-1.5">
    <span className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-[11px]">original</span>
    <span className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-[11px]">steamy</span>
  </div>
</button>
```

After (editorial list item):

```tsx
<li className="list-item-reveal" style={{ animationDelay: `${i * 40}ms` }}>
  <button className="block w-full py-7 text-left transition-transform duration-200 hover:-translate-y-px">
    <RelativeTimeStatus className="mb-4" timestamp={ts} prefix="Updated " />
    <div className="t-headline">Sally in LA</div>
    <div className="t-meta mt-2 flex items-center gap-2">
      <span>original</span>
      <span aria-hidden className="text-ink-4">—</span>
      <span>steamy</span>
    </div>
  </button>
</li>
```

What changed: the box dissolved, the title is serif, metadata is italic serif separated by an em-dash, the timestamp's dot turns pink when fresh, and the row lifts on hover. Same data, completely different mood.

## When in doubt

Ask: *"Does this element exist because the content needs it, or because I'm afraid the page looks too empty?"*

Most of the time, it's the second. Delete it. Air is doing the work.
