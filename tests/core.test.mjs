import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import * as C from '../js/core.js'; import { encryptBackup, decryptBackup } from '../js/backup.js';
const F = n => new URL('./fixtures/' + n, import.meta.url);
const load = (n, o = {}) => { const { text, encoding } = C.decodeBytes(fs.readFileSync(F(n))); const rows = C.parseCSV(text); const d = C.detectColumns(rows); return { encoding, d, tx: C.rowsToTransactions(rows, d, o) }; };

test('encoding: utf-8 and cp1255', () => {
  assert.equal(load('riseup-synth.csv').encoding, 'utf-8');
  const h = load('hapoalim-synth-cp1255.csv'); assert.equal(h.encoding, 'windows-1255'); assert.match(h.tx[0].merchant, /ישראכרט/);
});
test('column detection: header below title, debit/credit', () => {
  const h = load('hapoalim-synth-cp1255.csv'); assert.equal(h.d.headerRow, 1); assert.ok(h.d.ok);
  assert.equal(h.tx[0].amount, 725.9); assert.equal(h.tx.at(-1).amount, -500);
});
test('riseup: sign, installments, refunds, kinds', () => {
  const { tx } = load('riseup-synth.csv');
  assert.equal(tx[0].amount, 300); assert.equal(tx[0].kind, 'card'); assert.equal(tx[0].company, 'isracard');
  const inst = tx.find(t => t.instTot === 6); assert.equal(inst.amount, 250); assert.equal(inst.instNo, 2);
  assert.equal(tx.find(t => /זיכוי/.test(t.merchant)).amount, -40);
  assert.equal(tx.find(t => /משכורת/.test(t.merchant)).kind, 'checking');
});
test('card file: foreign currency, charge date', () => {
  const { tx } = load('card-synth.csv', { kind: 'card', company: 'cal' });
  assert.equal(tx[0].currency, 'USD'); assert.equal(tx[0].origAmount, 20); assert.equal(tx[0].amount, 74.1);
  assert.equal(tx[0].chargeDate, '2026-04-10'); assert.equal(tx[1].currency, null);
});
test('dedupe: card settlement lines excluded when they match card sums', () => {
  const all = C.markSettlements(C.mergeTransactions(load('riseup-synth.csv').tx, load('hapoalim-synth-cp1255.csv').tx).list);
  const st = all.filter(t => t.settlement); assert.equal(st.length, 2); assert.ok(st.every(t => t.excluded && t.settlement.matched));
  const a = C.analyze(all); assert.ok(!a.txs.some(t => /ישראכרט/.test(t.merchant)));
});
test('dedupe: checking-only keeps settlement lines (no card data)', () => {
  const all = C.markSettlements(load('hapoalim-synth-cp1255.csv').tx); assert.ok(all.every(t => !t.excluded));
});
test('merge skips duplicate rows on re-import', () => {
  const a = load('riseup-synth.csv').tx; const m = C.mergeTransactions(a, a); assert.equal(m.added, 0); assert.equal(m.skipped, a.length);
});
test('categorization: rules, specificity, overrides, uncategorized', () => {
  const R = C.rulesFromDefaults();
  assert.equal(C.categorize({ merchant: 'שופרסל דיל', amount: 10 }, R), 'מזון וסופר');
  assert.equal(C.categorize({ merchant: 'NETFLIX.COM', amount: 10 }, R), 'מנויים ודיגיטל');
  assert.equal(C.categorize({ merchant: 'משהו לא מוכר', amount: 10 }, R), C.UNCAT);
  assert.equal(C.categorize({ merchant: 'Netflix.com', amount: 10 }, R, { 'netflix.com': 'בידור' }), 'בידור');
  assert.equal(C.categorize({ merchant: 'x', amount: 10 }, [...R, { category: 'א', keyword: 'שופר' }, { category: 'ב', keyword: 'שופרסל' }]) , C.UNCAT);
  assert.equal(C.categorize({ merchant: 'שופרסל', amount: 1 }, [{ category: 'א', keyword: 'שופר' }, { category: 'ב', keyword: 'שופרסל' }]), 'ב');
});
test('analysis: month mode, category sum == total, recurring gate', () => {
  const tx = C.markSettlements(load('riseup-synth.csv').tx);
  const a = C.analyze(tx); const s = a.byCategory.reduce((x, c) => x + c.total, 0); assert.ok(Math.abs(s - a.total) < 0.01);
  assert.deepEqual(C.analyze(tx, { monthMode: 'date' }).months, ['2026-01', '2026-02', '2026-03', '2026-04']);
  assert.ok(a.months.includes('2026-05'));
  assert.ok(a.recurring.some(r => r.merchant === 'NETFLIX.COM'));
  assert.equal(C.analyze(tx.filter(t => t.date < '2026-02-15')).recurring, null);
});
test('backup: encrypt/decrypt roundtrip, wrong password fails', async () => {
  const enc = await encryptBackup({ a: [1, 'שלום'] }, 'correct horse');
  assert.deepEqual(await decryptBackup(enc, 'correct horse'), { a: [1, 'שלום'] });
  await assert.rejects(decryptBackup(enc, 'wrong'));
});
test('xlsx parsing via vendored SheetJS', async () => {
  const X = new Function(fs.readFileSync(new URL('../vendor/xlsx.full.min.js', import.meta.url), 'utf8') + ';return XLSX;')();
  const ws = X.utils.aoa_to_sheet([['תאריך', 'תיאור', 'סכום'], ['01/01/2026', 'פז דמה', 99]]); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 's');
  const buf = X.write(wb, { type: 'array', bookType: 'xlsx' }); const rows = X.utils.sheet_to_json(X.read(buf, { type: 'array' }).Sheets.s, { header: 1, raw: true });
  const tx = C.rowsToTransactions(rows, C.detectColumns(rows)); assert.equal(tx[0].amount, 99); assert.equal(tx[0].merchant, 'פז דמה');
});
