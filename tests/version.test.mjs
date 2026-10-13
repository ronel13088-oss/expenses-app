import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { computeVersion, writeVersion, appFiles } from '../scripts/build-version.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
test('sw version changes when an app file changes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv-'));
  for (const f of ['sw.js', ...appFiles(ROOT)]) { fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
  const v1 = writeVersion(tmp); assert.match(fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8'), new RegExp(`const V = '${v1}'`));
  assert.equal(computeVersion(tmp), v1, 'stable: writing the version does not change it');
  fs.appendFileSync(path.join(tmp, 'styles.css'), '\n/* change */');
  const v2 = writeVersion(tmp); assert.notEqual(v1, v2); assert.match(v2, /^exp-[0-9a-f]{12}$/);
  fs.rmSync(tmp, { recursive: true });
});
test('every SW asset exists', () => { for (const f of appFiles(ROOT)) assert.ok(fs.existsSync(path.join(ROOT, f)), f); });
