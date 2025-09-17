// src/lib/wa-astra-auth.js
import { BufferJSON, initAuthCreds } from 'baileys';
import { getDoc, upsertDoc, deleteDoc } from './astra.js';
import {
  ASTRA_CREDS_COLLECTION,
  ASTRA_KEYS_COLLECTION
} from '../config/settings.js';
import logger from './logger.js';

const enc = (x) => JSON.parse(JSON.stringify(x, BufferJSON.replacer));
const dec = (x) => JSON.parse(JSON.stringify(x), BufferJSON.reviver);

// بعض دوال Astra قد تُرجع { value: {...} } أو ترجع الوثيقة مباشرة.
// لذلك نفك التغليف إن وجد:
function unwrap(doc) {
  if (!doc) return null;
  return (Object.prototype.hasOwnProperty.call(doc, 'value') ? doc.value : doc);
}

// فحص أن الـ creds تبدو سليمة (وجود noiseKey وغيره)
function credsLooksValid(c) {
  try {
    return Boolean(c?.noiseKey?.public && c?.noiseKey?.private && c?.signedIdentityKey?.public);
  } catch {
    return false;
  }
}

export async function astraAuthState() {
  // --------- تحميل/إنشاء creds ----------
  let creds;
  try {
    const doc = await getDoc(ASTRA_CREDS_COLLECTION, 'creds'); // قد تُرمى 404
    const raw = unwrap(doc);
    const maybe = dec(raw);
    if (credsLooksValid(maybe)) {
      creds = maybe;
    } else {
      throw new Error('creds invalid/corrupt');
    }
  } catch (e) {
    logger.warn({ msg: 'creating fresh creds', reason: e?.message }, 'astraAuthState');
    creds = initAuthCreds();
    try {
      await upsertDoc(ASTRA_CREDS_COLLECTION, 'creds', { value: enc(creds) });
    } catch (err) {
      logger.warn({ err }, 'astraAuthState: create creds failed');
    }
  }

  // --------- تخزين المفاتيح ----------
  const keys = {
    async get(type, ids) {
      const out = {};
      await Promise.all((ids || []).map(async (id) => {
        const keyId = `${type}-${id}`;
        try {
          const doc = await getDoc(ASTRA_KEYS_COLLECTION, keyId);
          const raw = unwrap(doc);
          out[id] = dec(raw)?.value ?? dec(raw); // دعم الشكلين
        } catch {
          out[id] = undefined;
        }
      }));
      return out;
    },
    async set(data) {
      const ops = [];
      for (const type of Object.keys(data || {})) {
        for (const id of Object.keys(data[type] || {})) {
          const val = data[type][id];
          const keyId = `${type}-${id}`;
          if (val == null) {
            ops.push(deleteDoc(ASTRA_KEYS_COLLECTION, keyId).catch(() => null));
          } else {
            // نخزّن دائماً تحت { value: ... } للاتساق
            ops.push(upsertDoc(ASTRA_KEYS_COLLECTION, keyId, { value: enc(val) }).catch(() => null));
          }
        }
      }
      await Promise.all(ops);
    }
  };

  async function saveCreds() {
    try {
      await upsertDoc(ASTRA_CREDS_COLLECTION, 'creds', { value: enc(creds) });
    } catch (e) {
      logger.warn({ e }, 'saveCreds failed');
    }
  }

  // API إضافي: حذف الجلسة وإعادة إنشائها (للاستشفاء من تلف الجلسة)
  async function resetCreds() {
    try { await deleteDoc(ASTRA_CREDS_COLLECTION, 'creds'); } catch {}
    const fresh = initAuthCreds();
    try {
      await upsertDoc(ASTRA_CREDS_COLLECTION, 'creds', { value: enc(fresh) });
    } catch (e) {
      logger.warn({ e }, 'resetCreds: upsert failed');
    }
    // مهم: نُحدّث نفس المرجع الذي مع Baileys
    Object.assign(creds, fresh);
    return fresh;
  }

  return { state: { creds, keys }, saveCreds, resetCreds };
    }
