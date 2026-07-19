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

// HTML 引用 /static/style.css、/static/app.js，必须挂在 /static 前缀下
// （若挂在 /，请求会变成找 app/static/static/*，最终被 SPA 回退成 index.html，
//  Vercel 上就会出现“只有文字、没有样式/背景”）
const STATIC_DIR = path.resolve(__dirname, '../app/static');
app.use('/static', express.static(STATIC_DIR, {
  fallthrough: false,
  index: false,
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.use((_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

export default app;
