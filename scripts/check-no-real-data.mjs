#!/usr/bin/env node
// Fails (exit 1) if any repo file looks like it contains real financial rows.
// Real-data source: /workspace/finance (or $REAL_DATA_DIR). Never commit anything from there.
import fs from 'node:fs'; import path from 'node:path'; import { execSync, execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REAL = process.env.REAL_DATA_DIR || '/workspace/finance';
const SKIP = /^(vendor|fonts|icons|node_modules|\.git)\//;
// --staged (used by pre-commit): check the index content (what will be committed), not the working tree.
const STAGED = process.argv.includes('--staged');
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28, ...opts });
let files; if (STAGED) files = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).toString().split('\0').filter(Boolean);
else try { files = execSync('git ls-files -co --exclude-standard', { cwd: ROOT }).toString().split('\n').filter(Boolean); }
catch { files = []; const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); }); walk(''); }
files = files.filter(f => !SKIP.test(f));
const bad = [];
for (const f of files) if (/(^|\/)(finance|real|private)(\/|[-_.])|riseup-clean|hapoalim-transactions/i.test(f)) bad.push(`${f}: forbidden file name`);
const norm = s => s.replace(/[״”“"'׳`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
// generic terms (rule keywords, standard bank labels) are not personal data
const GENERIC = new Set(); { const src = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'); for (const m of src.matchAll(/'([^']+)'\]/g)) m[1].split(',').forEach(k => GENERIC.add(norm(k)));
  ['זיכוי', 'משיכה מבנקט', 'מטח-קניה', 'ע.מפעולות-ישיר', 'החזר עמלה'].forEach(k => GENERIC.add(norm(k))); }
const merchants = new Set(), pairs = [];
if (fs.existsSync(REAL)) for (const n of fs.readdirSync(REAL)) {
  if (!/\.(csv|txt)$/i.test(n)) continue; const lines = fs.readFileSync(path.join(REAL, n), 'utf8').split(/\r?\n/).slice(1);
  for (const l of lines) { const cells = l.split(','); const m = cells.find(c => /[א-תA-Za-z]{3}/.test(c) && !/^(isracard|poalim|leumicard|creditCard|checkingAccount)$/.test(c));
    if (!m) continue; const nm = norm(m); if (nm.length < 5 || GENERIC.has(nm)) continue; merchants.add(nm);
    for (const c of cells) { const a = c.replace(/^-/, ''); if (/^\d*\.?\d+$/.test(a) && parseFloat(a) >= 10) pairs.push([nm, String(parseFloat(a))]); } }
} else console.warn(`note: ${REAL} not found – only file-name checks ran`);
const realBytes = fs.existsSync(REAL) ? fs.readdirSync(REAL).map(n => fs.readFileSync(path.join(REAL, n))) : [];
for (const f of files) {
  const buf = STAGED ? git(['show', ':' + f]) : fs.readFileSync(path.join(ROOT, f)); if (realBytes.some(b => b.equals(buf))) { bad.push(`${f}: identical to a real data file`); continue; }
  const text = norm(buf.toString('utf8')); const lines = text.split('\n');
  const hits = [...merchants].filter(m => text.includes(m));
  if (hits.length >= 5) bad.push(`${f}: ${hits.length} real merchant names`);
  for (const [m, a] of pairs) if (lines.some(l => l.includes(m) && new RegExp(`(^|[^\\d.])-?${a.replace('.', '\\.')}(?![\\d])`).test(l))) { bad.push(`${f}: real row (merchant+amount)`); break; }
}
if (bad.length) { console.error('BLOCKED – possible real financial data:\n  ' + [...new Set(bad)].join('\n  ')); process.exit(1); }
console.log(`ok: ${files.length} ${STAGED ? 'staged ' : ''}files checked, no real data found`);
