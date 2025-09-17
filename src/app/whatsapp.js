// src/app/whatsapp.js
import { makeWASocket, fetchLatestBaileysVersion } from 'baileys';
import NodeCache from 'node-cache';
import logger from '../lib/logger.js';
import { astraAuthState } from '../lib/wa-astra-auth.js';
import { WA_PAIRING_CODE, WA_PHONE, TELEGRAM_ADMIN_ID } from '../config/settings.js';
import { registerSelfHeal } from '../lib/selfheal.js';

// مخزن رسائل بسيط (لدعم retries)
const messageStore = new Map(); // key: msg.key.id -> proto
const MAX_STORE = Number(process.env.WA_MESSAGE_STORE_MAX || 5000);

function storeMessage(msg) {
  if (!msg?.key?.id) return;
  if (messageStore.size >= MAX_STORE) {
    const firstKey = messageStore.keys().next().value;
    if (firstKey) messageStore.delete(firstKey);
  }
  messageStore.set(msg.key.id, msg);
}

export async function createWhatsApp({ telegram } = {}) {
  let state, saveCreds, resetCreds;
  const a = await astraAuthState();
  state = a.state;
  saveCreds = a.saveCreds;
  resetCreds = a.resetCreds;

  const { version } = await fetchLatestBaileysVersion();

  const msgRetryCounterCache = new NodeCache({
    stdTTL: Number(process.env.WA_RETRY_TTL || 3600),
    checkperiod: Number(process.env.WA_RETRY_CHECK || 120),
    useClones: false,
  });

  const sock = makeWASocket({
    version,
    auth: state,
    // تعطيل طباعة الـ QR دائماً
    printQRInTerminal: false,
    logger,
    emitOwnEvents: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    getMessage: async (key) => (key?.id ? messageStore.get(key.id) : undefined),
    msgRetryCounterCache,
    shouldIgnoreJid: (jid) => jid === 'status@broadcast',
  });

  // حفظ الجلسة
  sock.ev.on('creds.update', saveCreds);

  // إرسال كود الاقتران كنص إلى تيليجرام فقط
  try {
    if (WA_PAIRING_CODE && WA_PHONE && !state?.creds?.registered && telegram) {
      const code = await sock.requestPairingCode(WA_PHONE);
      await telegram.sendMessage(
        TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID,
        `🔐 رمز ربط واتساب: ${code}\nادخل الرمز في: واتساب ▶ الإعدادات ▶ الأجهزة المرتبطة ▶ ربط جهاز ▶ إدخال رمز`
      );
      logger.info({ code }, 'pairing code sent to Telegram');
    }
  } catch (e) {
    logger.warn({ e }, 'failed to request/send pairing code');
  }

  // مراقبة الاتصال + استشفاء الجلسة التالفة
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u || {};
    const reason = lastDisconnect?.error?.message || '';
    logger.info(
      { connection, lastDisconnectReason: reason },
      'WA connection.update'
    );

    // لو الجلسة تالفة (noiseKey.public undefined) — احذف creds وأنهِ البروسس
    if (/reading 'public'/.test(reason) || /noise/i.test(reason)) {
      try {
        await resetCreds?.();
        logger.warn('⚠️ Creds were corrupt. Reset done. Forcing restart...');
      } catch (e) {
        logger.warn({ e }, 'resetCreds failed');
      } finally {
        process.exit(0);
      }
    }
  });

  // تخزين الرسائل الجديدة
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages || []) {
      if (m?.key?.remoteJid === 'status@broadcast') continue;
      storeMessage(m);
    }
  });

  // retries عند فشل فك التشفير
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates || []) {
      try {
        if (u?.key?.remoteJid === 'status@broadcast') continue;
        const needsResync =
          u.update?.retry || u.update?.status === 409 || u.update?.status === 410;
        if (needsResync) {
          try {
            await sock.resyncAppState?.(['critical_unblock_low']);
          } catch (e) {
            logger.warn({ e }, 'فشل resyncAppState');
          }
        }
      } catch (e) {
        logger.warn({ e, u }, 'خطأ في messages.update');
      }
    }
  });

  // تعافٍ ذاتي بسيط
  registerSelfHeal(sock, { messageStore });

  return sock;
}
