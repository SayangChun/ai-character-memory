import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { ensureDb } from './db';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let dbReady = false;

ensureDb()
  .then(() => { dbReady = true; console.log('[app] DB ready'); })
  .catch(err => { console.error('[app] DB init error:', err.message); dbReady = true; });

app.use((_req, res, next) => {
  if (dbReady) return next();
  ensureDb()
    .then(() => { dbReady = true; next(); })
    .catch(err => { dbReady = true; res.status(500).json({ detail: err.message }); });
});

app.use('/api', routes);

const STATIC_DIR = path.resolve(__dirname, '../app/static');
app.use('/', express.static(STATIC_DIR));

app.use((_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

export default app;
