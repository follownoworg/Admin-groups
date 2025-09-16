export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
export const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

export const PORT = Number(process.env.PORT) || 3000;

export const ASTRA_DB_ID = process.env.ASTRA_DB_ID;
export const ASTRA_DB_REGION = process.env.ASTRA_DB_REGION;
export const ASTRA_DB_TOKEN = process.env.ASTRA_DB_TOKEN;

export const ASTRA_NAMESPACE = process.env.ASTRA_NAMESPACE || 'whatsappbot';
export const ASTRA_CREDS_COLLECTION = process.env.ASTRA_CREDS_COLLECTION || 'baileyscreds';
export const ASTRA_KEYS_COLLECTION  = process.env.ASTRA_KEYS_COLLECTION  || 'baileyskeys';
export const ASTRA_BANNED_COLLECTION = process.env.ASTRA_BANNED_COLLECTION || 'banned_words';
export const ASTRA_LOCKS_COLLECTION = process.env.ASTRA_LOCKS_COLLECTION || 'bot_locks';

export const USE_ASTRA_AUTH = process.env.USE_ASTRA_AUTH === '1';
