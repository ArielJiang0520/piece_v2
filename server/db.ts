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
    origin TEXT NOT NULL DEFAULT 'original',
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    register_id INTEGER REFERENCES registers(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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

  CREATE TABLE IF NOT EXISTS registers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT ''
  );
`)

function addColumnIfMissing(table: string, column: string, ddl: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!rows.some(row => row.name === column)) {
    sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${ddl};`)
  }
}

function dropColumnIfPresent(table: string, column: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (rows.some(row => row.name === column)) {
    sqlite.run(`ALTER TABLE ${table} DROP COLUMN ${column};`)
  }
}

addColumnIfMissing('worlds', 'origin', "origin TEXT NOT NULL DEFAULT 'original'")
dropColumnIfPresent('worlds', 'language')
addColumnIfMissing('registers', 'summary', "summary TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('worlds', 'register_id', 'register_id INTEGER REFERENCES registers(id) ON DELETE SET NULL')

sqlite.run(`
  CREATE INDEX IF NOT EXISTS idx_pieces_world_created ON pieces(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pieces_prompt_created ON pieces(prompt_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_world_updated ON prompts(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_cluster ON prompts(cluster_id);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_updated ON prompt_clusters(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_pieces ON prompt_clusters(user_id, world_id, piece_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompt_clusters_world_variations ON prompt_clusters(user_id, world_id, prompt_count DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_worlds_user_updated ON worlds(user_id, updated_at DESC);
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

export const registers = sqliteTable('registers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  details: text('details').notNull(),
  summary: text('summary').notNull().default(''),
})

export const worlds = sqliteTable('worlds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  origin: text('origin').notNull().default('original'),
  summary: text('summary').notNull().default(''),
  body: text('body').notNull().default(''),
  register_id: integer('register_id').references(() => registers.id),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
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

export const db = drizzle(sqlite, { schema: { users, sessions, worlds, promptClusters, prompts, pieces, registers } })
