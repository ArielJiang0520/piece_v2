// Loaded by bunfig.toml before any test file, which is the only moment these can be set:
// server/db.ts opens its Database at import time, so DB_PATH has to be right before the
// first `import { db } from '../db'` anywhere in the graph.

// A throwaway in-memory database, so tests never touch migrated.db or piece.db.
process.env.DB_PATH = ':memory:'

// No key means every LLM path (embeddings, taste distillation, generation) bails out before
// it opens a socket. These tests cover the database APIs only; this is the guarantee that a
// stray background call — the fire-and-forget embed after a piece save, say — stays local.
delete process.env.OPENROUTER_API_KEY

// Not 'production': keeps index.ts from mounting the static-file handlers over the API.
process.env.NODE_ENV = 'test'
