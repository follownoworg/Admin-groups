// src/app/telegram.js
import TelegramBot from 'node-telegram-bot-api';
import qrcode from 'qrcode';
import logger from '../lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID, PUBLIC_URL } from '../config/settings.js';
import express from 'express';

let bot;

export function startTelegram(appInstance) {
  if (!TELEGRAM_TOKEN) {
    logger.warn('⚠️ TELEGRAM_TOKEN مفقود؛ تيليجرام معطّل.');
    return null;
  }

  // إذا عندنا URL عام (Render)، نستخدم Webhook لتجنب 409
  const useWebhook = Boolean(PUBLIC_URL);

  if (useWebhook) {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
    const route = `/tg-webhook/${TELEGRAM_TOKEN}`;
    bot.setWebHook(`${PUBLIC_URL.replace(/\/+$/, '')}${route}`)
      .then(() => logger.info({ url: `${PUBLIC_URL}${route}` }, '✅ Telegram webhook set'))
      .catch((e) => logger.error({ e }, '❌ setWebHook failed'));

    // تأكد أن Express يقرأ JSON
    appInstance.use(express.json({ limit: '2mb' }));
    appInstance.post(route, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });
  } else {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    logger.info('ℹ️ Telegram polling mode (PUBLIC_URL not set)');
  }

  logger.info('🤖 Telegram bot started');

  // helper لإرسال QR كصورة
  bot.sendQR = async (qrText) => {
    if (!TELEGRAM_ADMIN_ID) return;
    try {
      const png = await qrcode.toBuffer(qrText, { type: 'png', margin: 1, scale: 6, errorCorrectionLevel: 'M' });
      await bot.sendPhoto(TELEGRAM_ADMIN_ID, png, { caption: '📲 امسح هذا الرمز لربط واتساب' });
    } catch (e) {
      logger.warn({ e }, 'فشل إرسال QR كصورة — fallback إلى النص');
      await bot.sendMessage(TELEGRAM_ADMIN_ID, '📲 امسح هذا الكود لربط واتساب:\n\n' + qrText);
    }
  };

  // رسالة مساعدة واضحة
  const HELP = [
    '👋 أهلاً بك! أوامر الإدارة:',
    '',
    '🔹 /ban_add <كلمة> — إضافة كلمة للقائمة المحظورة',
    '🔹 /ban_remove <كلمة> — إزالة كلمة من القائمة',
    '🔹 /ban_list — عرض الكلمات المحظورة',
    '🔹 /ban_set كلمة1,كلمة2,... — استبدال القائمة كاملة',
    '🔹 /ping — اختبار عمل البوت',
  ].join('\n');

  const onlyAdmin = (msg) => String(msg.chat.id) === String(TELEGRAM_ADMIN_ID);

  bot.onText(/^\/start$|^\/help$/i, (msg) => {
    if (!onlyAdmin(msg)) return;
    bot.sendMessage(msg.chat.id, HELP, { disable_web_page_preview: true });
  });

  bot.onText(/^\/ping$/, (msg) => {
    if (!onlyAdmin(msg)) return;
    bot.sendMessage(msg.chat.id, '✅ البوت يعمل بشكل سليم (pong)');
  });

  // إن كانت عندك دوال bannedStore شغالة، أبقها:
  // /ban_list, /ban_add, /ban_remove, /ban_set …

  return bot;
}
