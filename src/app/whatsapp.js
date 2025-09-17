// src/app/whatsapp.js
import { makeWASocket, fetchLatestBaileysVersion } from 'baileys';
import NodeCache from 'node-cache';
import logger from '../lib/logger.js';
import { astraAuthState } from '../lib/wa-astra-auth.js';
import { WA_PAIRING_CODE, WA_PHONE, TELEGRAM_ADMIN_ID } from '../config/settings.js';
import { registerSelfHeal } from '../lib/selfheal.js';

const messageStore = new Map();
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

  sock.ev.on('creds.update', saveCreds);

  // ===== منع التوازي والتكرار =====
  let pairingSent = false;      // أُرسِل كود بنجاح
  let pairingInFlight = false;  // طلب جارٍ الآن
  let triedAfterOpen = false;   // لا نعيد بعد أول open

  async function sendPairingCodeOnceAfterOpen() {
    if (pairingSent || pairingInFlight) return;
    if (!WA_PAIRING_CODE) { logger.info('pairing: WA_PAIRING_CODE=0, skip'); return; }
    if (!WA_PHONE)       { logger.warn('pairing: WA_PHONE missing'); return; }
    if (state?.creds?.registered) { logger.info('pairing: already registered, skip'); return; }
    if (!telegram || !(TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID)) { logger.warn('pairing: no telegram admin'); return; }

    pairingInFlight = true;
    const phone = String(WA_PHONE).replace(/[^0-9]/g, '');
    try {
      const code = await sock.requestPairingCode(phone); // يجب أن تُستدعى بعد open
      await telegram.sendMessage(
        TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID,
        `🔐 رمز ربط واتساب: ${code}\nادخل الرمز في: واتساب ▶ الإعدادات ▶ الأجهزة المرتبطة ▶ ربط جهاز ▶ إدخال رمز`
      );
      logger.info({ code }, 'pairing code sent to Telegram');
      pairingSent = true; // أي طلب لاحق يُمنع
    } catch (e) {
      const status = e?.output?.statusCode;
      const msg = e?.output?.payload?.message || e?.message || String(e);
      logger.warn({ status, msg }, 'requestPairingCode failed after open');
      // محاولة احتياطية واحدة بعد 2s فقط إذا لم يُرسل شيء
      if (!pairingSent && !triedAfterOpen) {
        triedAfterOpen = true;
        setTimeout(() => {
          pairingInFlight = false;
          sendPairingCodeOnceAfterOpen().catch(()=>{});
        }, Number(process.env.WA_PAIRING_RETRY_DELAY_MS || 2000));
        return;
      }
    } finally {
      pairingInFlight = false;
    }
  }

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u || {};
    const reason = lastDisconnect?.error?.message || '';
    logger.info({ connection, lastDisconnectReason: reason }, 'WA connection.update');

    // أرسل الكود مرة واحدة فقط بعد أول open
    if (connection === 'open' && !pairingSent && !triedAfterOpen) {
      triedAfterOpen = true; // امنع استدعاءً ثانياً من أي open لاحق
      sendPairingCodeOnceAfterOpen().catch(e => logger.warn({ e }, 'pairing send after open failed'));
    }

    // جلسة تالفة؟ صفّر وأعد التشغيل
    if (/reading 'public'/.test(reason) || /noise/i.test(reason)) {
      try { await resetCreds?.(); logger.warn('⚠️ Creds corrupt. Reset. Restarting...'); }
      catch (e) { logger.warn({ e }, 'resetCreds failed'); }
      finally { process.exit(0); }
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages || []) {
      if (m?.key?.remoteJid === 'status@broadcast') continue;
      storeMessage(m);
    }
  });

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

  registerSelfHeal(sock, { messageStore });
  return sock;
  }
