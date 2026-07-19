import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import routes from './routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api', routes);

const STATIC_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '../app/static'),
    path.resolve(process.cwd(), 'app/static'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
})();

app.use('/static', express.static(STATIC_DIR));

app.use((_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

export default app;
