// index.js
import { startExpress } from './src/app/express.js';
import { createWhatsApp } from './src/app/whatsapp.js';
import { onMessageUpsert } from './src/handlers/messages.js';
import { registerGroupParticipantHandler } from './src/handlers/groups.js';
import { startTelegram } from './src/app/telegram.js';
import logger from './src/lib/logger.js';

process.on('unhandledRejection', (e) => logger.error({ e }, 'unhandledRejection'));
process.on('uncaughtException',  (e) => logger.error({ e }, 'uncaughtException'));

(async () => {
  const app = startExpress();                  // ⬅️ خذ instance من Express
  const telegram = startTelegram(app);         // ⬅️ مرّر app للـ webhook

  const sock = await createWhatsApp({ telegram });

  if (typeof onMessageUpsert === 'function') {
    sock.ev.on('messages.upsert', onMessageUpsert(sock));
  }
  if (typeof registerGroupParticipantHandler === 'function') {
    registerGroupParticipantHandler(sock);
  }

  logger.info('✅ Bot started (groups: moderation only; DMs: replies).');
})();
