// src/config/settings.js

// ====== Logging ======
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// ====== Server (Render يمرر PORT تلقائياً) ======
export const PORT = Number(process.env.PORT) || 3000;

// ====== Telegram ======
export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
export const TELEGRAM_ADMIN_ID = (process.env.TELEGRAM_ADMIN_ID || '').trim();

// ====== WhatsApp Pairing via Phone ======
export const WA_PAIRING_CODE = String(process.env.WA_PAIRING_CODE || '0') === '1';
export const WA_PHONE = (process.env.WA_PHONE || '').replace(/[^0-9]/g, '');

// عنوان عام للخدمة (للوِبهـوك). استخدم PUBLIC_URL أو RENDER_EXTERNAL_URL من Render
export const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

// ====== Astra DB (Data API) ======
// يمكن تزويد endpoint مباشرة، أو تركيبه من ID + REGION
const RAW_ENDPOINT = (process.env.ASTRA_DB_API_ENDPOINT || '').trim();
const RAW_ID      = (process.env.ASTRA_DB_ID || '').trim();
const RAW_REGION  = (process.env.ASTRA_DB_REGION || '').trim();

// normalize
function normalizeAstraEndpoint(ep) {
  if (!ep) return '';
  return ep.replace(/\/+$/, '').replace(/\/api\/rest.*$/i, '');
}

export const ASTRA_DB_API_ENDPOINT = normalizeAstraEndpoint(
  RAW_ENDPOINT || (RAW_ID && RAW_REGION ? `https://${RAW_ID}-${RAW_REGION}.apps.astra.datastax.com` : '')
);

// token
export const ASTRA_DB_APPLICATION_TOKEN =
  (process.env.ASTRA_DB_APPLICATION_TOKEN || process.env.ASTRA_DB_TOKEN || '').trim();

// keyspace
export const ASTRA_DB_KEYSPACE =
  (process.env.ASTRA_DB_KEYSPACE || process.env.ASTRA_NAMESPACE || 'whatsappbot').trim();

// collections
export const ASTRA_CREDS_COLLECTION  = (process.env.ASTRA_CREDS_COLLECTION  || 'creds').trim();
export const ASTRA_KEYS_COLLECTION   = (process.env.ASTRA_KEYS_COLLECTION   || 'keys').trim();
export const ASTRA_BANNED_COLLECTION = (process.env.ASTRA_BANNED_COLLECTION || 'banned').trim();
export const ASTRA_LOCKS_COLLECTION  = (process.env.ASTRA_LOCKS_COLLECTION  || 'locks').trim();

// نستخدم Astra فقط للتوثيق/المفاتيح
export const USE_ASTRA_AUTH = true;

// جاهزية
export const ASTRA_READY = Boolean(
  ASTRA_DB_API_ENDPOINT &&
  ASTRA_DB_APPLICATION_TOKEN &&
  ASTRA_DB_KEYSPACE
);
