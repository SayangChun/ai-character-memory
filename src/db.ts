import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Normalize legacy datetime text (e.g. from SQLAlchemy: "2026-07-18 06:39:59.862571")
 * into ISO-8601 that Prisma's SQLite engine can parse.
 * Without this, findMany on characters/memories fails with:
 * "Inconsistent column data: Conversion failed: input contains invalid characters"
 */
async function normalizeTableDatetimes(table: string, columns: string[]) {
  for (const col of columns) {
    // Space-separated local-style timestamps → ISO with T and Z
    await prisma.$executeRawUnsafe(`
      UPDATE ${table}
      SET ${col} = replace(substr(${col}, 1, 19), ' ', 'T') || 'Z'
      WHERE typeof(${col}) = 'text'
        AND ${col} LIKE '____-__-__ __:__:__%'
        AND ${col} NOT LIKE '%T%'
    `);
    // ISO without timezone suffix
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
