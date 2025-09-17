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
  const { state, saveCreds, resetCreds } = await astraAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const msgRetryCounterCache = new NodeCache({
    stdTTL: Number(process.env.WA_RETRY_TTL || 3600),
    checkperiod: Number(process.env.WA_RETRY_CHECK || 120),
    useClones: false,
  });

  const sock = makeWASocket({
    version,
    auth: state,
    // لا نطبع QR أبداً. نستخدم pairing code نصي فقط.
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

  // ——— طلب كود الاقتران بعد فتح الاتصال ———
  let pairingSent = false;
  async function sendPairingCodeWithRetry() {
    if (pairingSent) return;
    if (!WA_PAIRING_CODE || !WA_PHONE || state?.creds?.registered) return;
    if (!telegram || !(TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID)) return;

    const phone = String(WA_PHONE).replace(/[^0-9]/g, '');
    const tries = Number(process.env.WA_PAIRING_RETRIES || 3);
    const waitMs = Number(process.env.WA_PAIRING_RETRY_DELAY_MS || 1500);

    for (let i = 1; i <= tries; i++) {
      try {
        const code = await sock.requestPairingCode(phone);
        await telegram.sendMessage(
          TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID,
          `🔐 رمز ربط واتساب: ${code}\nادخل الرمز في: واتساب ▶ الإعدادات ▶ الأجهزة المرتبطة ▶ ربط جهاز ▶ إدخال رمز`
        );
        logger.info({ code }, 'pairing code sent to Telegram');
        pairingSent = true;
        return;
      } catch (e) {
        const msg = e?.output?.payload?.message || e?.message || String(e);
        logger.warn({ attempt: i, e: e?.output || e }, 'requestPairingCode failed');
        // 428 = Connection Closed -> انتظر ثم أعد المحاولة بعد فتح القناة
        if (String(msg).includes('Connection Closed') || e?.output?.statusCode === 428) {
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        // أخطاء أخرى لا نكرر عليها كثيراً
        if (i === tries) throw e;
      }
    }
  }

  // مراقبة الاتصال + معالجة الجلسة التالفة
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u || {};
    const reason = lastDisconnect?.error?.message || '';
    logger.info({ connection, lastDisconnectReason: reason }, 'WA connection.update');

    // عند فتح الاتصال لأول مرة نرسل كود الاقتران
    if (connection === 'open') {
      try { await sendPairingCodeWithRetry(); } catch (e) {
        logger.warn({ e }, 'failed to send pairing code after open');
      }
    }

    // جلسة تالفة
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
