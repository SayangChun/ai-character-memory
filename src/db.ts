import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export const prisma = new PrismaClient();

function pushSchema(): boolean {
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 30000,
    });
    return true;
  } catch (err) {
    console.warn('[db] schema push failed:', (err as Error).message);
    return false;
  }
}

function copySchemaBase(dbPath: string): boolean {
  const schemaBase = path.resolve(process.cwd(), 'prisma', 'schema-base.db');
  if (!fs.existsSync(schemaBase)) {
    console.warn('[db] schema-base.db not found at', schemaBase);
    return false;
  }
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(schemaBase, dbPath);
  console.log('[db] database initialized from schema-base.db →', dbPath);
  return true;
}

function initializeDbIfNeeded(): void {
  const url = process.env.DATABASE_URL || 'file:./data/memory.db';
  const match = url.match(/^file:(.+)$/);
  if (!match) return;

  let dbPath = match[1];
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }

  if (fs.existsSync(dbPath)) return;

  if (copySchemaBase(dbPath)) return;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function normalizeTableDatetimes(table: string, columns: string[]) {
  for (const col of columns) {
    await prisma.$executeRawUnsafe(`
      UPDATE ${table}
      SET ${col} = replace(substr(${col}, 1, 19), ' ', 'T') || 'Z'
      WHERE typeof(${col}) = 'text'
        AND ${col} LIKE '____-__-__ __:__:__%'
        AND ${col} NOT LIKE '%T%'
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE ${table}
      SET ${col} = substr(${col}, 1, 19) || 'Z'
      WHERE typeof(${col}) = 'text'
        AND ${col} LIKE '____-__-__T__:__:__%'
        AND ${col} NOT LIKE '%Z'
        AND ${col} NOT LIKE '%+%'
    `);
  }
}

export async function ensureDb(): Promise<void> {
  initializeDbIfNeeded();
  pushSchema();
  try {
    await normalizeTableDatetimes('characters', ['created_at', 'updated_at']);
    await normalizeTableDatetimes('memories', [
      'created_at',
      'updated_at',
      'occurred_at',
      'expires_at',
    ]);
    await normalizeTableDatetimes('session_logs', ['created_at']);
  } catch (err) {
    console.warn('[db] datetime normalize skipped:', (err as Error).message);
  }
}
