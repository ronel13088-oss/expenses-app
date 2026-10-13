import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
test('staged check reads index content, not working tree', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-')); const real = path.join(d, 'real'); fs.mkdirSync(real);
  fs.mkdirSync(path.join(d, 'scripts')); fs.mkdirSync(path.join(d, 'js'));
  fs.copyFileSync(path.join(ROOT, 'scripts/check-no-real-data.mjs'), path.join(d, 'scripts/check-no-real-data.mjs'));
  fs.copyFileSync(path.join(ROOT, 'js/core.js'), path.join(d, 'js/core.js'));
  const row = 'date,merchant,amount\n01/01/2026,סינתטי מרצנט בדיקה,-123.45\n'; fs.writeFileSync(path.join(real, 'x.csv'), row);
  const g = (...a) => execFileSync('git', a, { cwd: d }); g('init', '-q');
  const run = () => spawnSync('node', ['scripts/check-no-real-data.mjs', '--staged'], { cwd: d, env: { ...process.env, REAL_DATA_DIR: real } }).status;
  // staged bad, working tree clean -> must block
  fs.writeFileSync(path.join(d, 'a.txt'), 'סינתטי מרצנט בדיקה 123.45\n'); g('add', 'a.txt'); fs.writeFileSync(path.join(d, 'a.txt'), 'clean\n');
  assert.strictEqual(run(), 1);
  // staged clean, working tree bad -> must pass
  g('add', 'a.txt'); fs.writeFileSync(path.join(d, 'a.txt'), 'סינתטי מרצנט בדיקה 123.45\n');
  assert.strictEqual(run(), 0);
  fs.rmSync(d, { recursive: true, force: true });
});
