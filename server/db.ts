import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
    prompt_count INTEGER NOT NULL DEFAULT 0,
    piece_count INTEGER NOT NULL DEFAULT 0,
    latest_prompt_id INTEGER,
    -- The world version this cluster belongs to, fixed when the cluster is created. This is the
    -- ONLY place a version is recorded below the world: prompts, pieces and piece-attached likes
    -- all derive theirs by walking up to here. Deleting a version deletes its clusters, and with
    -- them their prompts, those prompts' pieces, and those pieces' likes.
    world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    -- Every prompt is born into a cluster in the same transaction, so this is never null in
    -- practice. CASCADE: deleting a cluster takes its prompt variations with it.
    cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    -- Search index only: the prompt's own embedding, fetched in the background after saving.
    -- Null means "not findable by fuzzy search yet", never anything about grouping.
    embedding TEXT,
    piece_count INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
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
    -- JSON array of the world_additions that were switched on when this piece was written, so
    -- continuing it rebuilds the same world text no matter what is switched on now. Null means
    -- none were on (or the piece predates additions) — the bare world body, as before.
    addition_ids TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Optional blocks of world text — a character, a relationship, a rule — that the reader
  -- switches on and off, and which append to the world body at the model call. Version-owned
  -- like prompt_clusters: deleting a version deletes its additions, and a new version starts
  -- with none. The on/off set itself is not here; it is a per-device preference in localStorage.
  CREATE TABLE IF NOT EXISTS world_additions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    world_version_id INTEGER NOT NULL REFERENCES world_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
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
    -- Whether this like feeds the distiller. The reader turns likes off by hand on the taste
    -- screen when one no longer speaks for them; nothing turns them off automatically (no age
    -- window, no pool ceiling). Off likes are kept in full and still listed — they just don't
    -- go to the model. New likes are on.
    active INTEGER NOT NULL DEFAULT 1,
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

  -- One row per turn in a chat thread. A row's thread is derivable from the subject columns, so
  -- there is no kind column: both null is the world thread, a cluster is that cluster's thread.
  -- world_version_id is written by nothing now — it belonged to the removed new-prompt thread,
  -- and rows still carrying one are that thread's leftovers. There is exactly one thread per
  -- subject (no session list, no branching): clearing it deletes every row for that subject, and
  -- editing or regenerating a turn deletes that row and every later one. Cascade does the
  -- lifetime work — deleting a cluster, a version or a world takes the threads hanging off it
  -- with no cleanup code.
  CREATE TABLE IF NOT EXISTS world_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE CASCADE,
    world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

