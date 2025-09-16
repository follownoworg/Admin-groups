// src/app/whatsapp.js
import makeWASocket, { fetchLatestBaileysVersion } from "baileys";
import NodeCache from "node-cache";
import logger from "../lib/logger.js";
import { mongoAuthState } from "../lib/wa-mongo-auth.js"; // أو auth الخاص بك لـ Astra
import { registerSelfHeal } from "../lib/selfheal.js";

// --------- تخزين الرسائل (لأجل retries) ----------
const messageStore = new Map(); // key: msg.key.id -> value: proto message
const MAX_STORE = Number(process.env.WA_MESSAGE_STORE_MAX || 5000);

function storeMessage(msg) {
  if (!msg?.key?.id) return;
  if (messageStore.size >= MAX_STORE) {
    const firstKey = messageStore.keys().next().value;
    if (firstKey) messageStore.delete(firstKey);
  }
  messageStore.set(msg.key.id, msg);
}

// --------- تهيئة واتساب ----------
export async function createWhatsApp({ telegram } = {}) {
  const { state, saveCreds } = await mongoAuthState(logger);
  const { version } = await fetchLatestBaileysVersion();

  const msgRetryCounterCache = new NodeCache({
    stdTTL: Number(process.env.WA_RETRY_TTL || 3600),
    checkperiod: Number(process.env.WA_RETRY_CHECK || 120),
    useClones: false,
  });

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !telegram, // لو ما فيه تيليجرام، يطبع QR في اللوغ
    logger,
    emitOwnEvents: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    getMessage: async (key) => {
      if (!key?.id) return undefined;
      return messageStore.get(key.id);
    },
    msgRetryCounterCache,
    shouldIgnoreJid: (jid) => jid === "status@broadcast",
  });

  // حفظ الجلسة
  sock.ev.on("creds.update", saveCreds);

  // مراقبة الاتصال
  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u || {};
    logger.info(
      { connection, lastDisconnectReason: lastDisconnect?.error?.message, hasQR: Boolean(qr) },
      "WA connection.update"
    );

    // إرسال QR للتيليجرام لو متاح
    if (qr && telegram) {
      try {
        await telegram.sendMessage(
          process.env.TELEGRAM_ADMIN_ID,
          "📲 امسح هذا الكود لربط واتساب:\n\n" + qr
        );
      } catch (e) {
        logger.warn({ e }, "فشل إرسال QR إلى تيليجرام");
      }
    }
  });

  // تخزين الرسائل الجديدة
  sock.ev.on("messages.upsert", ({ messages }) => {
    for (const m of messages || []) {
      if (m?.key?.remoteJid === "status@broadcast") continue;
      storeMessage(m);
    }
  });

  // retries عند فشل فك التشفير
  sock.ev.on("messages.update", async (updates) => {
    for (const u of updates || []) {
      try {
        if (u?.key?.remoteJid === "status@broadcast") continue;
        const needsResync =
          u.update?.retry || u.update?.status === 409 || u.update?.status === 410;
        if (needsResync) {
          try {
            await sock.resyncAppState?.(["critical_unblock_low"]);
          } catch (e) {
            logger.warn({ e }, "فشل resyncAppState");
          }
        }
      } catch (e) {
        logger.warn({ e, u }, "خطأ في messages.update");
      }
    }
  });

  // ميزة التعافي الذاتي
  registerSelfHeal(sock, { messageStore });

  return sock;
}
