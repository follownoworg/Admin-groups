// src/app/telegram.js
import TelegramBot from 'node-telegram-bot-api';
import logger from '../lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID } from '../config/settings.js';

let bot = null;

export function startTelegram() {
  if (!TELEGRAM_TOKEN) {
    logger.warn('TELEGRAM_TOKEN missing; Telegram admin disabled.');
    return null;
  }

  const webhookBase = process.env.PUBLIC_BASE_URL || ''; // مثال: https://admin-groups.onrender.com
  const useWebhook = Boolean(webhookBase);

  const botOpts = { polling: !useWebhook };
  const b = new TelegramBot(TELEGRAM_TOKEN, botOpts);
  bot = b;

  if (useWebhook) {
    const url = webhookBase.replace(/\/+$/, '') + `/tg/${TELEGRAM_TOKEN}`;
    b.setWebHook(url).then(() => logger.info({ url }, 'Telegram webhook set'));
  } else {
    logger.info('Telegram bot in polling mode');
  }

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
    b.sendMessage(msg.chat.id, helpText, { disable_web_page_preview: true });
  });

  bot.onText(/^\/ping$/i, (msg) => {
    if (!isAdmin(msg)) return;
    b.sendMessage(msg.chat.id, 'pong');
  });

  // إدارة قائمة الكلمات المحظورة إن كانت store موجودة في مكان آخر
  let store = null;
  try {
    store = globalThis.__bannedWordsStore; // إن وُجدت
  } catch {}

  bot.onText(/^\/ban_list$/i, (msg) => {
    if (!isAdmin(msg) || !store) return;
    store.listBanned().then(words => {
      b.sendMessage(msg.chat.id, `🚫 القائمة:\n• ${words.join('\n• ')}`);
    });
  });

  bot.onText(/^\/ban_add\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const word = m[1].trim();
    const words = await store.addBanned(word);
    b.sendMessage(msg.chat.id, `✅ أضيفت: «${word}»\nالقائمة الآن:\n• ${words.join('\n• ')}`);
  });

  bot.onText(/^\/ban_remove\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const word = m[1].trim();
    const words = await store.removeBanned(word);
    b.sendMessage(msg.chat.id, `🗑️ أزيلت: «${word}»\nالقائمة الآن:\n• ${words.join('\n• ')}`);
  });

  bot.onText(/^\/ban_set\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const words = await store.setBanned(list);
    b.sendMessage(msg.chat.id, `✏️ تم الاستبدال. القائمة الآن:\n• ${words.join('\n• ')}`);
  });

  return bot;
}