`)

// Model usage/metadata tracking was removed; drop the table if an older DB still has it.
sqlite.run('DROP TABLE IF EXISTS model_usage;')

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
        addition_ids TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO pieces_new (id, user_id, world_id, prompt_id, body, structure, model, provider, used_taste, addition_ids, created_at, updated_at)
      SELECT id, user_id, world_id, prompt_id, body, structure, model, provider, used_taste, addition_ids, created_at, updated_at FROM pieces;
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

function hasColumn(table: string, column: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some(row => row.name === column)
}

// The ON DELETE action currently declared for a column's foreign key, or null when it has none.
// SQLite can't ALTER a foreign key, so this is how the rebuilds below know whether they've
// already run: the declared action IS the migration marker.
function foreignKeyOnDelete(table: string, column: string) {
  const rows = sqlite.query(`PRAGMA foreign_key_list(${table})`).all() as Array<{ from: string; on_delete: string }>
  return rows.find(row => row.from === column)?.on_delete ?? null
}

// Version ownership moved onto the cluster alone: drop average_embedding (clusters are no longer
// formed by embedding similarity) and make the version FK cascade.
function rebuildPromptClustersTable() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS prompt_clusters_new;')
    sqlite.run(`
      CREATE TABLE prompt_clusters_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        prompt_count INTEGER NOT NULL DEFAULT 0,
        piece_count INTEGER NOT NULL DEFAULT 0,
        latest_prompt_id INTEGER,
        world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO prompt_clusters_new (id, user_id, world_id, prompt_count, piece_count, latest_prompt_id, world_version_id, created_at, updated_at)
      SELECT id, user_id, world_id, prompt_count, piece_count, latest_prompt_id, world_version_id, created_at, updated_at FROM prompt_clusters;
    `)
    sqlite.run('DROP TABLE prompt_clusters;')
    sqlite.run('ALTER TABLE prompt_clusters_new RENAME TO prompt_clusters;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

// Rebuild prompts into the shape above. Three migrations land here, since SQLite can neither
// ALTER a foreign key nor drop a column one references: world_version_id goes (the cluster holds
// the version now), cluster_id gains ON DELETE CASCADE so deleting a cluster takes its variations
// rather than orphaning them, and the lineage pair (similar_to_prompt_id, is_generated) goes with
// the "More like this" feature that wrote them.
function rebuildPromptsTable() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS prompts_new;')
    sqlite.run(`
      CREATE TABLE prompts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        embedding TEXT,
        piece_count INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO prompts_new (id, user_id, world_id, cluster_id, text, embedding, piece_count, is_favorite, created_at, updated_at)
      SELECT id, user_id, world_id, cluster_id, text, embedding, piece_count, is_favorite, created_at, updated_at FROM prompts;
    `)
    sqlite.run('DROP TABLE prompts;')
    sqlite.run('ALTER TABLE prompts_new RENAME TO prompts;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

// A like stamped with a version belongs to that version outright: deleting the version deletes
// it, rather than leaving a versionless like that silently feeds whatever is checked out next.
function rebuildTasteLikesTableWithVersionCascade() {
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run('DROP TABLE IF EXISTS taste_likes_new;')
    sqlite.run(`
      CREATE TABLE taste_likes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        piece_id INTEGER REFERENCES pieces(id) ON DELETE CASCADE,
        snippet TEXT NOT NULL,
        context TEXT,
        reasons TEXT,
        world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL
      );
    `)
    sqlite.run(`
      INSERT INTO taste_likes_new (id, user_id, world_id, piece_id, snippet, context, reasons, world_version_id, created_at)
      SELECT id, user_id, world_id, piece_id, snippet, context, reasons, world_version_id, created_at FROM taste_likes;
    `)
    sqlite.run('DROP TABLE taste_likes;')
    sqlite.run('ALTER TABLE taste_likes_new RENAME TO taste_likes;')
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}

// One cluster used to be able to hold prompts from several versions (membership was decided by
// embedding similarity, which ignored versions entirely). Split those apart before the version
// stamp is dropped from prompts: each foreign version's prompts move to a new cluster of their
// own on that version. Runs only while prompts still carry a version, so it runs once.
function splitClustersSpanningVersions() {
  const groups = sqlite.query(`
    SELECT p.cluster_id AS cluster_id, p.world_version_id AS version_id
    FROM prompts p
    JOIN prompt_clusters c ON c.id = p.cluster_id
    WHERE p.world_version_id IS NOT NULL
      AND c.world_version_id IS NOT NULL
      AND p.world_version_id != c.world_version_id
    GROUP BY p.cluster_id, p.world_version_id
  `).all() as Array<{ cluster_id: number; version_id: number }>

  for (const group of groups) {
    const now = Date.now()
    const created = sqlite.run(
      `INSERT INTO prompt_clusters (user_id, world_id, prompt_count, piece_count, latest_prompt_id, world_version_id, created_at, updated_at)
       SELECT user_id, world_id, 0, 0, NULL, ?, ?, ? FROM prompt_clusters WHERE id = ?;`,
      [group.version_id, now, now, group.cluster_id],
    )
    sqlite.run(
      'UPDATE prompts SET cluster_id = ? WHERE cluster_id = ? AND world_version_id = ?;',
      [Number(created.lastInsertRowid), group.cluster_id, group.version_id],
    )
  }

  if (groups.length > 0) {
    console.log(`[migration] split ${groups.length} cross-version prompt cluster group(s)`)
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
      if (table === 'pieces' && column === 'world_version_id') {
        rebuildPiecesTable()
        return
      }
      if (table === 'taste_likes' && ['tags', 'note'].includes(column)) {
        rebuildTasteLikesTable()
        return
      }
      // similar_to_prompt_id points at prompts itself, and SQLite won't drop a column a foreign
      // key is written on.
      if (table === 'prompts' && ['similar_to_prompt_id', 'is_generated'].includes(column)) {
        rebuildPromptsTable()
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
// The world additions this piece was written with (JSON array of ids). Added before the
// world_version_id drop below so the pieces-table rebuild fallback can copy the column.
addColumnIfMissing('pieces', 'addition_ids', 'addition_ids TEXT')
// Backfill: existing pieces last "updated" when they were created.
sqlite.run('UPDATE pieces SET updated_at = created_at WHERE updated_at = 0;')
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
// Pieces hold no version of their own: a piece belongs to a prompt, a prompt to a cluster, and
// the cluster is what names the version.
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

// taste_profile went from one row per world to one per (world, version). Rebuild the old-shape
// table (guarded on the missing version column, so it runs once), stamping existing rows to
// their world's checked-out version — that is the version they learned on. Runs after the
// current_version_id backfill above so every world has a HEAD to stamp with. The like count
// kept its meaning across the change and is copied as-is.
function rebuildTasteProfileTablePerVersion() {
  const columns = sqlite.query(`PRAGMA table_info(taste_profile)`).all() as Array<{ name: string }>
  if (columns.length === 0 || columns.some(row => row.name === 'world_version_id')) return
  sqlite.run('PRAGMA foreign_keys = OFF;')
  try {
    sqlite.run(`DROP TABLE IF EXISTS taste_profile_new;`)
    sqlite.run(`
      CREATE TABLE taste_profile_new (
        world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        world_version_id INTEGER NOT NULL REFERENCES world_versions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile TEXT,
        distilled_like_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (world_id, world_version_id)
      );
    `)
    sqlite.run(`
      INSERT INTO taste_profile_new (world_id, world_version_id, user_id, profile, distilled_like_count, updated_at)
      SELECT t.world_id, w.current_version_id, t.user_id, t.profile, t.distilled_like_count, t.updated_at
      FROM taste_profile t
      JOIN worlds w ON w.id = t.world_id
      WHERE w.current_version_id IS NOT NULL;
    `)
    sqlite.run(`DROP TABLE taste_profile;`)
    sqlite.run(`ALTER TABLE taste_profile_new RENAME TO taste_profile;`)
  } finally {
    sqlite.run('PRAGMA foreign_keys = ON;')
  }
}
rebuildTasteProfileTablePerVersion()

// Likes are stamped with the version that was checked out when they were recorded, the same way
// prompts are. Backfill only when the column is first added — rows whose version is later
// deleted go NULL (orphans that fold into whatever is checked out) and must stay NULL.
if (addColumnIfMissing('taste_likes', 'world_version_id', 'world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE')) {
  sqlite.run(`
    UPDATE taste_likes
    SET world_version_id = (SELECT current_version_id FROM worlds WHERE worlds.id = taste_likes.world_id)
    WHERE world_version_id IS NULL;
  `)
}
if (foreignKeyOnDelete('taste_likes', 'world_version_id') !== 'CASCADE') {
  rebuildTasteLikesTableWithVersionCascade()
}
// Which likes feed the distiller. Added after the rebuild above so that fallback (which recreates
// the table from the older column list) can't drop it again. Existing likes default to on.
addColumnIfMissing('taste_likes', 'active', 'active INTEGER NOT NULL DEFAULT 1')

// The cluster is the sole holder of a world version below the world; prompts, pieces and
// piece-attached likes all derive theirs by walking up to it. Older databases also stamped every
// prompt, and formed clusters by embedding similarity — which ignored versions and so let one
// cluster span several. Migrate in order while the old stamp is still there: backfill it, derive
// each cluster's version from its latest prompt, split anything that spans versions, and only
// then drop the column (below). Guarded on the column existing, so the sequence runs once.
addColumnIfMissing('prompt_clusters', 'world_version_id', 'world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE')
if (hasColumn('prompts', 'world_version_id')) {
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
  // A cluster with no usable latest prompt still needs a version, or it would be deleted by the
  // cascade rebuild below without ever having belonged anywhere. Fall back to the world's first.
  sqlite.run(`
    UPDATE prompt_clusters
    SET world_version_id = (
      SELECT wv.id FROM world_versions wv
      WHERE wv.world_id = prompt_clusters.world_id
      ORDER BY wv.version_number ASC, wv.created_at ASC, wv.id ASC
      LIMIT 1
    )
    WHERE world_version_id IS NULL;
  `)
  splitClustersSpanningVersions()
}

// Rebuilds for the foreign keys the containment rule needs. SQLite can't ALTER a foreign key, so
// each is guarded on what it changes: an obsolete column, or an ON DELETE action that isn't
// CASCADE yet. Clusters first — prompts reference them.
if (hasColumn('prompt_clusters', 'average_embedding') || foreignKeyOnDelete('prompt_clusters', 'world_version_id') !== 'CASCADE') {
  rebuildPromptClustersTable()
}
if (hasColumn('prompts', 'world_version_id') || foreignKeyOnDelete('prompts', 'cluster_id') !== 'CASCADE') {
  rebuildPromptsTable()
}

// The "More like this" lineage. Nothing reads these any more: a prompt's only relationships are
// its cluster (which version, which premise) and the pieces written from it.
sqlite.run('DROP INDEX IF EXISTS idx_prompts_similar_to;')
dropColumnIfPresent('prompts', 'similar_to_prompt_id')
dropColumnIfPresent('prompts', 'is_generated')

// Which thread a chat row belongs to. Both null on every existing row — those are world-thread
// turns, which is what they were — so there is nothing to backfill.
addColumnIfMissing('world_chat_messages', 'cluster_id', 'cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE CASCADE')
addColumnIfMissing('world_chat_messages', 'world_version_id', 'world_version_id INTEGER REFERENCES world_versions(id) ON DELETE CASCADE')

// worlds.updated_at is the world's activity clock — what the world list and the drawer's recent
// list order by. Piece writes now move it, but rows written before that did not, so fold each
// world's newest piece into it once. Idempotent: a no-op the moment the invariant holds.
sqlite.run(`
  UPDATE worlds
  SET updated_at = MAX(updated_at, (
    SELECT COALESCE(MAX(pieces.updated_at), 0) FROM pieces WHERE pieces.world_id = worlds.id
  ));
