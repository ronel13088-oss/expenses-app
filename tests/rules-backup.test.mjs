import test from 'node:test'; import assert from 'node:assert/strict'; import * as C from '../js/core.js'; import { encryptBackup, decryptBackup } from '../js/backup.js';
test('derive merchant rules from source categories (catch-alls/income/card lines skipped, majority wins)', () => {
  const r = (merchant, srcCategory, amount = 20) => ({ merchant, srcCategory, amount, kind: 'card' });
  const d = C.deriveSourceRules([r('קפה דמו', 'אוכל בחוץ'), r('קפה דמו', 'אוכל בחוץ'), r('קפה דמו', 'סופר'), r('חנות דמו', 'כללי'), r('מעסיק דמו', 'הכנסות קבועות', -900), r('ישראכרט', 'סופר')]);
  assert.deepEqual(d, { [C.normMerchant('קפה דמו')]: 'מסעדות ומשלוחים' });
  const a = C.analyze([{ date: '2026-03-01', merchant: 'קפה דמו', amount: 30, kind: 'checking' }], { merchantRules: d });
  assert.equal(a.txs[0].category, 'מסעדות ומשלוחים');
  assert.equal(C.mergeRules({ x: 'A' }, { x: 'B', y: 'C' }).added, 1);
});
test('all user rules survive encrypted backup -> wipe -> restore', async () => {
  const S = { txs: [{ date: '2026-03-01', merchant: 'דמו', amount: 5 }], rules: C.rulesFromDefaults().concat({ category: 'ספורט', keyword: 'חדר כושר דמו' }),
    overrides: { 'שולח דמו': C.REFUNDS, 'נמען דמו': C.HOUSING }, merchantRules: { 'קפה דמו': 'מסעדות ומשלוחים' }, settings: { monthMode: 'charge' } };
  const db = new Map([['state', C.backupPayload(S)]]);
  const file = await encryptBackup(C.backupPayload(S), 'סיסמה-דמו');
  db.clear(); const fresh = { txs: [], rules: null, overrides: {}, merchantRules: {}, settings: {} };
  C.applyBackup(fresh, await decryptBackup(file, 'סיסמה-דמו')); db.set('state', C.backupPayload(fresh));
  for (const k of ['rules', 'overrides', 'merchantRules', 'settings', 'txs']) assert.deepEqual(db.get('state')[k], S[k]);
  await assert.rejects(decryptBackup(file, 'wrong'));
});
