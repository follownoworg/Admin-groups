import { collections } from './astra.js';

const DOC_ID = 'global';

export async function getBanned() {
  const { banned } = await collections();
  try {
    const doc = await banned.get(DOC_ID);
    const arr = Array.isArray(doc?.words) ? doc.words : [];
    return Array.from(new Set(arr.map(w => String(w || '').trim()).filter(Boolean)));
  } catch {
    return [];
  }
}

export async function setBanned(words) {
  const { banned } = await collections();
  const clean = Array.from(new Set((words || []).map(w => String(w || '').trim()).filter(Boolean)));
  try { await banned.update(DOC_ID, { words: clean }); }
  catch { await banned.create(DOC_ID, { words: clean }); }
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
