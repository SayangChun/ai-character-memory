import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma schema requires env("DATABASE_URL"). Locally this usually comes from `.env`
 * (gitignored). On Vercel that file is not present, so we must set a default
 * *before* constructing PrismaClient.
 *
 * Serverless (Vercel) filesystem is read-only except `/tmp`, so SQLite lives there.
 * Note: `/tmp` is per-instance and ephemeral — export .memory.md / .acm.json for
 * durable storage. For shared persistent DB, set DATABASE_URL to a hosted provider
 * (Postgres / Turso / etc.).
 */
function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

/** SQLite file URLs that cannot work on read-only serverless FS */
function isEphemeralLocalSqlite(url: string): boolean {
  if (!url.startsWith('file:')) return false;
  // Allow explicit /tmp (or Windows temp) paths
  if (url.includes('/tmp/') || url.includes('\\tmp\\') || /file:.*[\\/]Temp[\\/]/i.test(url)) {
    return false;
  }
  return true;
}

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim() || '';

  if (isServerlessRuntime()) {
    // Missing URL, or a local-dev file path (e.g. file:./data/memory.db) → use /tmp
    if (!fromEnv || isEphemeralLocalSqlite(fromEnv)) {
      return 'file:/tmp/ai-character-memory.db';
    }
    return fromEnv;
  }

  if (fromEnv) return fromEnv;

  // Match common local .env: relative to prisma/ schema directory
  const dataDir = path.resolve(process.cwd(), 'prisma', 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // ignore — Prisma will surface open errors if the path is unusable
  }
  return 'file:./data/memory.db';
}

const databaseUrl = resolveDatabaseUrl();
// Keep process.env in sync so Prisma's env("DATABASE_URL") resolution succeeds
process.env.DATABASE_URL = databaseUrl;

export const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});

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
