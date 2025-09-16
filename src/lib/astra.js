// src/lib/astra.js
import {
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_KEYSPACE
} from '../config/settings.js';
import logger from './logger.js';

function base(path = '') {
  // لا تضع /api/rest في المتغير البيئي. سنضيفها هنا.
  const ep = ASTRA_DB_API_ENDPOINT?.replace(/\/+$/, '');
  return `${ep}/api/rest/v2/namespaces/${encodeURIComponent(ASTRA_DB_KEYSPACE)}/${path.replace(/^\/+/, '')}`;
}

function headers(extra = {}) {
  return {
    'X-Cassandra-Token': ASTRA_DB_APPLICATION_TOKEN,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extra,
  };
}

// GET وثيقة
export async function getDoc(collection, id) {
  const url = base(`collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
  const res = await fetch(url, { method: 'GET', headers: headers() });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    logger.error({ status: res.status, body: txt, url }, 'Astra GET failed');
    throw new Error(`Astra GET failed: ${res.status}`);
  }
  return res.json();
}

// UPSERT وثيقة
export async function upsertDoc(collection, id, data) {
  const url = base(`collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
  const res = await fetch(url, { method: 'PUT', headers: headers(), body: JSON.stringify(data) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    logger.error({ status: res.status, body: txt, url }, 'Astra UPSERT failed');
    throw new Error(`Astra UPSERT failed: ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

// DELETE وثيقة
export async function deleteDoc(collection, id) {
  const url = base(`collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
  const res = await fetch(url, { method: 'DELETE', headers: headers() });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => '');
    logger.error({ status: res.status, body: txt, url }, 'Astra DELETE failed');
    throw new Error(`Astra DELETE failed: ${res.status}`);
  }
  return true;
}