`)

sqlite.run(`
  CREATE INDEX IF NOT EXISTS idx_pieces_world_created ON pieces(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pieces_user_world ON pieces(user_id, world_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_pieces_prompt_created ON pieces(prompt_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_world_updated ON prompts(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_cluster ON prompts(cluster_id);
  CREATE INDEX IF NOT EXISTS idx_prompts_cluster_created ON prompts(cluster_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_updated ON prompt_clusters(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_pieces ON prompt_clusters(user_id, world_id, piece_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_variations ON prompt_clusters(user_id, world_id, prompt_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_version ON prompt_clusters(user_id, world_id, world_version_id);
  CREATE INDEX IF NOT EXISTS idx_taste_likes_world_version ON taste_likes(user_id, world_id, world_version_id);
  CREATE INDEX IF NOT EXISTS idx_world_additions_version ON world_additions(user_id, world_id, world_version_id, created_at, id);
  CREATE INDEX IF NOT EXISTS idx_worlds_user_updated ON worlds(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_world_versions_world_created ON world_versions(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_taste_likes_user_created ON taste_likes(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_world_chat_world_created ON world_chat_messages(world_id, created_at, id);
  CREATE INDEX IF NOT EXISTS idx_world_chat_subject ON world_chat_messages(world_id, cluster_id, world_version_id, created_at, id);
`)

// Prompt text is unique per world VERSION now, not per world: the same premise written against
// version 2 is a different premise from the one written against version 1, and each needs its own
// cluster. That can't be a unique index on prompts, which no longer carries a version — the
// version lives one level up on the cluster. Enforcement moved to the version-scoped text match
// in routes/worlds/pieces.ts, which runs before every prompt insert.
sqlite.run('DROP INDEX IF EXISTS idx_prompts_user_world_normalized_text_unique;')

// Re-derive every cluster's rollups from the prompts it actually holds. The representative is
// always the latest created prompt. This also settles the clusters the cross-version split above
// created and the ones it emptied out, so neither is left with counts from before the split.
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
    prompt_count = (
      SELECT COUNT(*) FROM prompts WHERE prompts.cluster_id = prompt_clusters.id
    ),
    piece_count = (
      SELECT COALESCE(SUM(prompts.piece_count), 0) FROM prompts WHERE prompts.cluster_id = prompt_clusters.id
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

// A cluster the split left with no prompts of its own has nothing to represent; drop it, the way
// deleting a cluster's last prompt does at runtime.
sqlite.run(`
  DELETE FROM prompt_clusters
  WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE prompts.cluster_id = prompt_clusters.id);
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
  text: text('text').notNull(),
  embedding: text('embedding'),
  piece_count: integer('piece_count').notNull().default(0),
  is_favorite: integer('is_favorite').notNull().default(0),
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
  addition_ids: text('addition_ids'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const worldAdditions = sqliteTable('world_additions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  world_version_id: integer('world_version_id').notNull().references(() => worldVersions.id),
  name: text('name').notNull(),
  body: text('body').notNull().default(''),
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
  active: integer('active').notNull().default(1),
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
  // The thread's subject: both null is the world thread, a cluster is that cluster's thread.
  // world_version_id is no longer written — leftovers from the removed new-prompt thread.
  cluster_id: integer('cluster_id').references(() => promptClusters.id),
  world_version_id: integer('world_version_id').references(() => worldVersions.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  created_at: integer('created_at').notNull(),
})

export const db = drizzle(sqlite, { schema: { users, sessions, worlds, worldVersions, promptClusters, prompts, pieces, worldAdditions, tasteLikes, tasteProfile, worldChatMessages } })
