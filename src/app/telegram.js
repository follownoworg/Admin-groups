// src/app/telegram.js
import TelegramBot from 'node-telegram-bot-api';
import qrcode from 'qrcode';
import logger from '../lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID } from '../config/settings.js';
import { getBanned, addBanned, removeBanned, setBanned } from '../lib/bannedStore.js';

let bot;

export function startTelegram() {
  if (!TELEGRAM_TOKEN) {
    logger.warn('⚠️ TELEGRAM_TOKEN مفقود؛ تيليجرام معطّل.');
    return null;
  }

  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  logger.info('🤖 Telegram bot started');

  // ✅ إرسال QR كصورة
  bot.sendQR = async (qrText) => {
    if (!TELEGRAM_ADMIN_ID) return;
    try {
      const png = await qrcode.toBuffer(qrText, {
        type: 'png',
        margin: 1,
        scale: 6,
        errorCorrectionLevel: 'M',
      });
      await bot.sendPhoto(TELEGRAM_ADMIN_ID, png, { caption: '📲 امسح هذا الرمز لربط واتساب' });
    } catch (e) {
      logger.warn({ e }, 'فشل توليد/إرسال صورة QR — fallback إلى النص');
      await bot.sendMessage(TELEGRAM_ADMIN_ID, '📲 امسح هذا الكود لربط واتساب:\n\n' + qrText);
    }
  };

  // 📌 رسالة أوامر واضحة
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

  bot.onText(/^\/ban_list$/, async (msg) => {
    if (!onlyAdmin(msg)) return;
    const words = await getBanned();
    bot.sendMessage(
      msg.chat.id,
      words.length
        ? '🔒 الكلمات المحظورة:\n' + words.map((w, i) => `${i + 1}. ${w}`).join('\n')
        : '📭 لا توجد كلمات محظورة حالياً.'
    );
  });

  bot.onText(/^\/ban_add\s+(.+)$/i, async (msg, match) => {
    if (!onlyAdmin(msg)) return;
    const word = match[1].trim();
    const words = await addBanned(word);
    bot.sendMessage(msg.chat.id, `✅ تمت إضافة: «${word}»\n📌 القائمة الآن:\n${words.join(', ')}`);
  });

  bot.onText(/^\/ban_remove\s+(.+)$/i, async (msg, match) => {
    if (!onlyAdmin(msg)) return;
    const word = match[1].trim();
    const words = await removeBanned(word);
    bot.sendMessage(msg.chat.id, `🗑️ تمت إزالة: «${word}»\n📌 القائمة الآن:\n${words.join(', ')}`);
  });

  bot.onText(/^\/ban_set\s+(.+)$/i, async (msg, match) => {
    if (!onlyAdmin(msg)) return;
    const list = match[1].split(',').map(s => s.trim()).filter(Boolean);
    const words = await setBanned(list);
    bot.sendMessage(msg.chat.id, `✏️ تم تحديث القائمة:\n${words.join('\n')}`);
  });

  return bot;
}
