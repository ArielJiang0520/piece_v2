# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Piece is

A mobile-only web app for writing interactive fiction. A user defines a **world** (freeform setting text), writes **prompts** against it, and the app streams an LLM-generated **piece** (a story) back. Pieces are read in a paginated reading view. The product is a focused reading/writing experience — favor UI/copy/consistency fixes over restructuring flows.

## Runtime & commands

Bun is the runtime for both server and tooling (not Node). There is **no test suite and no lint config** — type-checking is the verification gate.

**Never live-test anything.** Do not start the server or client, hit API endpoints, make LLM calls, open or modify the database, drive the UI, or run one-off scripts to verify a change. The only verification ever run is the static check: `bunx tsc --noEmit`. If a change cannot be verified that way, say so and stop — the user does the live testing themselves.

```bash
bun run dev          # server (:3001) + Vite client (:5173) concurrently
bun run dev:server   # Hono API only, hot-reloaded, :3001
bun run dev:client   # Vite only, proxies /api -> 127.0.0.1:3001
bun run build         # vite build -> dist/
bunx tsc --noEmit    # type check (the only automated check; run before declaring done)
bun run start        # production: NODE_ENV=production, serves dist/ + API on :3000
```

One-off data scripts (operate on the live SQLite DB): `bun run migrate:prompt-clusters`, `bun run cluster:prompts`, `bun run regroup:prompts`.

Requires `OPENROUTER_API_KEY` in the environment for generation and embeddings. The code's default DB path is `./piece.db` (override with `DB_PATH`), but **the dev database is `migrated.db`** — the `piece.db` file in the repo is neither dev nor prod, so inspecting it tells you nothing.

## Architecture

**Stack:** Bun + Hono API, React 19 + React Router 7 (data router) + TanStack Query client, Tailwind v4, Drizzle ORM over `bun:sqlite`. `@/*` aliases `src/*` (configured in both `vite.config.ts` and `tsconfig.json`).

**Server (`server/`)** — Hono app in `index.ts` mounts route groups: `/api` (auth), `/api/worlds`, `/api/pieces`, `/api/admin`. World-scoped sub-routes live in `server/routes/worlds/` (`prompts`, `clusters`, `generate`, `pieces`) and are mounted under `/:id/...` in `worlds/index.ts`. `route-helpers.ts` holds the per-request ownership checks (`findUserWorld` etc. — every handler scopes queries by `userId`). Auth is cookie-session based (`sid` httpOnly cookie → `sessions` table), enforced by `authMiddleware`.

**Database (`server/db.ts`)** is the single schema source. It is **not** managed by Drizzle migrations — the file runs raw `CREATE TABLE IF NOT EXISTS` plus an idempotent hand-rolled migration sequence on every startup (`addColumnIfMissing`, `dropColumnIfPresent`, and full `rebuild*Table` fallbacks for SQLite's limited `ALTER`). Drizzle table definitions at the bottom must be kept in sync with the raw DDL above them. To change the schema, edit both the raw SQL and the Drizzle definition here.

**Generation flow (the core feature)** is server-sent-events end to end:
- Client `src/hooks/useGeneration.ts` is a reducer-based state machine (`idle → waiting_provider → thinking → writing`). It POSTs to `/api/worlds/:id/generate`, reads the SSE stream via `src/utils/sse.ts`, and appends `chunk` events into an `output` buffer. Each run gets a client-generated `generationId` and its own `AbortController`; a replacing run (e.g. "expand") aborts the prior one and stays silent.
- Server `server/routes/worlds/generate.ts` builds the system prompt from the world body, proxies to OpenRouter's streaming chat completions, and re-emits typed SSE events (`status`, `provider`, `thinking`, `chunk`, `error`, `done`). **`server/generation-lock.ts` serializes OpenRouter calls per owner, not globally.** `withGenerationSlot(ownerKey, task)` is a promise-chain mutex per owner key (call N+1 for that owner never opens its socket until N has drained, plus a settle delay), and `registerGeneration`/`abortGeneration` key runs by the same owner (`userId:worldId` for streams; prefixed keys like `ideas:`/`similar:`/`distill:`/`discover:` for background jobs), so a user's new action (or `POST /generate/stop`, or a client disconnect) aborts and drains their prior run first while background work runs alongside a live stream. A global `MIN_REQUEST_INTERVAL_MS` spaces request *starts* only. The `/generate` route gets an unbounded server timeout (set in `index.ts`). No token/cost/usage data is collected.
- "Expand" mode resends prior text as an assistant turn plus an expansion instruction to elaborate the last paragraph.

**Pieces & saving** — generated text is held in the client until the user saves it (`useGeneratePieceSession.ts`). Saving POSTs to `/api/worlds/:id/pieces`, which optimistically updates the TanStack Query cache. "Resume" reopens a saved piece, continues it, and PATCHes in place.

**Prompt clustering (`server/prompt-clustering.ts`)** — every saved prompt is embedded (OpenRouter `baai/bge-m3`) and grouped into a `prompt_cluster` by cosine similarity above a threshold (default 0.95). Clusters are how prompts are organized/deduped in the UI. Embedding failures degrade gracefully to singleton clusters.

**Models are a shared source of truth.** `src/preferences/generationModel.ts` defines the `MODELS` array and `BLACKLISTED_PROVIDERS` — imported by **both** client and server (`route-helpers.ts`, `generate.ts`). Add or change a model in this one file.

**Client structure (`src/`)** — `App.tsx` defines all routes under a `ProtectedLayout`. It deliberately uses `createBrowserRouter` (data router) so the reading view can `useBlocker`/`useUnsavedExitGuard` to guard against losing unsaved generated text on back/swipe. Feature pages live in `src/pages/worlds/{list,prompts,about,editor,generate}/`; `generate/` is the largest and is split into `components/` + `hooks/`. Shared UI is in `src/components/`.

**Preferences** (`src/preferences/`) are localStorage-backed reactive stores built with `createPreference.ts` (via `useSyncExternalStore`) — used for model choice, language, reading font/size/speed, theme. Not server state.

**i18n** — `src/i18n.ts` plus a `language` preference; the app is bilingual (English / Chinese `zh`), and several formatters branch on language and on whether text contains Chinese characters (word vs. character counts).

## Conventions

- **Mobile-only, touch app.** No hover/focus affordance styles — use resting weight and `active:` press states.
- Match the existing aesthetic (pills, italic serif for Chinese); don't introduce new widget styles like bordered-circle icon buttons.
- New header text actions go next to the existing Edit/Cancel action row, not floating in card bodies. List cards are whole-card click targets (no per-card "Open" buttons).
- Reuse existing signals/state rather than adding opt-in boolean props or flags.
