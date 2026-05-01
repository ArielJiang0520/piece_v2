import { Database } from 'bun:sqlite'

const dbPath = process.env.DB_PATH || './piece.db'
const sqlite = new Database(dbPath)

function tableExists(name: string) {
  const row = sqlite
    .query('SELECT 1 AS exists_flag FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', name) as { exists_flag: number } | null
  return Boolean(row)
}

function indexExists(name: string) {
  const row = sqlite
    .query('SELECT 1 AS exists_flag FROM sqlite_master WHERE type = ? AND name = ?')
    .get('index', name) as { exists_flag: number } | null
  return Boolean(row)
}

function columnExists(table: string, column: string) {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some(row => row.name === column)
}

function run(label: string, statement: string) {
  sqlite.run(statement)
  console.log(label)
}

sqlite.run('PRAGMA foreign_keys = ON;')

if (!tableExists('prompt_clusters')) {
  run('created prompt_clusters', `
    CREATE TABLE prompt_clusters (
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
  `)
} else {
  console.log('prompt_clusters already exists')
}

if (!columnExists('prompts', 'cluster_id')) {
  run('added prompts.cluster_id', 'ALTER TABLE prompts ADD COLUMN cluster_id INTEGER REFERENCES prompt_clusters(id) ON DELETE SET NULL;')
} else {
  console.log('prompts.cluster_id already exists')
}

if (!columnExists('prompts', 'embedding')) {
  run('added prompts.embedding', 'ALTER TABLE prompts ADD COLUMN embedding TEXT;')
} else {
  console.log('prompts.embedding already exists')
}

if (!indexExists('idx_prompts_cluster')) {
  run('created idx_prompts_cluster', 'CREATE INDEX idx_prompts_cluster ON prompts(cluster_id);')
} else {
  console.log('idx_prompts_cluster already exists')
}

if (!indexExists('idx_prompt_clusters_world_updated')) {
  run(
    'created idx_prompt_clusters_world_updated',
    'CREATE INDEX idx_prompt_clusters_world_updated ON prompt_clusters(user_id, world_id, updated_at DESC);',
  )
} else {
  console.log('idx_prompt_clusters_world_updated already exists')
}

sqlite.close()
