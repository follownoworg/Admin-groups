// src/lib/bannedStore.js
import { getDoc, upsertDoc } from './astra.js';
import { ASTRA_BANNED_COLLECTION } from '../config/settings.js';

const DOC_ID = 'global';

export async function getBanned() {
  try {
    const doc = await getDoc(ASTRA_BANNED_COLLECTION, DOC_ID);
    const arr = Array.isArray(doc?.words) ? doc.words : [];
    return Array.from(new Set(arr.map(w => String(w || '').trim()).filter(Boolean)));
  } catch {
    return [];
  }
}

export async function setBanned(words) {
  const clean = Array.from(new Set((words || []).map(w => String(w || '').trim()).filter(Boolean)));
  await upsertDoc(ASTRA_BANNED_COLLECTION, DOC_ID, { words: clean });
  return clean;
}

export async function addBanned(word) {
  const cur = await getBanned();
  const w = String(word || '').trim();
  if (!w) return cur;
  if (!cur.includes(w)) cur.push(w);
  return setBanned(cur);
}

export async function removeBanned(word) {
  const cur = await getBanned();
  const w = String(word || '').trim();
  return setBanned(cur.filter(x => x !== w));
}
