import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { integer, primaryKey, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

const dbPath = process.env.DB_PATH || process.env.DEV_DB_PATH || './piece.db';
const sqlite = new Database(dbPath);
sqlite.run('PRAGMA foreign_keys = ON;')

sqlite.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS worlds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL DEFAULT '',
    current_version_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS world_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompt_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    average_embedding TEXT,
    prompt_count INTEGER NOT NULL DEFAULT 0,
    piece_count INTEGER NOT NULL DEFAULT 0,
    latest_prompt_id INTEGER,
    -- The world version this cluster belongs to: the version its latest prompt was created on.
    -- Denormalized from prompts.world_version_id (maintained wherever latest_prompt_id is), so the
    -- prompt list can filter clusters by version with a plain equality.
    world_version_id INTEGER REFERENCES world_versions(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE SET NULL,
    similar_to_prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    embedding TEXT,
    piece_count INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_generated INTEGER NOT NULL DEFAULT 0,
    -- The world version checked out when this prompt was first created. Source of truth for the
    -- cluster's version tag above. ON DELETE SET NULL: deleting a version orphans (not deletes)
    -- its prompts, and the list treats a null version as always-visible.
    world_version_id INTEGER REFERENCES world_versions(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pieces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    structure TEXT,
    model TEXT,
    provider TEXT,
    -- 1 when this piece was generated with the reader's taste profile applied (toggle on AND
    -- they had a non-empty profile for this world). Drives the "shaped by your taste" meta line.
    used_taste INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- One row per paragraph the reader marked as a "spark". Scoped to the world it came from
  -- (taste is per-world), and records the piece too when there is one. reasons is the reader's
  -- single free-form "why I liked this" text — optional, no structured tags/chips.
  CREATE TABLE IF NOT EXISTS taste_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    piece_id INTEGER REFERENCES pieces(id) ON DELETE CASCADE,
    snippet TEXT NOT NULL,
    -- The liked paragraph plus a paragraph or two on either side, so the distiller can read
    -- the loved passage in the flow it sat in (what led up to it, what it paid off) rather
    -- than the bare line. Null for likes recorded before this was captured.
    context TEXT,
    reasons TEXT,
    created_at INTEGER NOT NULL
  );

  -- One row per (world, version): the distilled taste profile for that version of the world.
  -- profile is a single freeform prose profile of what the reader responds to, injected into
  -- generation for that version. distilled_like_count is how many of the version's likes existed
  -- at the last distill, so the background trigger knows when enough new ones have accumulated.
  -- Versions are branches: switching HEAD switches which profile row is live, and deleting a
  -- version deletes its profile with it.
  CREATE TABLE IF NOT EXISTS taste_profile (
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    world_version_id INTEGER NOT NULL REFERENCES world_versions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile TEXT,
    distilled_like_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (world_id, world_version_id)
  );

  -- One row per turn in a world's chat thread. There is exactly one thread per world (no
  -- session list, no branching): clearing it deletes every row for that world, and editing
  -- or regenerating a turn deletes that row and every later one.
  CREATE TABLE IF NOT EXISTS world_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Discover's own rolling summary, mirroring taste_profile but about *premises* (which story
  -- ideas this reader picks up) rather than prose the reader loved. Per (world, version), like
  -- taste_profile. distilled_signal_count is how many prompt rows the version had at the last
  -- distill, so the refill-time trigger knows when enough new ones have accumulated.
  CREATE TABLE IF NOT EXISTS discover_profile (
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    world_version_id INTEGER NOT NULL REFERENCES world_versions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile TEXT,
    distilled_signal_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (world_id, world_version_id)
  );

`)

// Model usage/metadata tracking was removed; drop the table if an older DB still has it.
sqlite.run('DROP TABLE IF EXISTS model_usage;')
// The Discover candidate/telemetry log was removed with the bandit idea: nothing reads it — the
// feed's only evidence is the prompts table.
sqlite.run('DROP TABLE IF EXISTS discover_events;')

function addColumnIfMissing(table: string, column: string, ddl: string): boolean {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!rows.some(row => row.name === column)) {
    sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${ddl};`)
    return true
  }
  return false
}

