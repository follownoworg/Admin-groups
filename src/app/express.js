import express from 'express';
import logger from '../lib/logger.js';
import { PORT } from '../config/settings.js';

export function startExpress() {
  const app = express();

  app.use((req, _res, next) => {
    logger.info({ ua: req.headers['user-agent'], path: req.path, method: req.method, ip: req.ip }, 'HTTP');
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get('/', (_req, res) => res.send('WhatsApp Bot is running.'));

  if (process.env.TRUST_PROXY) app.set('trust proxy', true);

  app.listen(PORT, '0.0.0.0', () => logger.info(`🌐 HTTP server listening on 0.0.0.0:${PORT}`));
  return app;
}
