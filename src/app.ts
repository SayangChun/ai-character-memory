import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api', routes);

const STATIC_DIR = path.resolve(__dirname, '../app/static');
app.use('/', express.static(STATIC_DIR));

app.use((_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

export default app;
