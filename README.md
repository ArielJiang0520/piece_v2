# Mee-Fan

**[mee-fan.com](https://mee-fan.com)**

Mee-Fan is a private app for writing and reading AI fiction.

You describe a setting in your own words, write a scene against it, and the app streams a story back. Nothing is shared, browsed or recommended — everything you make is yours alone, and the whole app is built for reading on a phone.

## The three things

**World** — the setting you're writing in. Characters, tone, relationships, the recurring details, whatever the writing should know. A world is freeform text, not a form. Five minutes of it is enough to start; you learn what's missing after a few reads and come back to add it.

**Scene** — a specific situation inside that world. Not a one-off query — a *recipe*. The argument in the car. The lesson that runs long. The moment right before something tips over. You write a scene once and come back to it whenever you want another read of the same setup.

**Take** — one generated read of one scene. Run the same scene again tomorrow and you get a different version: different pacing, different beats, different turns. A premise worth reading is usually worth reading more than once, and one generation is rarely the best one.

> In the code these are `worlds`, `prompts` and `pieces`. The user-facing names live in `src/config.ts` (`ENTITY_LABELS`) — change them there and every screen follows. This README uses the code names only when talking about the code.

## The loop

Open a world → pick a scene → generate → read. If you arrive with something specific that isn't an existing scene, write it straight into a new one.

Everything else in the app exists to make one of those four steps better.

## Writing scenes

Four ways to get to a scene, all landing in the same editor:

- **Write it yourself.** The default, and still the fastest when you already know what you want.
- **AI scene builder.** Say a word or two about what you're after and the AI drafts a scene from your world. Revise it round by round — each note you give is kept as a trail, and you can go back and change an earlier ask to redo everything after it.
- **More like this.** Start from a scene you liked and get a different story with the same feel — new situation, new people, another corner of the world. Not a reworded version of the original. The new scene remembers what it came from, so a scene can show you what it inspired.
- **AI rework.** A pass over the scene you already have: same story, same people, sharper. Say what isn't working, or just ask for a pass. The draft comes back in the editor with the original one tap away (**Revert**).

Scenes you keep rewriting are grouped as **versions** of one scene rather than piling up as near-duplicates in your list, so the list stays a list of ideas. You can open the version history, compare and switch.

## Reading

Generation streams live. While it runs you can slow it down, speed it up, pause, or skip to the end.

While reading or after it finishes:

- **Expand** — take the last stretch and let it breathe.
- **Continue** — keep going, optionally with a note on where it should go.
- **Re-run from a marker** — every expand and continue leaves a marker in the text; jump back to one and take a different path from there.

Reading display (font, size) is adjustable in place, and the app has a light and a dark mode.

A take is only saved when you say so. Saved takes hang off their scene, can be reopened and continued later, and can be edited by hand.

## Taste

Tap a paragraph you love while reading and it's saved, optionally with a note about what got to you. Over time the app distills those into a short written profile of what you respond to **in that world**, and — when you switch it on — feeds it back into new writing. It's prose, not tags or ratings, and it lives per world, so what you like in one setting doesn't leak into another. You can read the profile, edit or delete individual likes, and refresh it whenever.

## Additions

An addition is a piece of extra setting — a character, a relationship, a rule — kept beside the world rather than inside it. Switch one on and its text is appended to the world description for anything generated next; switch it off and the world reads as it always did.

Takes record which additions were on when they were written, and the scene list can narrow to what was written with the additions currently on.

## Versions of a world

A world's history works like branches. Editing a world edits it in place; **New version** saves your edits as a separate version and leaves the current one untouched. A version owns everything under it — its scenes, its takes, its likes, its additions — so switching versions swaps the whole world underneath you, and switching back restores it exactly.

## Ask

A chat, scoped to one world. Ask what the setting is missing, how a passage reads, how to word something. It's a conversation about the world, not a generator — your world is never changed by it.

## Finding things

Your scenes are searchable by free text (fuzzy, so you don't need the exact wording), and sortable by recent, oldest, most takes, or most rewritten. New accounts start with a few sample worlds to poke at; delete them whenever.

## Elsewhere

- Bilingual — English and Chinese, switchable at any time.
- Several models to generate with, chosen per generation.

## What it isn't

- **Not social.** No sharing, no discovery, no other people's content. Worlds are private to your account.
- **Not an archive.** Takes are saved and re-readable, but the app is built around the fresh read, not the shelf.
- **Not a "surprise me" button.** It rewards arriving with something you want.

## Running it

Bun is the runtime for both server and tooling.

```bash
bun install
bun run dev     # API on :3001, client on :5173
```

Needs `OPENROUTER_API_KEY` in the environment for generation and search embeddings. See `CLAUDE.md` for architecture and `DESIGN.md` for the design rules.
