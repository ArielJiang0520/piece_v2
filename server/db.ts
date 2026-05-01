import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const dbPath = process.env.DB_PATH || './piece.db';
const sqlite = new Database(dbPath);
sqlite.run('PRAGMA foreign_keys = ON;')

try { sqlite.run(`ALTER TABLE worlds ADD COLUMN summary TEXT NOT NULL DEFAULT ''`) } catch { }

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
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    piece_count INTEGER NOT NULL DEFAULT 0,
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

function hasColumn(table: string, column: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some(row => row.name === column)
}

if (!hasColumn('pieces', 'prompt_id')) {
  sqlite.run(`
    PRAGMA foreign_keys = OFF;

    INSERT INTO prompts (user_id, world_id, text, piece_count, created_at, updated_at)
    SELECT user_id, world_id, prompt, COUNT(*), MIN(created_at), MAX(created_at)
    FROM pieces
    GROUP BY user_id, world_id, prompt;

    CREATE TABLE pieces_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL
    );

    INSERT INTO pieces_new (id, user_id, world_id, prompt_id, body, model, created_at)
    SELECT p.id, p.user_id, p.world_id, pr.id, p.body, p.model, p.created_at
    FROM pieces p
    JOIN prompts pr
      ON pr.user_id = p.user_id
      AND pr.world_id = p.world_id
      AND pr.text = p.prompt;

    DROP TABLE pieces;
    ALTER TABLE pieces_new RENAME TO pieces;

    PRAGMA foreign_keys = ON;
  `)
}

sqlite.run(`

  CREATE INDEX IF NOT EXISTS idx_pieces_world_created ON pieces(world_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pieces_prompt_created ON pieces(prompt_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_world_updated ON prompts(user_id, world_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_worlds_user_updated ON worlds(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
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
  summary: text('summary').notNull().default(''),
  body: text('body').notNull().default(''),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const prompts = sqliteTable('prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  text: text('text').notNull(),
  piece_count: integer('piece_count').notNull().default(0),
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

export const db = drizzle(sqlite, { schema: { users, sessions, worlds, prompts, pieces } })
