const { ensureDb } = require('../dist/db');
const appModule = require('../dist/app');
const app = appModule.default || appModule;

// Initialize DB before handling any request
const initPromise = ensureDb().catch(err => {
  console.error('[api] DB init failed:', err.message);
});

// Block all requests until DB is initialized
app.use((req, res, next) => {
  initPromise.then(() => next()).catch(() => next());
});

module.exports = app;
