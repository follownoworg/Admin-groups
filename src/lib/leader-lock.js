import { collections } from './astra.js';
import logger from './logger.js';

export async function acquireLock(lockName, holder, ttlSec = 60) {
  const { locks } = await collections();
  const now = Date.now();
  const expiresAt = now + ttlSec * 1000;

  // Upsert: إذا القفل منتهي أو لي نفس الحامل → امتلكه
  // (Document API ما يدعم شروط متقدمة، ننفذ منطق مبسط: جرّب جلب، ثم قرر)
  let ok = false;
  try {
    const cur = await locks.get(lockName);
    if (!cur || cur.expiresAt <= now || cur.holder === holder) {
      await locks.update(lockName, { holder, expiresAt });
      ok = true;
    } else {
      ok = false;
    }
  } catch {
    // غير موجود: أنشئه
    await locks.create(lockName, { holder, expiresAt });
    ok = true;
  }
  logger.info({ lockName, holder, ok }, 'leader-lock acquire');
  return ok;
}

export async function releaseLock(lockName, holder) {
  try {
    const { locks } = await collections();
    const cur = await locks.get(lockName);
    if (cur?.holder === holder) await locks.delete(lockName);
  } catch {}
}
