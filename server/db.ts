import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// v3 runs on its own database. It deliberately ignores DB_PATH / DEV_DB_PATH: those point at the
// v2 databases, and CREATE TABLE IF NOT EXISTS would silently keep v2's tables of the same names.
const dbPath = process.env.V3_DB_PATH || './piece-v3.db'
const sqlite = new Database(dbPath)
sqlite.run('PRAGMA foreign_keys = ON;')

sqlite.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- A world has no versions or checkouts. Everything the author works on in the creator center —
  -- name, blurb, tags, pairings, the body, its collections and scenes — lives in draft, one
  -- WorldDraft JSON document (src/worldDraft.ts) the creator center autosaves freely. Readers never
  -- see it. Publish writes it out: name, blurb and body (WorldBody JSON) here, tags and pairings to
  -- their tables, collections and scenes to theirs, and the body's difference to world_changes. published_draft
  -- is the draft as last published, so draft != published_draft means changes not published.
  -- cover_url, like every image link, stays null until uploads exist. language is the author's UI
  -- language (a LanguageId) when they created the world, never chosen and never changed.
  -- updated_at is the last publish, the last change a reader could see — never a draft save.
  CREATE TABLE IF NOT EXISTS worlds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    blurb TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL,
    body TEXT NOT NULL,
    draft TEXT NOT NULL,
    published_draft TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    cover_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- A world's album: ambience photos in the author's order (position ascending). Saves live like
  -- the cover, no draft. Nothing writes here until uploads exist.
  CREATE TABLE IF NOT EXISTS world_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- The author's collections of scenes for a world, as last published (the creator center works on
  -- the world's draft): a name, a description and tags, in the author's order (position 0..n-1
  -- within the world). premise (optional) is context every scene in it shares: the model is given it with each of them, and readers see it on the collection's
  -- page. Prerequisites between collections come later.
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    premise TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- The author's scenes as last published (the creator center works on the world's draft), two
  -- texts each: description is what readers see (a sneak peek of the scene, in whatever words the
  -- author wants), instruction is what the model is given ("Write …, in this tone …") and never
  -- leaves the creator center. Only the author writes them, and edits or
  -- deletes them at any time, readers getting the change on Publish. Each is in one collection or none (collection_id null: the "No
  -- collection" group), at position 0..n-1 within that group. updated_at moves only when the
  -- instruction changes on a publish — it is what makes a reader's earlier story outdated — never
  -- on a description edit or a move.
  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    instruction TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- A reader's saved story of a scene. Always private. Unsaved generations never reach this table.
  -- Outdated when the scene's instruction changed after it was made (scenes.updated_at > created_at).
  -- Deleting the scene deletes its stories.
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    structure TEXT,
    model TEXT,
    provider TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- One global, freeform tag vocabulary shared by worlds and collections. name is the normalized form,
  -- so two spellings that normalize alike are the same tag.
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS world_tags (
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (world_id, tag_id)
  );

  -- A world's pairings (src/pairings.ts: mm, ff, mf, other), any number of them. A fixed
  -- list rather than tags: the feed's main filter. Listing metadata, so it saves live.
  CREATE TABLE IF NOT EXISTS world_pairings (
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    pairing TEXT NOT NULL,
    PRIMARY KEY (world_id, pairing)
  );

  CREATE TABLE IF NOT EXISTS collection_tags (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, tag_id)
  );

  -- One row per generation run, written when the stream ends however it ends (done, stopped,
  -- replaced, disconnected), saved or not. words is what had streamed by then (characters for
  -- Chinese). This is the popularity signal: total words, and distinct readers by user_id.
  -- scene_id is nullable so a deleted scene keeps counting toward its world.
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
    words INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, world_id)
  );

  -- The auto-generated changelog of the world itself: one row per difference found when the author
  -- publishes. kind is a fixed code (e.g. lore_edited, character_added) and label names the thing
  -- changed, so the client renders the sentence in the reader's language.
  CREATE TABLE IF NOT EXISTS world_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_worlds_user ON worlds(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_worlds_published ON worlds(published, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_collections_world ON collections(world_id, position);
  CREATE INDEX IF NOT EXISTS idx_scenes_world ON scenes(world_id, collection_id, position);
  CREATE INDEX IF NOT EXISTS idx_stories_user_scene ON stories(user_id, scene_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_stories_scene ON stories(scene_id);
  CREATE INDEX IF NOT EXISTS idx_world_tags_tag ON world_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_world_pairings_pairing ON world_pairings(pairing);
  CREATE INDEX IF NOT EXISTS idx_collection_tags_tag ON collection_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_generations_world ON generations(world_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_generations_scene ON generations(scene_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_world_photos_world ON world_photos(world_id, position);
  CREATE INDEX IF NOT EXISTS idx_world_changes_world ON world_changes(world_id, created_at DESC);
`)

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  bio: text('bio').notNull().default(''),
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
  blurb: text('blurb').notNull().default(''),
  language: text('language').notNull(),
  body: text('body').notNull(),
  draft: text('draft').notNull(),
  published_draft: text('published_draft'),
  published: integer('published').notNull().default(0),
  cover_url: text('cover_url'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const worldPhotos = sqliteTable('world_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  url: text('url').notNull(),
  position: integer('position').notNull(),
  created_at: integer('created_at').notNull(),
})

export const collections = sqliteTable('collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  name: text('name').notNull().default(''),
  description: text('description').notNull().default(''),
  premise: text('premise').notNull().default(''),
  position: integer('position').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const scenes = sqliteTable('scenes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  collection_id: integer('collection_id').references(() => collections.id),
  description: text('description').notNull(),
  instruction: text('instruction').notNull(),
  position: integer('position').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const stories = sqliteTable('stories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  scene_id: integer('scene_id').notNull().references(() => scenes.id),
  body: text('body').notNull(),
  structure: text('structure'),
  model: text('model'),
  provider: text('provider'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  created_at: integer('created_at').notNull(),
})

export const worldTags = sqliteTable('world_tags', {
  world_id: integer('world_id').notNull().references(() => worlds.id),
  tag_id: integer('tag_id').notNull().references(() => tags.id),
}, table => ({
  pk: primaryKey({ columns: [table.world_id, table.tag_id] }),
}))

export const worldPairings = sqliteTable('world_pairings', {
  world_id: integer('world_id').notNull().references(() => worlds.id),
  pairing: text('pairing').notNull(),
}, table => ({
  pk: primaryKey({ columns: [table.world_id, table.pairing] }),
}))

export const collectionTags = sqliteTable('collection_tags', {
  collection_id: integer('collection_id').notNull().references(() => collections.id),
  tag_id: integer('tag_id').notNull().references(() => tags.id),
}, table => ({
  pk: primaryKey({ columns: [table.collection_id, table.tag_id] }),
}))

export const generations = sqliteTable('generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  scene_id: integer('scene_id').references(() => scenes.id),
  words: integer('words').notNull(),
  created_at: integer('created_at').notNull(),
})

export const bookmarks = sqliteTable('bookmarks', {
  user_id: integer('user_id').notNull().references(() => users.id),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  created_at: integer('created_at').notNull(),
}, table => ({
  pk: primaryKey({ columns: [table.user_id, table.world_id] }),
}))

export const worldChanges = sqliteTable('world_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  world_id: integer('world_id').notNull().references(() => worlds.id),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  created_at: integer('created_at').notNull(),
})

export const db = drizzle(sqlite, {
  schema: { users, sessions, worlds, worldPhotos, collections, scenes, stories, tags, worldTags, worldPairings, collectionTags, generations, bookmarks, worldChanges },
})
