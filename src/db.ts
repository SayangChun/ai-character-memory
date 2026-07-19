import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export const prisma = new PrismaClient();

function schemaPush(): boolean {
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 30000,
    });
    console.log('[db] schema push succeeded');
    return true;
  } catch (err) {
    console.warn('[db] schema push failed:', (err as Error).message);
    return false;
  }
}

function tryCopySchemaBase(dbPath: string): boolean {
  const candidates = [
    path.resolve(process.cwd(), 'dist', 'schema-base.db'),
    path.resolve(process.cwd(), 'prisma', 'schema-base.db'),
  ];
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, dbPath);
      console.log('[db] initialized from →', src);
      return true;
    }
  }
  console.warn('[db] schema-base.db not found (checked:', candidates.join(', '), ')');
  return false;
}

function initializeDbIfNeeded(): void {
  const url = process.env.DATABASE_URL || 'file:./data/memory.db';
  const match = url.match(/^file:(.+)$/);
  if (!match) return;

  let dbPath = match[1];
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }

  if (fs.existsSync(dbPath)) {
    console.log('[db] database already exists at', dbPath);
    return;
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (tryCopySchemaBase(dbPath)) return;

  console.log('[db] no schema-base.db available, Prisma will create empty DB');
}

export async function ensureDb(): Promise<void> {
  initializeDbIfNeeded();
  try {
    await prisma.$executeRawUnsafe('SELECT 1 FROM characters LIMIT 1');
    console.log('[db] database ready (tables exist)');
  } catch {
    console.log('[db] tables missing, running schema push...');
    schemaPush();
  }
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
