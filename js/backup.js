// Encrypted backup: PBKDF2-SHA256 (310k iters) -> AES-GCM-256. File = JSON {v,salt,iv,data} base64.
const b64 = u8 => btoa(String.fromCharCode(...u8)); const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 310000;
async function key(pw, salt, c = globalThis.crypto) {
  const base = await c.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptBackup(obj, pw, c = globalThis.crypto) {
  const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pw, salt, c), new TextEncoder().encode(JSON.stringify(obj))));
  // chunked b64 for large data
  let s = ''; for (let i = 0; i < ct.length; i += 0x8000) s += String.fromCharCode(...ct.subarray(i, i + 0x8000));
  return JSON.stringify({ app: 'expenses-pwa', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), data: btoa(s) });
}
export async function decryptBackup(text, pw, c = globalThis.crypto) {
  const o = JSON.parse(text); if (o.app !== 'expenses-pwa') throw new Error('not a backup');
  const pt = await c.subtle.decrypt({ name: 'AES-GCM', iv: ub64(o.iv) }, await key(pw, ub64(o.salt), c), ub64(o.data));
  return JSON.parse(new TextDecoder().decode(pt));
}
