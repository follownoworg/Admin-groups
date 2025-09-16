import makeWASocket, { fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import logger from '../lib/logger.js';
import { astraAuthState } from '../lib/wa-astra-auth.js';

let currentSock = null;
let reconnecting = false;
let generation = 0;

function safeClose(sock) {
  try { sock?.end?.(); } catch {}
  try { sock?.ws?.close?.(); } catch {}
}

export async function startWhatsApp({ telegram } = {}) {
  if (currentSock) return currentSock;

  const { state, saveCreds } = await astraAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 120, useClones: false });

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !telegram,
    logger,
    emitOwnEvents: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    getMessage: async (key) => undefined,
    msgRetryCounterCache,
    shouldIgnoreJid: (jid) => jid === 'status@broadcast',
  });

  currentSock = sock;
  const myGen = ++generation;
  logger.info({ gen: myGen }, 'WA socket created');

  sock.ev.on('creds.update', saveCreds);

  // QR → Telegram
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u || {};
    const code =
      lastDisconnect?.error?.output?.statusCode ??
      lastDisconnect?.error?.statusCode ??
      lastDisconnect?.statusCode;

    logger.info({ gen: myGen, connection, code, hasQR: Boolean(qr) }, 'WA connection.update');

    if (qr && telegram?.sendQR) {
      try { await telegram.sendQR(qr); } catch (e) {
        logger.warn({ e }, 'Failed to send QR to Telegram');
      }
    }

    if (connection === 'close') {
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        if (!reconnecting) {
          reconnecting = true;
          logger.warn({ gen: myGen, code }, 'WA closed, scheduling restart...');
          safeClose(currentSock);
          currentSock = null;
          setTimeout(async () => {
            try {
              await startWhatsApp({ telegram });
              logger.info({ gen: generation }, 'WA restarted');
            } catch (err) {
              logger.error({ err }, 'WA restart failed');
            } finally {
              reconnecting = false;
            }
          }, 2000);
        }
      } else {
        logger.error('WA logged out — rescan QR to login again.');
      }
    }
  });

  // Retry/Resync خفيف يفك تشفير الرسائل لاحقًا
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates || []) {
      try {
        const need = u?.update?.retry || [409, 410].includes(u?.update?.status);
        if (need) {
          try { await sock.resyncAppState?.(['critical_unblock_low']); } catch {}
        }
      } catch (e) {
        logger.warn({ e }, 'messages.update handler');
      }
    }
  });

  return sock;
}
