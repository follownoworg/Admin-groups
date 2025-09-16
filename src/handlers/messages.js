import { getBanned } from '../lib/bannedStore.js';
import logger from '../lib/logger.js';

export function onMessageUpsert(sock) {
  return async ({ messages, type }) => {
    if (!Array.isArray(messages)) return;
    const banned = await getBanned();

    for (const m of messages) {
      try {
        const jid = m?.key?.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;

        const txt = m?.message?.conversation
          || m?.message?.extendedTextMessage?.text
          || '';

        if (txt && banned.length) {
          const hit = banned.find(w => txt.toLowerCase().includes(w.toLowerCase()));
          if (hit) {
            await sock.sendMessage(jid, { text: `⚠️ كلمة محظورة: "${hit}"` }, { quoted: m });
          }
        }
      } catch (e) {
        logger.warn({ e }, 'onMessageUpsert error');
      }
    }
  };
}
