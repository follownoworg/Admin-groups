// src/lib/astra.js
import logger from './logger.js';
import {
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_KEYSPACE
} from '../config/settings.js';

// فحص أساسي للتهيئة
function assertAstraEnv() {
  if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_KEYSPACE) {
    throw new Error('Astra config missing: ensure ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_KEYSPACE are set.');
  }
}

// بناء رابط الكولكشن
function collUrl(collection) {
  // Data API v2 JSON endpoint
  return `${ASTRA_DB_API_ENDPOINT}/api/json/v1/${ASTRA_DB_KEYSPACE}/${collection}`;
}

function headers() {
  return {
    'Authorization': `Bearer ${ASTRA_DB_APPLICATION_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// عمليات وثيقة: get / upsert / delete
export async function getDoc(collection, id) {
  assertAstraEnv();
  const url = `${collUrl(collection)}/documents/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'GET', headers: headers() });
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`Astra GET failed: ${res.status}`);
  return await res.json();
}

export async function upsertDoc(collection, id, body) {
  assertAstraEnv();
  const url = `${collUrl(collection)}/documents/${encodeURIComponent(id)}`;
  // PUT يعمل upsert في Data API
  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`Astra UPSERT failed: ${res.status}`);
  return await res.json().catch(() => ({}));
}

export async function deleteDoc(collection, id) {
  assertAstraEnv();
  const url = `${collUrl(collection)}/documents/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'DELETE', headers: headers() });
  if (res.status === 404) return { deleted: false };
  if (!res.ok) throw new Error(`Astra DELETE failed: ${res.status}`);
  return { deleted: true };
}
