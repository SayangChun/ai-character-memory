const { ensureDb } = require('../dist/db');
const appModule = require('../dist/app');
const app = appModule.default || appModule;

// Graceful DB init — start immediately but don't block
let dbReady = false;
ensureDb().then(() => { dbReady = true; }).catch(() => { dbReady = true; });

// Middleware to wait for DB initialization
app.use((req, res, next) => {
  if (dbReady) return next();
  ensureDb().then(() => { dbReady = true; next(); }).catch(() => { dbReady = true; next(); });
});

module.exports = app;
