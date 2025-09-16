// src/lib/leader-lock.js
import { getDoc, upsertDoc } from './astra.js';
import { ASTRA_LOCKS_COLLECTION } from '../config/settings.js';
import logger from './logger.js';

export async function acquireLock(lockName, holder, ttlSec = 60) {
  const now = Date.now();
  const exp = now + ttlSec * 1000;

  try {
    const cur = await getDoc(ASTRA_LOCKS_COLLECTION, lockName);
    if (cur.holder === holder || cur.expiresAt <= now) {
      await upsertDoc(ASTRA_LOCKS_COLLECTION, lockName, { holder, expiresAt: exp });
      logger.info({ lockName, holder, ok: true }, 'leader-lock renew/steal');
      return true;
    }
    logger.info({ lockName, current: cur.holder }, 'leader-lock busy');
    return false;
  } catch {
    await upsertDoc(ASTRA_LOCKS_COLLECTION, lockName, { holder, expiresAt: exp });
    logger.info({ lockName, holder, ok: true }, 'leader-lock created');
    return true;
  }
}

export async function releaseLock(lockName, holder) {
  try {
    const cur = await getDoc(ASTRA_LOCKS_COLLECTION, lockName);
    if (cur?.holder === holder) {
      await upsertDoc(ASTRA_LOCKS_COLLECTION, lockName, { holder: '', expiresAt: 0 });
    }
  } catch {}
}
