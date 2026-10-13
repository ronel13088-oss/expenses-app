import test from 'node:test'; import assert from 'node:assert/strict'; import * as C from '../js/core.js';
const tx = (o) => ({ kind: 'checking', card: '', chargeDate: o.date, ...o });
const card = (co, date, amount, merchant = 'חנות דמה', o = {}) => tx({ kind: 'card', company: co, date, chargeDate: date, amount, merchant, ...o });

test('dedupe: partial card data counts the residual, not zero', () => {
  const t = [card('isracard', '2026-05-10', 1000), tx({ date: '2026-05-10', merchant: 'ישראכרט בע"מ', amount: 3000 })];
  C.markSettlements(t); assert.equal(t[1].excluded, false); assert.equal(t[1].residual, 2000);
  assert.equal(C.analyze(t).total, 3000);
});
test('dedupe: no card data that month -> full line counted; split lines matched together', () => {
  const t = [card('max', '2026-06-10', 300), tx({ date: '2026-05-10', merchant: 'מקס איט פיננסי', amount: 70 }),
    tx({ date: '2026-06-10', merchant: 'מקס איט פיננסי', amount: 100 }), tx({ date: '2026-06-14', merchant: 'מקס איט פיננסי', amount: 200 })];
  C.markSettlements(t); assert.equal(t[1].excluded, false); assert.equal(t[1].residual, undefined);
  assert.ok(t[2].excluded && t[3].excluded); assert.equal(C.analyze(t).total, 370);
});
test('income: rules run first; securities sales and own transfers are not income', () => {
  const t = [tx({ date: '2026-05-01', merchant: 'ני"ע-מכ דמה', amount: -9000 }), tx({ date: '2026-05-02', merchant: 'העברה עצמית דמה', amount: -400 }),
    tx({ date: '2026-05-03', merchant: 'משכורת דמה', amount: -10000 }), card('isracard', '2026-05-04', -91, 'DUMMYTRIP SHOP', { srcCategory: 'הכנסות משתנות' })];
  const a = C.analyze(t); assert.equal(a.byMonth[0].income, 10000);
  assert.equal(a.txs[0].category, 'השקעות'); assert.equal(a.txs[1].category, C.OWN); assert.equal(a.refunds, 91);
});
test('neutral toggle: investments/own transfers excluded by default; cheques stay expense + review list + fixed', () => {
  const t = [tx({ date: '2026-05-01', merchant: 'ני"ע-ק דמה', amount: 5000 })];
  for (const m of ['01', '02', '03', '04']) t.push(tx({ date: `2026-${m}-11`, merchant: 'שיק', amount: 3900 }));
  const a = C.analyze(t); assert.equal(a.total, 4 * 3900); assert.equal(a.neutral.total, 5000);
  assert.equal(a.reviewPayees[0].key, 'שיק'); assert.equal(a.reviewPayees[0].fixed, true);
  assert.ok(a.recurring.some(r => r.merchant === 'שיק' && r.monthly === 3900));
  assert.equal(C.analyze(t, { excludeNeutral: false }).total, 4 * 3900 + 5000);
  assert.equal(C.analyze(t, { overrides: { 'שיק': 'דיור ושכירות' } }).reviewPayees.length, 0);
});
test('keywords: word boundaries, Hebrew prefix, no false hits', () => {
  const R = C.rulesFromDefaults(); const cat = m => C.categorize({ merchant: m, amount: 10, kind: 'card' }, R);
  for (const m of ['Bento Dummy', 'Wineberx Dummy', 'מכללת דמה', 'משה וולטרמן', 'גארדן דמה']) assert.equal(cat(m), C.UNCAT, m);
  assert.equal(cat('וולט דמה'), 'מסעדות ומשלוחים'); assert.equal(cat('קופת דמה כללית'), 'ביטוח ובריאות');
  assert.equal(C.categorize({ merchant: 'מס דמה בני"ע', amount: -5, kind: 'checking' }, R), 'השקעות');
  assert.equal(C.categorize({ merchant: 'החזר עמלות דמה', amount: -0.44, kind: 'checking' }, R), C.REFUNDS);
  assert.equal(C.keywordRe('a'), null);
});
test('source category mapping merges RiseUp names', () => {
  const R = C.rulesFromDefaults(); const c = s => C.categorize({ merchant: 'עסק דמה', amount: 10, kind: 'card', srcCategory: s }, R);
  assert.equal(c('אוכל בחוץ'), 'מסעדות ומשלוחים'); assert.equal(c('סופר'), 'מזון וסופר'); assert.equal(c('תיירות'), 'תיירות ונופש');
  assert.equal(c('הוצאות משתנות'), C.UNCAT); assert.equal(c('ספורט'), 'ספורט');
});
test('foreign: likely-foreign merchants flagged when file has no currency column', () => {
  assert.ok(C.isForeignLikely({ kind: 'card', merchant: 'AGODA DUMMY' }));
  assert.ok(C.isForeignLikely({ kind: 'card', merchant: 'shop dummy     Luxembourg    LU' }));
  assert.ok(!C.isForeignLikely({ kind: 'card', merchant: 'SHOP DUMMY IL' })); assert.ok(!C.isForeignLikely({ kind: 'card', merchant: 'שופרסל' }));
});
test('partial months flagged and excluded from monthly average', () => {
  const t = [tx({ date: '2026-04-16', merchant: 'א', amount: 100 }), tx({ date: '2026-05-10', merchant: 'ב', amount: 1000 }),
    tx({ date: '2026-06-10', merchant: 'ג', amount: 2000 }), tx({ date: '2026-07-13', merchant: 'ד', amount: 50 })];
  const a = C.analyze(t, { span: ['2026-04-16', '2026-07-13'] });
  assert.deepEqual(a.partialMonths, ['2026-04', '2026-07']); assert.equal(a.monthlyAvg, 1500);
});


