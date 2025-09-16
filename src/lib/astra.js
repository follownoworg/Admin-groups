import { createClient } from '@astrajs/collections';
import logger from './logger.js';
import {
  ASTRA_DB_ID, ASTRA_DB_REGION, ASTRA_DB_TOKEN,
  ASTRA_NAMESPACE, ASTRA_CREDS_COLLECTION, ASTRA_KEYS_COLLECTION,
  ASTRA_BANNED_COLLECTION, ASTRA_LOCKS_COLLECTION
} from '../config/settings.js';

let client;

export async function astraClient() {
  if (client) return client;
  if (!ASTRA_DB_ID || !ASTRA_DB_REGION || !ASTRA_DB_TOKEN) {
    throw new Error('Missing Astra env (ASTRA_DB_ID / ASTRA_DB_REGION / ASTRA_DB_TOKEN)');
  }
  client = await createClient({
    astraDatabaseId: ASTRA_DB_ID,
    astraDatabaseRegion: ASTRA_DB_REGION,
    applicationToken: ASTRA_DB_TOKEN
  });
  logger.info('✅ Connected to Astra DB');
  return client;
}

export async function col(name) {
  const c = await astraClient();
  return c.namespace(ASTRA_NAMESPACE).collection(name);
}

export async function collections() {
  return {
    creds: await col(ASTRA_CREDS_COLLECTION),
    keys: await col(ASTRA_KEYS_COLLECTION),
    banned: await col(ASTRA_BANNED_COLLECTION),
    locks: await col(ASTRA_LOCKS_COLLECTION),
  };
}
