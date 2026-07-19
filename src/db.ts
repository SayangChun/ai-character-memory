import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS characters (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  avatar_emoji      TEXT DEFAULT '💖',
  persona           TEXT DEFAULT '',
  speaking_style    TEXT DEFAULT '',
  relationship_stage TEXT DEFAULT '初识',
  notes             TEXT DEFAULT '',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memories (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  category        TEXT DEFAULT 'fact',
  importance      INTEGER DEFAULT 3,
  tags            TEXT DEFAULT '[]',
  source_platform TEXT DEFAULT 'manual',
  is_pinned       INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  occurred_at     DATETIME,
  expires_at      DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_memories_character_id ON memories(character_id);
CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_is_pinned ON memories(is_pinned);
CREATE INDEX IF NOT EXISTS idx_memories_is_active ON memories(is_active);

CREATE TABLE IF NOT EXISTS session_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  platform     TEXT DEFAULT 'other',
  title        TEXT DEFAULT '',
  summary      TEXT DEFAULT '',
  raw_excerpt  TEXT DEFAULT '',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_logs_character_id ON session_logs(character_id);
`;

async function ensureSchema(): Promise<void> {
  const statements = CREATE_SCHEMA_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ';');
    } catch (err) {
      console.warn('[db] schema stmt skipped:', (err as Error).message);
    }
  }
}

export async function ensureDb(): Promise<void> {
  await ensureSchema();
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE characters
      SET updated_at = replace(substr(updated_at, 1, 19), ' ', 'T') || 'Z'
      WHERE typeof(updated_at) = 'text'
        AND updated_at LIKE '____-__-__ __:__:__%'
        AND updated_at NOT LIKE '%T%'
    `);
  } catch (err) {
    console.warn('[db] datetime normalize skipped:', (err as Error).message);
  }
}
