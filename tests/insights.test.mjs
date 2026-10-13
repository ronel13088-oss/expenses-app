import test from 'node:test'; import assert from 'node:assert';
import * as C from '../js/core.js';
const tx = (date, merchant, amount, category) => ({ id: `${date}|${merchant}|${amount}`, date, merchant, amount, kind: 'bank', sourceCategory: category });
const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
function data() { const a = [];
  months.forEach((m, i) => { a.push(tx(`${m}-05`, 'Netflix', i < 3 ? 50 : 60, 'מנויים')); a.push(tx(`${m}-06`, 'Spotify', 20, 'מנויים'));
    a.push(tx(`${m}-10`, 'סופר שופ', i === 4 ? 2000 : 1000, 'מזון')); a.push(tx(`${m}-01`, 'בעל הבית', 5000, 'דיור ושכירות')); a.push(tx(`${m}-28`, 'סופר שופ', 1, 'מזון')); a.push(tx(`${m}-01`, 'סופר שופ', 1, 'מזון')); });
  a.push(tx('2026-03-15', 'טיסה', 4000, 'טיסות')); a.push(tx('2026-06-02', 'סופר שופ', 9999, 'מזון')); return a; }
const opt = { preferSource: true, overrides: { 'בעל הבית': C.HOUSING, 'טיסה': 'חופשות וטיסות', 'netflix': 'מנויים', 'spotify': 'מנויים' } };
test('needs 3 full months', () => { assert.equal(C.insights(data().filter(t => t.date < '2026-03'), opt).enough, false); });
test('partial current month excluded; over-average not called saving', () => {
  const I = C.insights(data(), opt); const o = I.items.find(x => x.type === 'over' && x.title === 'מזון וסופר');
  assert.ok(o); assert.equal(o.saving, false); assert.match(o.text, /מעל הממוצע/); assert.ok(!I.items.some(x => /2026-06/.test(x.text)));
});
test('irregular (housing, flights) not flagged as deviation', () => {
  const I = C.insights(data(), opt); assert.ok(!I.items.some(x => x.type === 'over' && /דיור|טיסות/.test(x.title))); assert.ok(I.irregular.length >= 1);
});
test('price increase needs >5% and sustained', () => { const I = C.insights(data(), opt); const p = I.items.find(x => x.type === 'price'); assert.ok(p); assert.equal(p.saving, true); });
test('hidden insight stays hidden by stable key and is in backup', () => {
  const I = C.insights(data(), opt); const k = I.items[0].key; const J = C.insights(data(), opt, { [k]: 1 });
  assert.ok(!J.items.some(x => x.key === k)); assert.ok(C.BACKUP_KEYS.includes('hiddenInsights'));
  assert.deepEqual(C.applyBackup({}, C.backupPayload({ hiddenInsights: { [k]: 1 } })).hiddenInsights, { [k]: 1 });
});
test('summary has no merchant names', () => { const t = C.summaryText(C.analyze(data(), { ...opt, monthMode: 'txn' })); assert.ok(!/Netflix|סופר שופ|בעל הבית/.test(t)); assert.match(t, /מזון/); });
test('insights code makes no network calls', async () => { const fs = await import('node:fs'); const s = fs.readFileSync(new URL('../js/core.js', import.meta.url), 'utf8'); assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(s)); });
test('summary text is real text; telecom not a saving; no double count; meaningless cats excluded', () => {
  const t = C.summaryText(C.analyze(data(), { ...opt, monthMode: 'txn' })); assert.ok(!t.includes('[object')); assert.match(t, /2026-01: הוצאות/);
  const d = data(); C.HOUSING; ['2026-01','2026-02','2026-03','2026-04','2026-05'].forEach((m, i) => { d.push(tx(`${m}-07`, 'YES', 199, 'תקשורת')); d.push(tx(`${m}-08`, 'כרטיס', i === 4 ? 900 : 100, 'x')); });
  const I = C.insights(d, { ...opt, overrides: { ...opt.overrides, yes: 'תקשורת', 'כרטיס': C.CARD_UNDETAILED } });
  assert.ok(!I.items.some(x => x.title === 'YES' && x.saving)); assert.ok(!I.items.some(x => x.title === C.CARD_UNDETAILED));
  const keys = I.items.filter(x => x.saving && x.title === 'Netflix'); assert.equal(keys.length, 1);
});
