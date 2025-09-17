// src/app/telegram.js
import TelegramBot from 'node-telegram-bot-api';
import logger from '../lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID } from '../config/settings.js';
import QRCode from 'qrcode';

let bot = null;

export function startTelegram() {
  if (!TELEGRAM_TOKEN) {
    logger.warn('TELEGRAM_TOKEN missing; Telegram admin disabled.');
    return null;
  }

  const webhookBase = process.env.PUBLIC_BASE_URL || ''; // مثال: https://admin-groups.onrender.com
  const useWebhook = Boolean(webhookBase);

  if (useWebhook) {
    // Webhook mode
    bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: { port: 0 } });
    const url = `${webhookBase.replace(/\/+$/, '')}/tg-webhook/${TELEGRAM_TOKEN}`;
    bot.setWebHook(url).then(() => {
      logger.info({ url }, '✅ Telegram webhook set');
    }).catch((e) => logger.warn({ e }, 'setWebHook failed'));
  } else {
    // Polling mode (للاستعمال محليًا)
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    logger.info('🤖 Telegram bot started (polling)');
  }

  // helper: إرسال QR كصورة PNG
  bot.sendQR = async (qrText) => {
    try {
      if (!TELEGRAM_ADMIN_ID) return;
      const png = await QRCode.toBuffer(qrText, { errorCorrectionLevel: 'M', margin: 1, width: 512 });
      await bot.sendPhoto(TELEGRAM_ADMIN_ID, png, { caption: '📲 امسح هذا الكود لربط واتساب.' });
    } catch (e) {
      logger.warn({ e }, 'sendQR failed, fallback to text');
      try {
        await bot.sendMessage(TELEGRAM_ADMIN_ID, 'Scan this WhatsApp QR:\n' + qrText);
      } catch (e2) {
        logger.warn({ e2 }, 'sendMessage fallback failed');
      }
    }
  };

  // أوامر أوضح
  const helpText =
`👋 أهلاً! قائمة أوامر الإدارة:
• /help — عرض هذه القائمة
• /ping — فحص عمل البوت
• /ban_add كلمة — إضافة كلمة محظورة
• /ban_remove كلمة — إزالة كلمة محظورة
• /ban_list — عرض الكلمات المحظورة
• /ban_set ك1,ك2,ك3 — استبدال القائمة كاملة`;

  const isAdmin = (msg) => String(msg.chat?.id) === String(TELEGRAM_ADMIN_ID);

  bot.onText(/^\/start|\/help$/i, (msg) => {
    if (!isAdmin(msg)) return;
    bot.sendMessage(msg.chat.id, helpText);
  });

  bot.onText(/^\/ping$/i, (msg) => {
    if (!isAdmin(msg)) return;
    bot.sendMessage(msg.chat.id, 'pong ✅');
  });

  // سيتم حقن store لاحقًا عبر setBannedStore
  let store = null;
  bot.setBannedStore = (s) => { store = s; };

  bot.onText(/^\/ban_list$/i, async (msg) => {
    if (!isAdmin(msg) || !store) return;
    const words = await store.getBanned();
    bot.sendMessage(msg.chat.id, words.length ? '🔒 الكلمات المحظورة:\n• ' + words.join('\n• ') : 'لا توجد كلمات محظورة.');
  });

  bot.onText(/^\/ban_add\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const word = m[1].trim();
    const words = await store.addBanned(word);
    bot.sendMessage(msg.chat.id, `✅ أضيفت: «${word}»\nالقائمة الآن:\n• ${words.join('\n• ')}`);
  });

  bot.onText(/^\/ban_remove\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const word = m[1].trim();
    const words = await store.removeBanned(word);
    bot.sendMessage(msg.chat.id, `🗑️ أزيلت: «${word}»\nالقائمة الآن:\n• ${words.join('\n• ')}`);
  });

  bot.onText(/^\/ban_set\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const words = await store.setBanned(list);
    bot.sendMessage(msg.chat.id, `✏️ تم الاستبدال. القائمة الآن:\n• ${words.join('\n• ')}`);
  });

  return bot;
}
