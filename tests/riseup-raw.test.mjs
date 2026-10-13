import test from 'node:test'; import assert from 'node:assert';
import * as C from '../js/core.js';
test('RiseUp raw Hebrew export auto-detected', () => {
  const csv = 'שייך לתזרים חודש,שם העסק,אמצעי התשלום,אמצעי זיהוי התשלום,תאריך התשלום,חודש תאריך התשלום,שנת תאריך התשלום,תאריך החיוב בחשבון,סכום,מטבע חיוב,מספר התשלום,מספר תשלומים כולל,קטגוריה בתזרים,האם מוחרג מהתזרים?,הערות,סוג מקור,סכום מקורי\n2026-01,חנות לדוגמה,isracard,1234,05/01/2026,,,10/02/2026,-50,,1,3,מזון,false,,creditCard,-50\n2026-01,עמלה לדוגמה,poalim,12-345-678901,06/01/2026,,,06/01/2026,-7.5,,,,עמלות,false,,checkingAccount,0\n';
  const rows = C.parseCSV(csv); const det = C.detectColumns(rows); assert.ok(det.ok);
  const tx = C.rowsToTransactions(rows, det, {});
  assert.equal(tx.length, 2); assert.equal(tx[0].chargeDate, '2026-02-10'); assert.equal(tx[0].kind, 'card');
  assert.equal(tx[0].instTot, 3); assert.equal(tx[1].card, '8901'); assert.equal(tx[1].kind, 'checking');
});
test('cash withdrawal over 1000 -> household bills; smaller unchanged', () => {
  const big = { merchant: 'משיכה מבנקט', amount: 1300, kind: 'checking' }, small = { ...big, amount: 450 };
  const r = C.rulesFromDefaults();
  assert.equal(C.categorize(big, r), 'חשבונות הבית');
  assert.notEqual(C.categorize(small, r), 'חשבונות הבית');
});
test('per-transaction override beats cash rule; does not affect other withdrawals', () => {
  const r = C.rulesFromDefaults(); const a = { id: 'x1', merchant: 'משיכה מבנקט', amount: 1500, kind: 'checking' }, b = { ...a, id: 'x2' };
  const ov = { 'id:x1': 'תיירות ונופש' };
  assert.equal(C.categorize(a, r, ov), 'תיירות ונופש'); assert.equal(C.categorize(b, r, ov), 'חשבונות הבית');
});

test('cash rule beats payee-wide override, per-transaction override still wins', async () => {
  const C = await import('../js/core.js'); const t = { id: 'x1', merchant: 'משיכה מבנקט', amount: 1300, kind: 'checking' };
  assert.equal(C.categorize(t, [], { 'משיכה מבנקט': C.TRANSFERS }), 'חשבונות הבית');
  assert.equal(C.categorize(t, [], { 'משיכה מבנקט': C.TRANSFERS, 'id:x1': 'פנאי' }), 'פנאי');
  assert.equal(C.categorize({ ...t, amount: 450 }, [], { 'משיכה מבנקט': C.TRANSFERS }), C.TRANSFERS);
});
