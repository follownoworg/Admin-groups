import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { collections } from './astra.js';
import logger from './logger.js';

function enc(x) { return JSON.parse(JSON.stringify(x, BufferJSON.replacer)); }
function dec(x) { return JSON.parse(JSON.stringify(x), BufferJSON.reviver); }

export async function astraAuthState() {
  const { creds: credsCol, keys: keysCol } = await collections();

  let creds;
  try {
    const doc = await credsCol.get('creds');
    creds = dec(doc);
  } catch {
    creds = initAuthCreds();
    try { await credsCol.create('creds', enc(creds)); } catch (e) {
      logger.warn({ e }, 'astraAuthState: create creds ignored (exists?)');
    }
  }

  const keys = {
    async get(type, ids) {
      const out = {};
      await Promise.all((ids || []).map(async id => {
        const keyId = `${type}-${id}`;
        try {
          const doc = await keysCol.get(keyId);
          out[id] = dec(doc)?.value;
        } catch { out[id] = undefined; }
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
            ops.push(keysCol.delete(keyId).catch(() => null));
          } else {
            const body = { value: enc(val) };
            ops.push(keysCol.update(keyId, body).catch(async () => {
              try { await keysCol.create(keyId, body); } catch {}
            }));
          }
        }
      }
      await Promise.all(ops);
    }
  };

  async function saveCreds() {
    try { await credsCol.update('creds', enc(creds)); }
    catch { try { await credsCol.create('creds', enc(creds)); } catch (e) {
      logger.warn({ e }, 'saveCreds: create failed');
    }}
  }

  return { state: { creds, keys }, saveCreds };
}
