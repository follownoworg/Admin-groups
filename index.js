import { startExpress } from './src/app/express.js';
import { startWhatsApp } from './src/app/whatsapp.js';
import { onMessageUpsert } from './src/handlers/messages.js';
import { registerGroupParticipantHandler } from './src/handlers/groups.js';
import { startTelegram } from './src/app/telegram.js';
import { acquireLock, releaseLock } from './src/lib/leader-lock.js';
import logger from './src/lib/logger.js';

(async () => {
  // 1) HTTP server (Render يحب يشوف منفذ مبكرًا)
  startExpress();

  // 2) Leader Lock (يمنع أكثر من نسخة)
  const HOLDER = process.env.RENDER_INSTANCE_ID || process.pid.toString();
  const ok = await acquireLock('whatsapp-bot-leader', HOLDER, 60);
  if (!ok) {
    logger.warn('Another instance holds the lock. Exiting.');
    process.exit(0);
    return;
  }
  const renew = setInterval(async () => {
    const renewed = await acquireLock('whatsapp-bot-leader', HOLDER, 60);
    if (!renewed) {
      logger.error('Lost leadership lock, exiting.');
      process.exit(1);
    }
  }, 45_000).unref?.();

  // 3) Telegram
  const telegram = startTelegram();

  // 4) WhatsApp
  const sock = await startWhatsApp({ telegram });

  // 5) Handlers
  sock.ev.on('messages.upsert', onMessageUpsert(sock));
  registerGroupParticipantHandler(sock);

  logger.info('✅ Bot started (clean, Astra only).');

  // 6) shutdown
  const shutdown = () => {
    clearInterval(renew);
    releaseLock('whatsapp-bot-leader', HOLDER).finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
})();
