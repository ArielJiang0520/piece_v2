import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS world_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
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
    model TEXT,
    created_at INTEGER NOT NULL
  );

`)

function addColumnIfMissing(table: string, column: string, ddl: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!rows.some(row => row.name === column)) {
    sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${ddl};`)
  }
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
      throw error
    }
  }
}

addColumnIfMissing('worlds', 'is_example', 'is_example INTEGER NOT NULL DEFAULT 0')
dropColumnIfPresent('worlds', 'language')
dropColumnIfPresent('worlds', 'summary')
dropColumnIfPresent('worlds', 'origin')
dropColumnIfPresent('worlds', 'register_id')

sqlite.run(`
  INSERT INTO world_versions (world_id, name, body, created_at)
  SELECT id, name, body, updated_at FROM worlds
  WHERE id NOT IN (SELECT world_id FROM world_versions);
`)

sqlite.run(`
  CREATE INDEX IF NOT EXISTS idx_pieces_world_created ON pieces(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pieces_prompt_created ON pieces(prompt_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_world_updated ON prompts(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_cluster ON prompts(cluster_id);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_updated ON prompt_clusters(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_pieces ON prompt_clusters(user_id, world_id, piece_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_variations ON prompt_clusters(user_id, world_id, prompt_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_worlds_user_updated ON worlds(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_world_versions_world_created ON world_versions(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`)

sqlite.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_user_world_normalized_text_unique
  ON prompts(user_id, world_id, rtrim(text, ' ' || char(9) || char(10) || char(13)));
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
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const worldVersions = sqliteTable('world_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  name: text('name').notNull(),
  body: text('body').notNull(),
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
  model: text('model'),
  created_at: integer('created_at').notNull(),
})

export const db = drizzle(sqlite, { schema: { users, sessions, worlds, worldVersions, promptClusters, prompts, pieces } })
