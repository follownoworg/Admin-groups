// src/lib/selfheal.js
// نسخة خفيفة وآمنة: لا تقوم بحذف أي شيء من التخزين، فقط تحاول طلب إعادة الإرسال
// عند فشل فك التشفير + تعمل resync خفيف إن لزم.
// إذا رغبت لاحقًا بمنطق أعمق، نطوّره هنا بدون لمس بقية الملفات.

import logger from './logger.js';

export function registerSelfHeal(sock, { messageStore } = {}) {
  // تأمين getMessage عند الإعادة
  if (typeof sock.getMessage !== 'function') {
    sock.getMessage = async (key) => {
      const id = key?.id;
      return id && messageStore?.get(id);
    };
  }

  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates || []) {
      try {
        const jid = u?.key?.remoteJid;
        if (jid === 'status@broadcast') continue;

        // إذا كان هناك retry أو أخطاء 409/410 نعمل resync بسيط
        const needsResync =
          u?.update?.retry ||
          u?.update?.status === 409 ||
          u?.update?.status === 410;

        if (needsResync) {
          try {
            await sock.resyncAppState?.(['critical_unblock_low']);
            logger.info({ jid }, 'selfheal: resync after retry/409/410');
          } catch (e) {
            logger.warn({ e }, 'selfheal: resync failed');
          }
        }

        // لو عندك sendRetryRequest متاح، اطلب إعادة إرسال الرسالة
        if (typeof sock.sendRetryRequest === 'function' && u?.key?.id) {
          try {
            await sock.sendRetryRequest(u.key);
            logger.debug?.({ key: u.key }, 'selfheal: sent retry request');
          } catch (e) {
            logger.warn({ e }, 'selfheal: sendRetryRequest failed');
          }
        }
      } catch (e) {
        logger.warn({ e, u }, 'selfheal: messages.update handler error');
      }
    }
  });
}
