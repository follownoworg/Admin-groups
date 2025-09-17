// src/app/whatsapp.js
import { makeWASocket, fetchLatestBaileysVersion } from 'baileys';
import NodeCache from 'node-cache';
import logger from '../lib/logger.js';
import { astraAuthState } from '../lib/wa-astra-auth.js';
import { WA_PAIRING_CODE, WA_PHONE, TELEGRAM_ADMIN_ID } from '../config/settings.js';
import { registerSelfHeal } from '../lib/selfheal.js';

// ——— مخزن رسائل بسيط (لدعم retries) ———
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

// ——— قفل منع التكرار والتوازي ———
let pairingSent = false;       // تم إرسال كود صالح
let pairingInFlight = false;   // طلب جارٍ الآن
let cooledDownUntil = 0;       // منع إعادة الطلب قبل انتهاء التبريد (ms)

// ——— دالة إرسال الكود: طلب واحد فقط بعد OPEN مع تبريد ———
async function sendPairingCodeOnce(sock, telegram, state) {
  const now = Date.now();
  if (pairingSent || pairingInFlight || now < cooledDownUntil) return;

  if (String(process.env.WA_PAIRING_CODE || (WA_PAIRING_CODE ? '1' : '0')) !== '1') return;
  const adminId = TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID;
  if (!adminId) { logger.warn('pairing: no TELEGRAM_ADMIN_ID'); return; }
  if (state?.creds?.registered) { logger.info('pairing: already registered, skip'); return; }

  const phone = String(WA_PHONE || '').replace(/\D/g, '');
  if (!phone) { logger.warn('pairing: WA_PHONE missing'); return; }

  pairingInFlight = true;
  try {
    logger.info({ phone }, 'requesting pairing code');
    const code = await sock.requestPairingCode(phone);

    await telegram?.sendMessage?.(
      adminId,
      `🔐 رمز ربط واتساب: ${code}\nادخل الرمز في: الإعدادات ▶ الأجهزة المرتبطة ▶ ربط جهاز ▶ إدخال رمز`
    );

    pairingSent = true;
    // إبقاء العملية حيّة قليلًا حتى تُدخِل الرمز
    setTimeout(() => {}, 120_000);
    logger.info({ code }, 'pairing code sent to Telegram');
  } catch (e) {
    const status = e?.output?.statusCode;
    const msg = e?.output?.payload?.message || e?.message || String(e);
    logger.warn({ status, msg }, 'requestPairingCode failed');
    // 428/Connection Closed → تبريد قصير ثم محاولة لاحقة واحدة فقط عند open التالي
    if (status === 428 || /Connection Closed/i.test(msg)) {
      cooledDownUntil = Date.now() + Number(process.env.WA_PAIRING_RETRY_DELAY_MS || 3000);
    } else {
      cooledDownUntil = Date.now() + 15000;
    }
  } finally {
    pairingInFlight = false;
  }
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
    printQRInTerminal: false, // لا QR مطلقًا
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

  // مراقبة الاتصال
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, node } = u || {};
    const reason = lastDisconnect?.error?.message || '';
    logger.info({ connection, lastDisconnectReason: reason }, 'WA connection.update');

    // تحقّق صارم من تطابق الرقم القادم من السيرفر إن توفر
    if (node?.username && WA_PHONE && String(node.username) !== String(WA_PHONE)) {
      logger.warn({ seen: node.username, expected: WA_PHONE }, 'phone mismatch -> skip pairing');
      return;
    }

    // أرسل الكود مرة واحدة فقط بعد أول OPEN (لا نحاول في connecting)
    if (connection === 'open') {
      await sendPairingCodeOnce(sock, telegram, state);
    }

    // جلسة تالفة؟ صفّر وأعد التشغيل
    if (/reading 'public'/.test(reason) || /noise/i.test(reason)) {
      try { await resetCreds?.(); logger.warn('⚠️ Creds corrupt. Reset. Restarting...'); }
      catch (e) { logger.warn({ e }, 'resetCreds failed'); }
      finally { process.exit(0); }
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
          try { await sock.resyncAppState?.(['critical_unblock_low']); }
          catch (e) { logger.warn({ e }, 'فشل resyncAppState'); }
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
