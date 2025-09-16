// index.js
import { startExpress } from './src/app/express.js';
import { createWhatsApp } from './src/app/whatsapp.js';
import { onMessageUpsert } from './src/handlers/messages.js';
import { registerGroupParticipantHandler } from './src/handlers/groups.js';
import { startTelegram } from './src/app/telegram.js';
import logger from './src/lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID } from './src/config/settings.js';

// (اختياري) التقاط الأخطاء غير الملتقطة
process.on('unhandledRejection', (e) => logger.error({ e }, 'unhandledRejection'));
process.on('uncaughtException',  (e) => logger.error({ e }, 'uncaughtException'));

(async () => {
  // ابدأ HTTP (مهم لـ Render لاعتبار الخدمة "حية")
  startExpress();

  // ابدأ تيليجرام (اختياري لو ما عندك توكن)
  const telegram = (TELEGRAM_TOKEN && TELEGRAM_ADMIN_ID)
    ? startTelegram(TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID)
    : null;

  // ابدأ واتساب باستخدام تخزين Astra (عبر wa-astra-auth.js)
  const sock = await createWhatsApp({ telegram });

  // اربط الهاندلرز
  if (typeof onMessageUpsert === 'function') {
    sock.ev.on('messages.upsert', onMessageUpsert(sock));
  }
  if (typeof registerGroupParticipantHandler === 'function') {
    registerGroupParticipantHandler(sock);
  }

  logger.info('✅ Bot started (groups: moderation only; DMs: replies).');
})();
