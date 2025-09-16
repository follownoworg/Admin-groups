import TelegramBot from 'node-telegram-bot-api';
import logger from '../lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID } from '../config/settings.js';
import { getBanned, addBanned, removeBanned, setBanned } from '../lib/bannedStore.js';

let bot;

export function startTelegram() {
  if (!TELEGRAM_TOKEN) {
    logger.warn('TELEGRAM_TOKEN missing; Telegram admin disabled.');
    return null;
  }
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  logger.info('🤖 Telegram bot started');

  // إرسالية QR كصورة نصية بدائية (يمكن تحسينها لاحقًا)
  bot.sendQR = async (qr) => {
    if (!TELEGRAM_ADMIN_ID) return;
    await bot.sendMessage(TELEGRAM_ADMIN_ID, 'Scan this WhatsApp QR:\n' + qr);
  };

  bot.onText(/^\/start$/, async (msg) => {
    if (String(msg.chat.id) !== String(TELEGRAM_ADMIN_ID)) return;
    bot.sendMessage(msg.chat.id, '👋 أهلاً! أوامر الإدارة:\n' +
      '/ban_add <word>\n/ban_remove <word>\n/ban_list\n/ban_set <w1,w2,...>\n/ping');
  });

  bot.onText(/^\/ping$/, (msg) => {
    if (String(msg.chat.id) !== String(TELEGRAM_ADMIN_ID)) return;
    bot.sendMessage(msg.chat.id, 'pong');
  });

  bot.onText(/^\/ban_list$/, async (msg) => {
    if (String(msg.chat.id) !== String(TELEGRAM_ADMIN_ID)) return;
    const words = await getBanned();
    bot.sendMessage(msg.chat.id, '🔒 Banned words:\n' + (words.length ? words.join('\n') : '(empty)'));
  });

  bot.onText(/^\/ban_add\s+(.+)$/i, async (msg, m) => {
    if (String(msg.chat.id) !== String(TELEGRAM_ADMIN_ID)) return;
    const word = m[1].trim();
    const words = await addBanned(word);
    bot.sendMessage(msg.chat.id, `✅ Added: "${word}"\nNow: ${words.join(', ')}`);
  });

  bot.onText(/^\/ban_remove\s+(.+)$/i, async (msg, m) => {
    if (String(msg.chat.id) !== String(TELEGRAM_ADMIN_ID)) return;
    const word = m[1].trim();
    const words = await removeBanned(word);
    bot.sendMessage(msg.chat.id, `🗑️ Removed: "${word}"\nNow: ${words.join(', ')}`);
  });

  bot.onText(/^\/ban_set\s+(.+)$/i, async (msg, m) => {
    if (String(msg.chat.id) !== String(TELEGRAM_ADMIN_ID)) return;
    const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const words = await setBanned(list);
    bot.sendMessage(msg.chat.id, `✏️ Set list to:\n${words.join('\n')}`);
  });

  return bot;
}
