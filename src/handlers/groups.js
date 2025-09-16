import logger from '../lib/logger.js';

export function registerGroupParticipantHandler(sock) {
  sock.ev.on('group-participants.update', async (u) => {
    try {
      // مكان مناسب لأي منطق ترحيب/توديع/منع لاحقًا
      logger.info({ u }, 'group-participants.update');
    } catch (e) {
      logger.warn({ e }, 'groups handler error');
    }
  });
}
