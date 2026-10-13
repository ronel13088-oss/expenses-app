#!/usr/bin/env node
// Computes a content hash of all app files and embeds it as the SW cache name in sw.js.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function appFiles(root = ROOT) {
  const src = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  return JSON.parse(src.match(/const ASSETS = (\[[^\]]*\])/)[1].replace(/'/g, '"')).filter(f => f !== './');
}
export function computeVersion(root = ROOT) {
  const h = crypto.createHash('sha256');
  for (const f of appFiles(root).sort()) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); }
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace(/const V = '[^']*';/, ''); h.update(sw); // SW logic itself, minus version line
  return 'exp-' + h.digest('hex').slice(0, 12);
}
export function writeVersion(root = ROOT) {
  const p = path.join(root, 'sw.js'), v = computeVersion(root), s = fs.readFileSync(p, 'utf8');
  const out = s.replace(/const V = '[^']*';/, `const V = '${v}';`); if (out !== s) fs.writeFileSync(p, out); return v;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log('sw version', writeVersion());