test('bit transfer in two sources (±1 day, different wording) counted once', () => {
  const mk = (date, merchant, amount, file) => ({ date, chargeDate: date, merchant, amount, kind: 'checking', file, id: file + date + amount });
  const txs = [mk('2026-03-10', 'bit קבלה דמו א', -500, 'riseup.csv'), mk('2026-03-11', 'bit קבלה דמו ב', -500, 'bank.csv'),
    mk('2026-03-10', 'bit קבלה דמו א', -500, 'riseup.csv#2'.slice(0, 10)), // same file, second real transfer
    mk('2026-03-20', 'bit קבלה דמו א', -80, 'riseup.csv'), mk('2026-03-25', 'bit קבלה דמו ב', -80, 'bank.csv'), // >1 day apart
    mk('2026-03-12', 'שופרסל', -500, 'bank.csv')];
  C.markSettlements(txs);
  assert.deepStrictEqual(txs.map(t => !!t.excluded), [false, true, false, false, false, false]);
});

test('recurring same-amount cheque -> housing; incoming bit pending until decided; card company line -> undetailed', () => {
  const ch = m => ({ date: `2026-0${m}-10`, chargeDate: `2026-0${m}-10`, merchant: 'שיק', amount: 1000, kind: 'checking', file: 'a' });
  const bit = { date: '2026-03-05', chargeDate: '2026-03-05', merchant: 'bit קבלה דמו ב', amount: -300, kind: 'checking', file: 'a' };
  const mc = { date: '2026-03-02', chargeDate: '2026-03-02', merchant: 'MASTERCARD DEMO', amount: 900, kind: 'checking', file: 'a' };
  let a = C.analyze([ch(3), ch(4), ch(5), bit, mc]);
  assert.ok(a.txs.filter(t => t.merchant === 'שיק').every(t => t.category === C.HOUSING));
  assert.equal(a.txs.find(t => t.amount === -300).category, C.PENDING);
  assert.equal(Math.abs(a.byMonth.find(m => m.month === '2026-03').income), 0);
  assert.ok(!C.BIT_RE.test('חברה לביט'));
  assert.equal(a.pendingIncoming.length, 1);
  assert.equal(a.txs.find(t => t.merchant === 'MASTERCARD DEMO').category, C.CARD_UNDETAILED);
  a = C.analyze([ch(3), bit], { overrides: { [C.normMerchant(bit.merchant)]: C.REFUNDS } });
  assert.equal(a.total, 700); assert.equal(a.pendingIncoming.length, 0);
  // only 2 months -> not housing
  assert.equal(C.analyze([ch(3), ch(4)]).txs[0].category, C.TRANSFERS);
});
test('RiseUp catch-all falls back to our rules; תשלומים -> transfers', () => {
  const t = (merchant, srcCategory) => ({ date: '2026-03-01', merchant, amount: 50, kind: 'card', srcCategory });
  assert.equal(C.categorize(t('פארם דמו', 'הוצאות משתנות'), C.rulesFromDefaults(), {}, { preferSource: true }), 'ביטוח ובריאות');
  assert.equal(C.categorize(t('פלוני', 'תשלומים'), C.rulesFromDefaults(), {}, { preferSource: true }), C.TRANSFERS);
});
test('incoming payment-app money (bit/PayBox/Blink) is pending, salary stays income', () => {
  const r = (merchant, amount) => ({ date: '2026-03-05', chargeDate: '2026-03-05', merchant, amount, kind: 'checking', file: 'a', srcCategory: 'הכנסות משתנות' });
  const a = C.analyze([r('בלינק דמו בעמ', -700), r('PAYBOX DEMO', -50), r('משכורת חברה דמו', -9000)]);
  assert.equal(a.byMonth[0].income, 9000); assert.equal(a.pendingIncoming.length, 2);
});
