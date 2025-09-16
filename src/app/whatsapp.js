// src/app/whatsapp.js
import { makeWASocket, fetchLatestBaileysVersion } from 'baileys'; // ✅ هكذا، NOT default
import NodeCache from 'node-cache';
import qrcode from 'qrcode';
import logger from '../lib/logger.js';
import { astraAuthState } from '../lib/wa-astra-auth.js';
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
  // تهيئة الحالة (Astra)
  let state, saveCreds;
  try {
    const a = await astraAuthState();
    state = a.state;
    saveCreds = a.saveCreds;
  } catch (e) {
    logger.error(
      {
        e: e instanceof Error ? { message: e.message, stack: e.stack } : e,
        ASTRA_DB_API_ENDPOINT: process.env.ASTRA_DB_API_ENDPOINT,
        ASTRA_DB_KEYSPACE: process.env.ASTRA_DB_KEYSPACE,
        hasToken: Boolean(process.env.ASTRA_DB_APPLICATION_TOKEN),
      },
      '❌ Astra init failed. تأكد من ASTRA_DB_API_ENDPOINT / ASTRA_DB_APPLICATION_TOKEN / ASTRA_DB_KEYSPACE'
    );
    throw e;
  }

  const { version } = await fetchLatestBaileysVersion();

  const msgRetryCounterCache = new NodeCache({
    stdTTL: Number(process.env.WA_RETRY_TTL || 3600),
    checkperiod: Number(process.env.WA_RETRY_CHECK || 120),
    useClones: false,
  });

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !telegram, // لو ما فيه تيليجرام يطبع QR في اللوغ
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

  // --- إرسال QR لتيليجرام كصورة مع حماية من التكرار ---
  let lastQr = '';
  let lastQrTs = 0;
  const QR_DEBOUNCE_MS = 10_000; // لا نرسل أكثر من مرّة كل 10 ثواني

  async function sendQrToTelegram(qr) {
    if (!qr) return;
    const now = Date.now();
    if (qr === lastQr && now - lastQrTs < QR_DEBOUNCE_MS) {
      return; // نفس الكود أُرسل للتو
    }
    lastQr = qr;
    lastQrTs = now;

    try {
      // لو تيليجرام يوفّر sendQR، استخدمه
      if (telegram?.sendQR) {
        await telegram.sendQR(qr);
        logger.info('QR sent to Telegram via telegram.sendQR');
        return;
      }
    } catch (e) {
      logger.warn({ e }, 'telegram.sendQR failed, will fallback to local PNG');
    }

    // توليد صورة PNG داخليًا وإرسالها مباشرة
    try {
      const png = await qrcode.toBuffer(qr, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 6,
        width: 512,
      });
      await telegram?.sendPhoto?.(
        process.env.TELEGRAM_ADMIN_ID,
        png,
        { caption: '📲 امسح هذا الرمز لربط واتساب' }
      );
      logger.info('QR PNG sent to Telegram (fallback path)');
    } catch (e) {
      logger.warn({ e }, 'فشل إرسال QR كصورة إلى تيليجرام — سنحاول كنص');
      try {
        await telegram?.sendMessage?.(
          process.env.TELEGRAM_ADMIN_ID,
          '📲 امسح هذا الكود لربط واتساب:\n\n' + qr
        );
        logger.info('QR TEXT sent to Telegram (fallback of fallback)');
      } catch (e2) {
        logger.error({ e2 }, 'فشل إرسال QR نصاً أيضاً');
      }
    }
  }

  // مراقبة الاتصال + إرسال QR
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u || {};
    logger.info(
      { connection, lastDisconnectReason: lastDisconnect?.error?.message, hasQR: Boolean(qr) },
      'WA connection.update'
    );

    if (qr && telegram) {
      await sendQrToTelegram(qr);
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
