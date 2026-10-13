// IndexedDB key-value store, on-device only.
const DB = 'expenses-pwa', ST = 'kv';
const open = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(mode, fn) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(ST, mode); const q = fn(t.objectStore(ST)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); }
export const get = k => tx('readonly', s => s.get(k));
export const set = (k, v) => tx('readwrite', s => s.put(v, k));
export const clearAll = () => tx('readwrite', s => s.clear());
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
