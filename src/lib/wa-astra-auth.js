// src/lib/wa-astra-auth.js
import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { getDoc, upsertDoc, deleteDoc } from './astra.js';
import {
  ASTRA_CREDS_COLLECTION,
  ASTRA_KEYS_COLLECTION
} from '../config/settings.js';
import logger from './logger.js';

const enc = (x) => JSON.parse(JSON.stringify(x, BufferJSON.replacer));
const dec = (x) => JSON.parse(JSON.stringify(x), BufferJSON.reviver);

export async function astraAuthState() {
  // creds
  let creds;
  try {
    const doc = await getDoc(ASTRA_CREDS_COLLECTION, 'creds');
    creds = dec(doc);
  } catch (e) {
    logger.error({ err: e.message || e }, 'astraAuthState: create creds failed');
    creds = initAuthCreds();
    try {
      await upsertDoc(ASTRA_CREDS_COLLECTION, 'creds', enc(creds));
    } catch (e2) {
      logger.error({ err: e2.message || e2 }, 'astraAuthState: save new creds failed');
    }
  }

  const keys = {
    async get(type, ids) {
      const out = {};
      await Promise.all((ids || []).map(async (id) => {
        const keyId = `${type}-${id}`;
        try {
          const doc = await getDoc(ASTRA_KEYS_COLLECTION, keyId);
          out[id] = dec(doc)?.value;
        } catch (e) {
          logger.warn({ err: e.message || e, keyId }, 'astraAuthState: get key failed');
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
            ops.push(
              deleteDoc(ASTRA_KEYS_COLLECTION, keyId).catch((e) =>
                logger.warn({ err: e.message || e, keyId }, 'astraAuthState: delete key failed')
              )
            );
          } else {
            ops.push(
              upsertDoc(ASTRA_KEYS_COLLECTION, keyId, { value: enc(val) }).catch((e) =>
                logger.warn({ err: e.message || e, keyId }, 'astraAuthState: upsert key failed')
              )
            );
          }
        }
      }
      await Promise.all(ops);
    }
  };

  async function saveCreds() {
    try {
      await upsertDoc(ASTRA_CREDS_COLLECTION, 'creds', enc(creds));
    } catch (e) {
      logger.error({ err: e.message || e }, 'saveCreds failed');
    }
  }

  return { state: { creds, keys }, saveCreds };
}
