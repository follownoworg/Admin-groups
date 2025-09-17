// src/app/telegram.js
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import logger from '../lib/logger.js';
import { TELEGRAM_TOKEN, TELEGRAM_ADMIN_ID, PUBLIC_URL } from '../config/settings.js';

let bot = null;

/**
 * Webhook: /tg-webhook/<TOKEN>
 * يتطلب تمرير app من express في index.js:  startTelegram(app)
 */
export function startTelegram(app) {
  if (!TELEGRAM_TOKEN) {
    logger.warn('TELEGRAM_TOKEN missing; Telegram admin disabled.');
    return null;
  }

  const useWebhook = Boolean(PUBLIC_URL);
  const b = new TelegramBot(TELEGRAM_TOKEN, { polling: !useWebhook });
  bot = b;

  if (useWebhook) {
    const base = PUBLIC_URL.replace(/\/+$/, '');
    const path = `/tg-webhook/${TELEGRAM_TOKEN}`;
    const url  = `${base}${path}`;

    // فك JSON لهذا المسار تحديدًا
    if (app && typeof app.post === 'function') {
      app.post(path, express.json({ limit: '2mb' }), (req, res) => {
        try {
          if (!req.body || typeof req.body !== 'object') {
            logger.warn({ bodyType: typeof req.body }, 'telegram webhook: empty/invalid body');
            return res.sendStatus(400);
          }
          b.processUpdate(req.body);
          res.sendStatus(200);
        } catch (e) {
          logger.warn({ e, body: req.body }, 'telegram processUpdate error');
          res.sendStatus(500);
        }
      });
    }

    b.setWebHook(url, { drop_pending_updates: true })
      .then(() => logger.info({ url }, 'Telegram webhook set'));
  } else {
    logger.info('Telegram bot in polling mode');
  }

  // ——— أوامر الإدارة ———
  const helpText =
`👋 أهلاً! أوامر الإدارة:
• /help — هذه القائمة
• /ping — فحص عمل البوت
• /ban_list — عرض الكلمات المحظورة
• /ban_add <كلمة>
• /ban_remove <كلمة>
• /ban_set ك1,ك2,ك3`;

  const isAdmin = (msg) => String(msg.chat?.id) === String(TELEGRAM_ADMIN_ID);

  b.onText(/^\/start|\/help$/i, (msg) => {
    if (!isAdmin(msg)) return;
    b.sendMessage(msg.chat.id, helpText, { disable_web_page_preview: true });
  });

  b.onText(/^\/ping$/i, (msg) => {
    if (!isAdmin(msg)) return;
    b.sendMessage(msg.chat.id, 'pong');
  });

  // أوامر محظورات اختيارية إن وُجد store خارجي
  let store = null;
  try { store = globalThis.__bannedWordsStore; } catch {}

  b.onText(/^\/ban_list$/i, async (msg) => {
    if (!isAdmin(msg) || !store) return;
    const words = await store.listBanned();
    b.sendMessage(msg.chat.id, words?.length ? `🚫 القائمة:\n• ${words.join('\n• ')}` : '🚫 القائمة فارغة.');
  });

  b.onText(/^\/ban_add\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const word = m[1].trim();
    const words = await store.addBanned(word);
    b.sendMessage(msg.chat.id, `✅ أضيفت: «${word}»\nالقائمة الآن:\n• ${words.join('\n• ')}`);
  });

  b.onText(/^\/ban_remove\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const word = m[1].trim();
    const words = await store.removeBanned(word);
    b.sendMessage(msg.chat.id, `🗑️ أزيلت: «${word}»\nالقائمة الآن:\n• ${words.join('\n• ')}`);
  });

  b.onText(/^\/ban_set\s+(.+)$/i, async (msg, m) => {
    if (!isAdmin(msg) || !store) return;
    const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const words = await store.setBanned(list);
    b.sendMessage(msg.chat.id, `✏️ تم الاستبدال. القائمة الآن:\n• ${words.join('\n• ')}`);
  });

  // مسار فحص سريع يدوي (اختياري): GET /tg-test
  if (app && typeof app.get === 'function') {
    app.get('/tg-test', async (_req, res) => {
      try {
        await b.sendMessage(TELEGRAM_ADMIN_ID, '✅ Webhook OK');
        res.json({ ok: true });
      } catch (e) {
        logger.warn({ e }, 'tg-test failed');
        res.status(500).json({ ok: false });
      }
    });
  }

  return b;
}
