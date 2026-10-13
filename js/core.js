// Pure logic (no DOM). Used by the app and by node tests.
export const CARD_COMPANIES = [
  { id: 'isracard', re: /ישראכרט|isracard|אמריקן אקספרס|amex/i },
  { id: 'max', re: /מקס איט|max it|לאומי קארד|leumi ?card/i },
  { id: 'cal', re: /כאל|כרטיסי אשראי לישראל|\bcal\b/i },
  { id: 'diners', re: /דיינרס|diners/i },
];
const SRC_ALIASES = { leumicard: 'max', max: 'max', isracard: 'isracard', amex: 'isracard', cal: 'cal', diners: 'diners' };

export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^\uFEFF/, ''), encoding: 'utf-8' }; }
  catch { return { text: new TextDecoder('windows-1255').decode(u8), encoding: 'windows-1255' }; }
}

export function parseCSV(text) {
  const first = text.split(/\r?\n/).slice(0, 10).join('\n');
  const delim = [',', ';', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

const H = {
  date: /^(date|תאריך( עסקה| רכישה| הפעולה)?|transaction.?date)$/i,
  chargeDate: /charge.?date|תאריך חיוב|מועד חיוב|תאריך ערך/i,
  description: /^(merchant|description|תיאור|שם בית (ה)?עסק|בית עסק|פרטים|תיאור התנועה|הפעולה)$/i,
  amount: /^(amount|סכום( חיוב| החיוב)?|סכום בש"ח|סכום חיוב ₪?)$/i,
  origAmount: /^(orig|original.?amount|סכום (ה)?עסקה( המקורי)?|סכום מקורי)$/i,
  currency: /^(currency|מטבע( מקור| עסקה)?)$/i,
  debit: /^(debit|חובה|בחובה)$/i, credit: /^(credit|זכות|בזכות)$/i,
  instNo: /^(inst_no|תשלום( מספר)?)$/i, instTot: /^(inst_tot|מתוך|מס(פר)? תשלומים)$/i,
  srctype: /^srctype$/i, src: /^(src|source|חברה|מקור)$/i, card: /^(card|כרטיס|4 ספרות.*)$/i, category: /^(category|קטגוריה|ענף)$/i,
};
export const UNCAT = 'לא מסווג';
export const FIELDS = Object.keys(H);

export function detectColumns(rows) {
  let best = { idx: 0, score: -1, map: {} };
  rows.slice(0, 30).forEach((r, idx) => {
    const map = {}; let score = 0;
    r.forEach((h, i) => { const t = String(h ?? '').trim().replace(/\s+/g, ' ');
      for (const f of FIELDS) if (map[f] === undefined && H[f].test(t)) { map[f] = i; score++; break; } });
    if (score > best.score) best = { idx, score, map };
  });
  const m = best.map;
  if (m.description === undefined) { const i = rows[best.idx]?.findIndex(h => /תיאור|עסק|merchant/i.test(h)); if (i >= 0) m.description = i; }
  return { headerRow: best.idx, map: m, ok: m.date !== undefined && m.description !== undefined && (m.amount !== undefined || m.debit !== undefined) };
}

export function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[₪$€\s,]/g, '').replace(/[\u200e\u200f]/g, '');
  if (!s) return NaN; let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  const n = parseFloat(s); return neg ? -n : n;
}
export function parseDate(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
export const normMerchant = s => String(s ?? '').replace(/[״”“"'׳`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export function cardCompanyOf(name) { for (const c of CARD_COMPANIES) if (c.re.test(name)) return c.id; return null; }

// Importer interface: {id, label, canHandle(rows), toTransactions(rows, mapping, opts)}. Stage-2 bank importers implement the same shape.
export function rowsToTransactions(rows, det, opts = {}) {
  const { map, headerRow } = det; const out = []; const occ = {};
  const g = (r, f) => map[f] === undefined ? undefined : r[map[f]];
  const body = rows.slice(headerRow + 1);
  let rawAmts = body.map(r => map.amount !== undefined ? parseNum(g(r, 'amount')) : NaN).filter(n => !isNaN(n));
  // sign convention: if most amounts negative -> negative = expense (RiseUp). opts.expenseSign overrides.
  const expenseNeg = opts.expenseSign ? opts.expenseSign === 'neg' : rawAmts.filter(n => n < 0).length > rawAmts.length / 2;
  for (const r of body) {
    const date = parseDate(g(r, 'date')); const merchant = String(g(r, 'description') ?? '').trim();
    if (!date || !merchant) continue;
    let amount;
    if (map.amount !== undefined) { const a = parseNum(g(r, 'amount')); if (isNaN(a)) continue; amount = expenseNeg ? -a : a; }
    else { const d = parseNum(g(r, 'debit')) || 0, c = parseNum(g(r, 'credit')) || 0; if (!d && !c) continue; amount = d - c; }
    const srctypeRaw = String(g(r, 'srctype') ?? '');
    const src = String(g(r, 'src') ?? opts.source ?? '').toLowerCase();
    const kind = /credit/i.test(srctypeRaw) ? 'card' : /checking/i.test(srctypeRaw) ? 'checking' : (SRC_ALIASES[src] ? 'card' : (opts.kind || 'checking'));
    const tx = { date, chargeDate: parseDate(g(r, 'chargeDate')) || date, merchant, amount: Math.round(amount * 100) / 100,
      kind, company: kind === 'card' ? (SRC_ALIASES[src] || opts.company || null) : null, card: String(g(r, 'card') ?? ''),
      instNo: parseInt(g(r, 'instNo')) || null, instTot: parseInt(g(r, 'instTot')) || null,
      currency: String(g(r, 'currency') ?? '').trim() || null, origAmount: map.origAmount !== undefined ? Math.abs(parseNum(g(r, 'origAmount'))) || null : null,
      srcCategory: String(g(r, 'category') ?? '').trim() || null, file: opts.fileName || '' };
    if (tx.currency && /^(₪|ils|ש"?ח|nis)$/i.test(tx.currency)) tx.currency = null;
    tx.id = [tx.date, normMerchant(tx.merchant), tx.amount, tx.kind === 'card' ? tx.card : '', tx.instNo || ''].join('|');
    occ[tx.id] = (occ[tx.id] || 0) + 1; if (occ[tx.id] > 1) tx.id += '#' + occ[tx.id]; // same-day identical purchases are kept
    out.push(tx);
  }
  return out;
}
export function mergeTransactions(existing, incoming) {
  const seen = new Map(existing.map(t => [t.id, t])); let added = 0;
  for (const t of incoming) if (!seen.has(t.id)) { seen.set(t.id, t); added++; }
  return { list: [...seen.values()], added, skipped: incoming.length - added };
}
export const monthOf = (t, mode = 'charge') => (mode === 'charge' ? t.chargeDate || t.date : t.date).slice(0, 7);

// Dedupe: checking-account card settlement lines are excluded when card-level data for that company exists
// and the amount ≈ that company's card charges for the same charge month (tolerance 3% or ₪5). srctype is only a hint.
export function markSettlements(txs, { tol = 0.03 } = {}) {
  const sums = {}; const companiesWithData = new Set();
  for (const t of txs) if (t.kind === 'card' && t.company) { companiesWithData.add(t.company); const m = monthOf(t, 'charge');
    for (const k of [t.company + '|' + m, t.company + '|' + m + '|' + t.card]) sums[k] = (sums[k] || 0) + t.amount; }
  for (const t of txs) {
    t.settlement = null; t.excluded = false;
    if (t.kind !== 'checking') continue; const co = cardCompanyOf(t.merchant); if (!co) continue;
    const m = t.date.slice(0, 7); const close = s => Math.abs(s - t.amount) <= Math.max(5, Math.abs(t.amount) * tol);
    const cands = Object.entries(sums).filter(([k]) => k.startsWith(co + '|' + m)); // company total + each card's total
    const hit = cands.find(([, v]) => close(v)); const s = hit ? hit[1] : sums[co + '|' + m];
    const match = !!hit;
    t.settlement = { company: co, matched: match, cardSum: s ?? null };
    // exclude if matched, or if we have card data for this company at all (partial card coverage) -> still exclude, flagged unmatched
    t.excluded = match || companiesWithData.has(co);
  }
  return txs;
}

export const DEFAULT_RULES = [
  ['מזון וסופר', 'שופרסל,רמי לוי,ויקטורי,יוחננוף,מגה,טיב טעם,אושר עד,am:pm,ampm,סופר,מכולת,חצי חינם,carrefour,קרפור'],
  ['מסעדות ומשלוחים', 'wolt,וולט,תן ביס,10bis,מסעד,קפה,cafe,פיצה,בורגר,מקדונלד,ארומה,גרג,סושי,japanika,פלאפל,שווארמה'],
  ['תחבורה ודלק', 'פז,דלק,סונול,דור אלון,ten,yellow,רב קו,רב-קו,gett,מוניות,pango,פנגו,סלופארק,חניון,רכבת,אגד,דן ,כביש 6'],
  ['מנויים ודיגיטל', 'netflix,spotify,apple.com,google,youtube,disney,amazon prime,openai,chatgpt,microsoft,adobe,icloud,yes,hot,partner,פרטנר,סלקום,cellcom,פלאפון,גולן'],
  ['חשבונות הבית', 'חשמל,מי אביבים,מים,ארנונה,עירית,עיריית,בזק,גז,ועד בית'],
  ['ביטוח ובריאות', 'ביטוח,הראל,מגדל,הפניקס,כלל,מנורה,מכבי,כללית,מאוחדת,לאומית,סופר-פארם,סופר פארם,בית מרקחת,be '],
  ['ביגוד וקניות', 'זארה,zara,h&m,קסטרו,fox,פוקס,terminal x,aliexpress,amazon,shein,איקאה,ikea,ace,הום סנטר'],
  ['תיירות ונופש', 'agoda,booking,airbnb,אל על,elal,wizz,ryanair,expedia,מלון,hotel'],
  ['עמלות בנק', 'עמלה,ע.מפעולות,דמי ניהול חשבון,דמי כרטיס'],
  ['השקעות', 'ני"ע,ניע,מטח-קניה,מט"ח'],
  ['העברות ומזומן', 'bit,ביט,paybox,פייבוקס,העב,משיכה מבנקט,כספומט,שיק'],
];
export function rulesFromDefaults() { const r = []; for (const [cat, kws] of DEFAULT_RULES) for (const k of kws.split(',')) r.push({ category: cat, keyword: k.trim() }); return r; }
export function categorize(t, rules, overrides = {}, opts = {}) {
  const nm = normMerchant(t.merchant);
  if (overrides[nm]) return overrides[nm];
  if (t.amount < 0 && t.kind === 'checking' && !/החזר|זיכוי מ/.test(t.merchant)) return 'הכנסות';
  if (opts.preferSource && t.srcCategory) return t.srcCategory;
  const sorted = [...rules].sort((a, b) => b.keyword.length - a.keyword.length); // specific before short
  for (const r of sorted) if (r.keyword && nm.includes(normMerchant(r.keyword))) return r.category;
  return t.srcCategory || UNCAT;
}

export function analyze(txs, { rules, overrides = {}, monthMode = 'charge', preferSource = false } = {}) {
  rules = rules || rulesFromDefaults();
  const live = txs.filter(t => !t.excluded).map(t => ({ ...t, category: categorize(t, rules, overrides, { preferSource }), month: monthOf(t, monthMode) }));
  const isInc = c => /^הכנסות/.test(c); const exp = live.filter(t => !isInc(t.category) && !/^(השקעות|חסכון|חיסכון)/.test(t.category));
  const sumBy = (arr, key) => { const o = {}; for (const t of arr) o[key(t)] = (o[key(t)] || 0) + t.amount; return o; };
  const months = [...new Set(live.map(t => t.month))].sort();
  const byMonth = months.map(m => ({ month: m, expenses: r2(exp.filter(t => t.month === m).reduce((s, t) => s + t.amount, 0)),
    income: r2(-live.filter(t => t.month === m && isInc(t.category)).reduce((s, t) => s + t.amount, 0)) }));
  const total = r2(exp.reduce((s, t) => s + t.amount, 0));
  const byCategory = Object.entries(sumBy(exp, t => t.category)).map(([k, v]) => ({ key: k, total: r2(v) })).sort((a, b) => b.total - a.total);
  const merchName = {}; exp.forEach(t => merchName[normMerchant(t.merchant)] ??= t.merchant.trim());
  const byMerchant = Object.entries(sumBy(exp, t => normMerchant(t.merchant))).map(([k, v]) => ({ key: merchName[k], norm: k, total: r2(v), count: exp.filter(t => normMerchant(t.merchant) === k).length })).sort((a, b) => b.total - a.total);
  const recurring = months.length >= 3 ? detectRecurring(exp) : null;
  const res = { months, byMonth, total, monthlyAvg: months.length ? r2(total / months.length) : 0, byCategory, byMerchant, top10: byMerchant.slice(0, 10), recurring, txs: live,
    excluded: txs.filter(t => t.excluded), refunds: r2(-exp.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
    foreign: exp.filter(t => t.currency).length, installments: exp.filter(t => t.instTot > 1).length };
  res.savings = suggestSavings(res);
  return res;
}
const r2 = n => Math.round(n * 100) / 100;
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function detectRecurring(exp) {
  const g = {}; for (const t of exp) if (t.amount > 0 && !(t.instTot > 1)) (g[normMerchant(t.merchant)] ||= []).push(t);
  const out = [];
  for (const [k, arr] of Object.entries(g)) {
    const med = median(arr.map(t => t.amount));
    const near = arr.filter(t => Math.abs(t.amount - med) <= Math.max(1, med * 0.1)).sort((a, b) => a.date.localeCompare(b.date));
    const ms = new Set(near.map(t => t.month)); if (ms.size < 3) continue;
    const gaps = near.slice(1).map((t, i) => (new Date(t.date) - new Date(near[i].date)) / 864e5);
    const gm = median(gaps); if (!(gm >= 25 && gm <= 40)) continue;
    out.push({ merchant: arr[0].merchant.trim(), norm: k, category: arr[0].category, typical: r2(med), months: ms.size, monthly: r2(med) });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

export function suggestSavings(a) {
  const n = Math.max(1, a.months.length); const out = []; const cat = re => a.byCategory.filter(c => re.test(c.key)).reduce((x, c) => x + c.total, 0) / n;
  const food = cat(/מסעדות|אוכל בחוץ|משלוחים/); if (food > 400) out.push({ title: 'מסעדות ומשלוחים', text: `ממוצע ₪${fmt(food)} בחודש. הפחתה של רבע מהמשלוחים והארוחות בחוץ`, monthly: r2(food * 0.25) });
  const subs = (a.recurring || []).filter(r => /מנויים|דיגיטל|תקשורת|סטרימינג/.test(r.category));
  if (subs.length >= 2) out.push({ title: 'מנויים', text: `${subs.length} מנויים דיגיטליים קבועים. ביטול של הזול מביניהם`, monthly: Math.min(...subs.map(s => s.monthly)) });
  const fees = cat(/עמלות/); if (fees > 5) out.push({ title: 'עמלות בנק', text: `₪${fmt(fees)} בחודש בעמלות. מעבר למסלול עמלות או בקשת פטור`, monthly: r2(fees * 0.7) });
  const small = a.txs.filter(t => /am:?pm|ampm|yellow|ten|סופר יודה|קיוסק|פיצוציה/i.test(t.merchant) && t.amount > 0 && t.amount < 60);
  if (small.length / n >= 6) { const s = small.reduce((x, t) => x + t.amount, 0) / n; out.push({ title: 'קניות קטנות בחנויות נוחות', text: `${Math.round(small.length / n)} קניות קטנות בחודש. ריכוז לקנייה שבועית בסופר`, monthly: r2(s * 0.3) }); }
  const tr = cat(/תחבורה|רכב|דלק/); if (tr > 1200) out.push({ title: 'תחבורה', text: `₪${fmt(tr)} בחודש. בדיקת מועדון הנחות דלק / תחבורה ציבורית בחלק מהנסיעות`, monthly: r2(tr * 0.1) });
  return out;
}
export const fmt = n => Math.round(n).toLocaleString('en-US');
