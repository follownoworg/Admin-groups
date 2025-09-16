// src/config/settings.js
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
export const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

export const PORT = Number(process.env.PORT) || 3000;

// إما أن تزوّد API_ENDPOINT مباشرة، أو نوّلفه من ID + REGION
const RAW_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT;
const RAW_ID = process.env.ASTRA_DB_ID;
const RAW_REGION = process.env.ASTRA_DB_REGION;

export const ASTRA_DB_API_ENDPOINT =
  RAW_ENDPOINT ||
  (RAW_ID && RAW_REGION
    ? `https://${RAW_ID}-${RAW_REGION}.apps.astra.datastax.com`
    : '');

export const ASTRA_DB_APPLICATION_TOKEN =
  process.env.ASTRA_DB_APPLICATION_TOKEN || process.env.ASTRA_DB_TOKEN || '';

export const ASTRA_DB_KEYSPACE =
  process.env.ASTRA_DB_KEYSPACE || process.env.ASTRA_NAMESPACE || 'whatsappbot';

// أسماء الكولكشن (تقدر تغيّرها من env)
export const ASTRA_LOCKS_COLLECTION = process.env.ASTRA_LOCKS_COLLECTION || 'locks';
export const ASTRA_KEYS_COLLECTION = process.env.ASTRA_KEYS_COLLECTION || 'keys';
export const ASTRA_CREDS_COLLECTION = process.env.ASTRA_CREDS_COLLECTION || 'creds';
export const ASTRA_BANNED_COLLECTION = process.env.ASTRA_BANNED_COLLECTION || 'banned';

export const USE_ASTRA_AUTH = true; // نستخدم Astra فقط
