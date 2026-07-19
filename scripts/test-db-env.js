/**
 * Quick smoke test for DATABASE_URL resolution.
 * Usage:
 *   node scripts/test-db-env.js vercel
 *   node scripts/test-db-env.js local
 */
const mode = process.argv[2] || 'vercel';

if (mode === 'vercel') {
  delete process.env.DATABASE_URL;
  process.env.VERCEL = '1';
  process.env.VERCEL_ENV = 'production';
  console.log('[test] mode=vercel (no DATABASE_URL)');
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./data/memory.db';
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  console.log('[test] mode=local DATABASE_URL=', process.env.DATABASE_URL);
}

// Require after env is set so module init sees it
const { prisma, ensureDb } = require('../dist/db');

console.log('[test] resolved DATABASE_URL=', process.env.DATABASE_URL);

ensureDb()
  .then(async () => {
    const rows = await prisma.character.findMany({ take: 5 });
    console.log('[test] findMany OK, rows=', rows.length);
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[test] FAIL:', err.message);
    try {
      await prisma.$disconnect();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
