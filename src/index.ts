import app from './app';
import { ensureDb } from './db';

const PORT = parseInt(process.env.PORT || process.env.MEMORY_PORT || '8765', 10);
const HOST = process.env.HOST || process.env.MEMORY_HOST || '127.0.0.1';

async function main() {
  await ensureDb();
  app.listen(PORT, HOST, () => {
    console.log('='.repeat(54));
    console.log('  AI 角色记忆站 · 本地可移植包');
    console.log(`  本机访问: http://${HOST}:${PORT}`);
    console.log('='.repeat(54));
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