function rebuildWorldsTable() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS worlds_new;')
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS worlds_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_example INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO worlds_new (id, user_id, name, is_example, body, created_at, updated_at)
      SELECT id, user_id, name, is_example, body, created_at, updated_at FROM worlds;
    `)
    sqlite.run('DROP TABLE worlds;')
    sqlite.run('ALTER TABLE worlds_new RENAME TO worlds;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

function rebuildPromptsTable() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS prompts_new;')
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS prompts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE SET NULL,
        similar_to_prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        embedding TEXT,
        piece_count INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_generated INTEGER NOT NULL DEFAULT 0,
        world_version_id INTEGER REFERENCES world_versions(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO prompts_new (id, user_id, world_id, cluster_id, similar_to_prompt_id, text, embedding, piece_count, is_favorite, is_generated, world_version_id, created_at, updated_at)
      SELECT id, user_id, world_id, cluster_id, similar_to_prompt_id, text, embedding, piece_count, is_favorite, is_generated, world_version_id, created_at, updated_at FROM prompts;
    `)
    sqlite.run('DROP TABLE prompts;')
    sqlite.run('ALTER TABLE prompts_new RENAME TO prompts;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

function rebuildPiecesTable() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS pieces_new;')
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS pieces_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        structure TEXT,
        model TEXT,
        provider TEXT,
        used_taste INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO pieces_new (id, user_id, world_id, prompt_id, body, structure, model, provider, used_taste, created_at, updated_at)
      SELECT id, user_id, world_id, prompt_id, body, structure, model, provider, used_taste, created_at, updated_at FROM pieces;
    `)
    sqlite.run('DROP TABLE pieces;')
    sqlite.run('ALTER TABLE pieces_new RENAME TO pieces;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

function rebuildTasteLikesTable() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS taste_likes_new;')
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS taste_likes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        piece_id INTEGER REFERENCES pieces(id) ON DELETE CASCADE,
        snippet TEXT NOT NULL,
        context TEXT,
        reasons TEXT,
        created_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO taste_likes_new (id, user_id, world_id, piece_id, snippet, context, reasons, created_at)
      SELECT id, user_id, world_id, piece_id, snippet, context, reasons, created_at FROM taste_likes;
    `)
    sqlite.run('DROP TABLE taste_likes;')
    sqlite.run('ALTER TABLE taste_likes_new RENAME TO taste_likes;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

function dropColumnIfPresent(table: string, column: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (rows.some(row => row.name === column)) {
    try {
      sqlite.run(`ALTER TABLE ${table} DROP COLUMN ${column};`)
    } catch (error) {
      if (table === 'worlds' && ['summary', 'origin', 'register_id'].includes(column)) {
        rebuildWorldsTable()
        return
      }
      if (table === 'prompts' && column === 'world_version_id') {
        rebuildPromptsTable()
        return
      }
      if (table === 'pieces' && column === 'world_version_id') {
        rebuildPiecesTable()
        return
      }
      if (table === 'taste_likes' && ['tags', 'note'].includes(column)) {
        rebuildTasteLikesTable()
        return
      }
      throw error
    }
  }
}

addColumnIfMissing('worlds', 'is_example', 'is_example INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('worlds', 'current_version_id', 'current_version_id INTEGER')
addColumnIfMissing('world_versions', 'name', 'name TEXT')
// Stable per-world version number, assigned at creation and never reused or
// shifted by deletes (deleting v2 leaves v1 and v3 as-is). Backfilled below,
// after the versionless-worlds INSERT, so those rows get numbered too.
addColumnIfMissing('world_versions', 'version_number', 'version_number INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('pieces', 'provider', 'provider TEXT')
addColumnIfMissing('pieces', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')
// Sidecar action history (JSON). Added before the world_version_id drop below so the
// pieces-table rebuild fallback, if it fires, can copy the column.
addColumnIfMissing('pieces', 'structure', 'structure TEXT')
// Whether the reader's taste profile shaped this generation. Added before the
// world_version_id drop below so the pieces-table rebuild fallback can copy the column.
addColumnIfMissing('pieces', 'used_taste', 'used_taste INTEGER NOT NULL DEFAULT 0')
// Backfill: existing pieces last "updated" when they were created.
sqlite.run('UPDATE pieces SET updated_at = created_at WHERE updated_at = 0;')
addColumnIfMissing('prompts', 'similar_to_prompt_id', 'similar_to_prompt_id INTEGER REFERENCES prompts(id)')
addColumnIfMissing('prompts', 'is_generated', 'is_generated INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('taste_likes', 'context', 'context TEXT')
// Fold the old separate `tags` (JSON array) + free-typed `note` into a single `reasons`
// text field, then drop them. tags like ["language","dialogue"] degrade to the readable
// "language, dialogue"; a note is joined on with an em dash. Guarded on the old columns
// still existing, since the UPDATE references them by name (a fresh DB never has them).
addColumnIfMissing('taste_likes', 'reasons', 'reasons TEXT')
if (sqlite.query(`PRAGMA table_info(taste_likes)`).all().some((r: any) => r.name === 'tags')) {
  sqlite.run(`
    UPDATE taste_likes
    SET reasons = NULLIF(TRIM(
      REPLACE(REPLACE(REPLACE(COALESCE(tags, '[]'), '[', ''), ']', ''), '"', '')
      || CASE
           WHEN COALESCE(note, '') != ''
                AND REPLACE(REPLACE(REPLACE(COALESCE(tags, '[]'), '[', ''), ']', ''), '"', '') != ''
             THEN ' — ' || note
           WHEN COALESCE(note, '') != '' THEN note
           ELSE ''
         END
    ), '')
    WHERE reasons IS NULL;
  `)
}
dropColumnIfPresent('taste_likes', 'tags')
dropColumnIfPresent('taste_likes', 'note')

// Taste went from per-user to per-world. The old taste_profile was keyed by user_id with no
// world_id and stored per-user aggregated statements — those can't be split back apart, so
// drop the table and let it recreate world-keyed (below). The likes survive and re-distill
// per world on demand. Guarded on the absence of the new world_id column so it runs once.
if (
  sqlite.query(`PRAGMA table_info(taste_profile)`).all().length > 0 &&
  !sqlite.query(`PRAGMA table_info(taste_profile)`).all().some((r: any) => r.name === 'world_id')
) {
  sqlite.run('DROP TABLE taste_profile;')
  sqlite.run(`
    CREATE TABLE taste_profile (
      world_id INTEGER PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      statements TEXT,
      distilled_like_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `)
}

// The taste profile went from a JSON array of toggleable statements (column `statements`) to a
// single freeform prose profile (column `profile`). The old JSON is meaningless as prose, and a
// profile is derived from the world's likes, so drop and recreate with the new column; the likes
// survive and re-distill on demand. Guarded on the old column so it runs once.
if (sqlite.query(`PRAGMA table_info(taste_profile)`).all().some((r: any) => r.name === 'statements')) {
  sqlite.run('DROP TABLE taste_profile;')
  sqlite.run(`
    CREATE TABLE taste_profile (
      world_id INTEGER PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile TEXT,
      distilled_like_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `)
}
sqlite.run('DROP INDEX IF EXISTS idx_pieces_world_version;')
sqlite.run('DROP INDEX IF EXISTS idx_prompts_world_version;')
sqlite.run('DROP INDEX IF EXISTS idx_world_versions_world_restored_from;')
// prompts.world_version_id is re-added and backfilled below (prompts are now tied to the world
// version they were created on). pieces stay unversioned.
dropColumnIfPresent('pieces', 'world_version_id')
dropColumnIfPresent('world_versions', 'restored_from_version_id')
dropColumnIfPresent('worlds', 'language')
dropColumnIfPresent('worlds', 'summary')
dropColumnIfPresent('worlds', 'origin')
dropColumnIfPresent('worlds', 'register_id')

sqlite.run(`
  INSERT INTO world_versions (world_id, body, created_at)
  SELECT id, body, updated_at FROM worlds
  WHERE id NOT IN (SELECT world_id FROM world_versions);
`)

// Number any unnumbered versions 1..n per world in creation order.
sqlite.run(`
  UPDATE world_versions
  SET version_number = (
    SELECT COUNT(*) FROM world_versions numbered
    WHERE numbered.world_id = world_versions.world_id
      AND (numbered.created_at < world_versions.created_at
           OR (numbered.created_at = world_versions.created_at AND numbered.id <= world_versions.id))
  )
  WHERE version_number = 0;
`)

// Point each world's HEAD at its latest version where unset (switching moves this pointer).
sqlite.run(`
  UPDATE worlds
  SET current_version_id = (
    SELECT world_versions.id FROM world_versions
    WHERE world_versions.world_id = worlds.id
    ORDER BY world_versions.created_at DESC, world_versions.id DESC
    LIMIT 1
  )
  WHERE current_version_id IS NULL
     OR current_version_id NOT IN (SELECT id FROM world_versions WHERE world_id = worlds.id);
`)

// Both profile tables went from one row per world to one per (world, version). Rebuild each
// old-shape table (guarded on the missing version column, so it runs once), stamping existing
// rows to their world's checked-out version — that is the version they learned on. Runs after
// the current_version_id backfill above so every world has a HEAD to stamp with.
// resetCount: discover_profile's old count was on a different scale (likes + edits + saved
// pieces) than the new signal (prompt rows), so carrying it over would leave the re-distill
// trigger unreachable; zeroing it makes the next refill rebuild the profile from clean inputs.
// taste_profile's count kept its meaning (likes) and is copied as-is.
function rebuildProfileTablePerVersion(table: string, countColumn: string, resetCount: boolean) {
  const columns = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (columns.length === 0 || columns.some(row => row.name === 'world_version_id')) return
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run(`DROP TABLE IF EXISTS ${table}_new;`)
    sqlite.run(`
      CREATE TABLE ${table}_new (
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        world_version_id INTEGER NOT NULL REFERENCES world_versions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile TEXT,
        ${countColumn} INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (world_id, world_version_id)
      );
    `)
    sqlite.run(`
      INSERT INTO ${table}_new (world_id, world_version_id, user_id, profile, ${countColumn}, updated_at)
      SELECT t.world_id, w.current_version_id, t.user_id, t.profile, ${resetCount ? '0' : `t.${countColumn}`}, t.updated_at
      FROM ${table} t
      JOIN worlds w ON w.id = t.world_id
      WHERE w.current_version_id IS NOT NULL;
    `)
    sqlite.run(`DROP TABLE ${table};`)
    sqlite.run(`ALTER TABLE ${table}_new RENAME TO ${table};`)
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}
rebuildProfileTablePerVersion('taste_profile', 'distilled_like_count', false)
rebuildProfileTablePerVersion('discover_profile', 'distilled_signal_count', true)

// Likes are stamped with the version that was checked out when they were recorded, the same way
// prompts are. Backfill only when the column is first added — rows whose version is later
// deleted go NULL (orphans that fold into whatever is checked out) and must stay NULL.
if (addColumnIfMissing('taste_likes', 'world_version_id', 'world_version_id INTEGER REFERENCES world_versions(id) ON DELETE SET NULL')) {
  sqlite.run(`
    UPDATE taste_likes
    SET world_version_id = (SELECT current_version_id FROM worlds WHERE worlds.id = taste_likes.world_id)
    WHERE world_version_id IS NULL;
  `)
}

// Prompts are tied to the world version they were created on; a cluster is tagged with the
// version of its latest prompt. Backfill runs after versions exist (above): existing prompts
// belong to their world's original (earliest) version, and each cluster inherits its latest
// prompt's version. Guarded on NULL so it runs once and never clobbers stamped rows.
addColumnIfMissing('prompts', 'world_version_id', 'world_version_id INTEGER REFERENCES world_versions(id) ON DELETE SET NULL')
addColumnIfMissing('prompt_clusters', 'world_version_id', 'world_version_id INTEGER REFERENCES world_versions(id) ON DELETE SET NULL')
sqlite.run(`
  UPDATE prompts
  SET world_version_id = (
    SELECT wv.id FROM world_versions wv
    WHERE wv.world_id = prompts.world_id
    ORDER BY wv.version_number ASC, wv.created_at ASC, wv.id ASC
    LIMIT 1
  )
  WHERE world_version_id IS NULL;
`)
sqlite.run(`
  UPDATE prompt_clusters
  SET world_version_id = (
    SELECT p.world_version_id FROM prompts p
    WHERE p.id = prompt_clusters.latest_prompt_id
  )
  WHERE world_version_id IS NULL;
`)

sqlite.run(`
  CREATE INDEX IF NOT EXISTS idx_pieces_world_created ON pieces(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pieces_prompt_created ON pieces(prompt_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_world_updated ON prompts(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_cluster ON prompts(cluster_id);
  CREATE INDEX IF NOT EXISTS idx_prompts_cluster_created ON prompts(cluster_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_similar_to ON prompts(similar_to_prompt_id);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_updated ON prompt_clusters(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_pieces ON prompt_clusters(user_id, world_id, piece_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_variations ON prompt_clusters(user_id, world_id, prompt_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_worlds_user_updated ON worlds(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_world_versions_world_created ON world_versions(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_taste_likes_user_created ON taste_likes(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_world_chat_world_created ON world_chat_messages(world_id, created_at, id);
`)

sqlite.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_user_world_normalized_text_unique
  ON prompts(user_id, world_id, rtrim(text, ' ' || char(9) || char(10) || char(13)));
`)

sqlite.run(`
  UPDATE prompt_clusters
  SET
    latest_prompt_id = (
      SELECT prompts.id
      FROM prompts
      WHERE prompts.cluster_id = prompt_clusters.id
      ORDER BY prompts.created_at DESC, prompts.id DESC
      LIMIT 1
    ),
    updated_at = coalesce((
      SELECT prompts.created_at
      FROM prompts
      WHERE prompts.cluster_id = prompt_clusters.id
      ORDER BY prompts.created_at DESC, prompts.id DESC
      LIMIT 1
    ), updated_at)
  WHERE EXISTS (
    SELECT 1
    FROM prompts
    WHERE prompts.cluster_id = prompt_clusters.id
  );
`)

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: integer('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  expires_at: integer('expires_at').notNull(),
})

export const worlds = sqliteTable('worlds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  is_example: integer('is_example').notNull().default(0),
  body: text('body').notNull().default(''),
  current_version_id: integer('current_version_id'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const worldVersions = sqliteTable('world_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  body: text('body').notNull(),
  name: text('name'),
  version_number: integer('version_number').notNull().default(0),
  created_at: integer('created_at').notNull(),
})

export const promptClusters = sqliteTable('prompt_clusters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  average_embedding: text('average_embedding'),
  prompt_count: integer('prompt_count').notNull().default(0),
  piece_count: integer('piece_count').notNull().default(0),
  latest_prompt_id: integer('latest_prompt_id'),
  world_version_id: integer('world_version_id').references(() => worldVersions.id),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const prompts = sqliteTable('prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  cluster_id: integer('cluster_id').references(() => promptClusters.id),
  similar_to_prompt_id: integer('similar_to_prompt_id').references((): AnySQLiteColumn => prompts.id),
  text: text('text').notNull(),
  embedding: text('embedding'),
  piece_count: integer('piece_count').notNull().default(0),
  is_favorite: integer('is_favorite').notNull().default(0),
  is_generated: integer('is_generated').notNull().default(0),
  world_version_id: integer('world_version_id').references(() => worldVersions.id),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const pieces = sqliteTable('pieces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  prompt_id: integer('prompt_id').notNull().references(() => prompts.id),
  body: text('body').notNull(),
  structure: text('structure'),
  model: text('model'),
  provider: text('provider'),
  used_taste: integer('used_taste').notNull().default(0),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const tasteLikes = sqliteTable('taste_likes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  piece_id: integer('piece_id').references(() => pieces.id),
  snippet: text('snippet').notNull(),
  context: text('context'),
  reasons: text('reasons'),
  world_version_id: integer('world_version_id').references(() => worldVersions.id),
  created_at: integer('created_at').notNull(),
})

export const tasteProfile = sqliteTable('taste_profile', {
  world_id: integer('world_id').notNull().references(() => worlds.id),
  world_version_id: integer('world_version_id').notNull().references(() => worldVersions.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  profile: text('profile'),
  distilled_like_count: integer('distilled_like_count').notNull().default(0),
  updated_at: integer('updated_at').notNull(),
}, table => ({
  pk: primaryKey({ columns: [table.world_id, table.world_version_id] }),
}))

export const worldChatMessages = sqliteTable('world_chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  created_at: integer('created_at').notNull(),
})

export const discoverProfile = sqliteTable('discover_profile', {
  world_id: integer('world_id').notNull().references(() => worlds.id),
  world_version_id: integer('world_version_id').notNull().references(() => worldVersions.id),
  user_id: integer('user_id').notNull().references(() => users.id),
  profile: text('profile'),
  distilled_signal_count: integer('distilled_signal_count').notNull().default(0),
  updated_at: integer('updated_at').notNull(),
}, table => ({
  pk: primaryKey({ columns: [table.world_id, table.world_version_id] }),
}))

export const db = drizzle(sqlite, { schema: { users, sessions, worlds, worldVersions, promptClusters, prompts, pieces, tasteLikes, tasteProfile, worldChatMessages, discoverProfile } })
