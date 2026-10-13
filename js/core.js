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
  date: /^(date|תאריך( עסקה| רכישה| הפעולה| התשלום)?|transaction.?date)$/i,
  chargeDate: /charge.?date|תאריך (ה)?חיוב|מועד חיוב|תאריך ערך/i,
  description: /^(merchant|description|תיאור|שם בית (ה)?עסק|בית עסק|פרטים|תיאור התנועה|הפעולה)$/i,
  amount: /^(amount|סכום( חיוב| החיוב)?|סכום בש"ח|סכום חיוב ₪?)$/i,
  origAmount: /^(orig|original.?amount|סכום (ה)?עסקה( המקורי)?|סכום מקורי)$/i,
  currency: /^(currency|מטבע( מקור| עסקה| חיוב)?)$/i,
  debit: /^(debit|חובה|בחובה)$/i, credit: /^(credit|זכות|בזכות)$/i,
  instNo: /^(inst_no|תשלום( מספר)?|מספר התשלום)$/i, instTot: /^(inst_tot|מתוך|מס(פר)? תשלומים( כולל)?)$/i,
  srctype: /^(srctype|סוג מקור)$/i, src: /^(src|source|חברה|מקור|אמצעי התשלום)$/i, card: /^(card|כרטיס|4 ספרות.*|אמצעי זיהוי התשלום)$/i, category: /^(category|קטגוריה( בתזרים)?|ענף)$/i,
};
export const UNCAT = 'לא מסווג', CARD_UNDETAILED = 'חיובי כרטיס ללא פירוט', HOUSING = 'דיור ושכירות', PENDING = 'לבדיקה – bit נכנס';
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
      kind, company: kind === 'card' ? (SRC_ALIASES[src] || opts.company || null) : null, card: (c => /^[\d-]{6,}$/.test(c) ? c.replace(/\D/g, '').slice(-4) : c)(String(g(r, 'card') ?? '').trim()),
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

// Dedupe: checking-account card settlement lines vs card-level data (tolerance 3% or ₪5).
// Per company+month: if the checking lines (single or combined) match the card total they are excluded.
// Otherwise the card total is consumed and only the uncovered remainder is counted (t.residual),
// so partial card files never make spending disappear. No card data for that month -> line counted in full.
export function markSettlements(txs, { tol = 0.03 } = {}) {
  const sums = {};
  for (const t of txs) if (t.kind === 'card' && t.company) { const m = monthOf(t, 'charge');
    for (const k of [t.company + '|' + m, t.company + '|' + m + '|' + t.card]) sums[k] = (sums[k] || 0) + t.amount; }
  const groups = {};
  for (const t of txs) {
    t.settlement = null; t.excluded = false; delete t.residual; delete t.dupOf;
    if (t.kind !== 'checking') continue; const co = cardCompanyOf(t.merchant); if (!co || t.amount <= 0) continue;
    (groups[co + '|' + t.date.slice(0, 7)] ||= []).push(t);
  }
  for (const [key, lines] of Object.entries(groups)) {
    const [co] = key.split('|'); const close = (s, a) => Math.abs(s - a) <= Math.max(5, Math.abs(a) * tol);
    const total = sums[key]; const cands = Object.entries(sums).filter(([k]) => k === key || k.startsWith(key + '|')).map(([, v]) => v);
    const gsum = lines.reduce((s, t) => s + t.amount, 0);
    if (total === undefined) { for (const t of lines) t.settlement = { company: co, matched: false, cardSum: null }; continue; }
    if (cands.some(v => close(v, gsum))) { for (const t of lines) { t.settlement = { company: co, matched: true, cardSum: r2(total) }; t.excluded = true; } continue; }
    let rem = total;
    for (const t of [...lines].sort((x, y) => x.amount - y.amount)) {
      const hit = cands.find(v => close(v, t.amount));
      if (hit !== undefined) { t.settlement = { company: co, matched: true, cardSum: r2(hit) }; t.excluded = true; rem -= hit; continue; }
      t.settlement = { company: co, matched: false, cardSum: r2(total) };
      if (rem > 0 && close(rem, t.amount)) { t.excluded = true; rem = 0; }
      else { const cov = Math.max(0, Math.min(rem, t.amount)); rem -= cov; if (cov > 0) t.residual = r2(t.amount - cov); }
    }
  }
  markCrossSourceDupes(txs);
  return txs;
}
// Same checking-account bit/paybox line exported by two sources (e.g. RiseUp + bank) with different wording:
// same amount, date within ±1 day, bit-like description, different file -> later file's copy is excluded.
export const BIT_RE = /(^|[^a-z])(bit|paybox|pepper ?pay|blink)([^a-z]|$)|(^|[^א-ת])(ביט|פייבוקס|בלינק|פפר ?פיי)([^א-ת]|$)/i; // payment apps // not 'לביט' (=ביטוח)
const dayNum = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
export function markCrossSourceDupes(txs) {
  const cand = txs.filter(t => !t.excluded && t.kind === 'checking' && BIT_RE.test(t.merchant));
  const used = new Set();
  for (let i = 0; i < cand.length; i++) { const a = cand[i]; if (used.has(a)) continue;
    for (let j = i + 1; j < cand.length; j++) { const b = cand[j];
      if (used.has(b) || !a.file || !b.file || a.file === b.file || a.amount !== b.amount || Math.abs(dayNum(a.date) - dayNum(b.date)) > 1) continue;
      b.excluded = true; b.dupOf = a.id; used.add(a); used.add(b); break; } }
  return txs;
}

// Derive merchant->category rules from a source file's own categories (e.g. RiseUp), via SOURCE_CATEGORY_MAP.
// Catch-alls, income and card-company lines are skipped; majority category per merchant wins. Stored on device only.
export function deriveSourceRules(txs) {
  const votes = {};
  for (const t of txs) { if (!(t.amount > 0) || cardCompanyOf(t.merchant)) continue; const c = mapSourceCategory(t.srcCategory);
    if (!c || c === INCOME || /^הכנסות/.test(c)) continue; const nm = normMerchant(t.merchant); ((votes[nm] ||= {})[c] = (votes[nm][c] || 0) + 1); }
  const out = {}; for (const [nm, v] of Object.entries(votes)) out[nm] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  return out;
}
export const mergeRules = (existing = {}, derived = {}) => { const o = { ...existing }; let added = 0; for (const [k, v] of Object.entries(derived)) if (!(k in o)) { o[k] = v; added++; } return { rules: o, added }; };
// Everything the user decided lives here; backup/restore must round-trip all of it.
export const BACKUP_KEYS = ['txs', 'rules', 'overrides', 'merchantRules', 'settings', 'hiddenInsights'];
export const backupPayload = S => Object.fromEntries(BACKUP_KEYS.map(k => [k, S[k] ?? null]));
export const applyBackup = (S, o) => { for (const k of BACKUP_KEYS) if (o[k] != null) S[k] = o[k]; return S; };

export const TRANSFERS = 'העברות ומזומן', OWN = 'העברות בין חשבונות', INCOME = 'הכנסות', REFUNDS = 'זיכויים והחזרים';
export const DEFAULT_RULES = [
  ['מזון וסופר', 'שופרסל,רמי לוי,ויקטורי,יוחננוף,מגה,טיב טעם,אושר עד,am:pm,ampm,סופר,מכולת,חצי חינם,carrefour,קרפור'],
  ['מסעדות ומשלוחים', 'wolt,וולט,תן ביס,10bis,מסעדה,מסעדת,קפה,cafe,פיצה,פיצריה,בורגר,מקדונלד,מקדונלדס,ארומה,גרג,סושי,japanika,פלאפל,שווארמה'],
  ['תחבורה ודלק', 'רב-פס,רב פס,תחבורה,פז,דלק,סונול,דור אלון,yellow,רב קו,רב-קו,gett,מוניות,pango,פנגו,סלופארק,חניון,רכבת,אגד,כביש 6'],
  ['מנויים ודיגיטל', 'netflix,spotify,apple.com,google,youtube,disney,amazon prime,openai,chatgpt,microsoft,adobe,icloud,yes,partner,פרטנר,סלקום,cellcom,פלאפון,גולן טלקום'],
  ['חשבונות הבית', 'חשמל,מי אביבים,ארנונה,עירית,עיריית,בזק,ועד בית'],
  ['ביטוח ובריאות', 'פארם,רופא,מרפאה,ביטוח,ביטוחי,בטוח,הראל,מגדל,הפניקס,כלל ביטוח,מנורה,מכבי,כללית,מאוחדת,לאומית,סופר-פארם,סופר פארם,בית מרקחת'],
  ['ביגוד וקניות', 'אופנה,אופניים,אופנים,נעליים,זארה,zara,h&m,קסטרו,terminal x,aliexpress,amazon,shein,איקאה,ikea,הום סנטר'],
  ['תיירות ונופש', 'agoda,booking,airbnb,אל על,elal,wizz,ryanair,expedia,trip.com,מלון,hotel'],
  ['עמלות בנק', 'עמלה,עמלות,ע.מפעולות,דמי ניהול חשבון,דמי כרטיס'],
  ['השקעות', 'ני"ע,ניע,מטח-קניה,מט"ח'],
  ['פנאי ובילוי', 'לייב,live,הופעה,הופעות,מוזיקה,בר,פאב,קולנוע,סינמה,תיאטרון,כרטיסים,event,eventim,goshow,לוטו,מפעל הפיס,פיס'],
  ['מסים ואגרות', 'מס הכנסה,ביטוח לאומי,אגרה,רשות המסים'],
  ['בית ותחזוקה', 'מנעולים,מנעולן,טמבור,טמבוריה,חומרי בניין,אינסטלציה,פרחים,משתלה'],
  [OWN, 'זיכוי מלאומי,העברה לחשבון שלי,העברה מחשבון שלי,העברה עצמית'],
  [TRANSFERS, 'bit,ביט,paybox,פייבוקס,העב,העברה,העברת,משיכה מבנקט,כספומט,שיק'],
];
// RiseUp (and other source) category names -> ours. null = source catch-all, treat as uncategorized.
export const SOURCE_CATEGORY_MAP = {
  'אוכל בחוץ': 'מסעדות ומשלוחים', 'סופר': 'מזון וסופר', 'תיירות': 'תיירות ונופש', 'רכב': 'תחבורה ודלק', 'תחבורה ציבורית': 'תחבורה ודלק',
  'פארמה': 'ביטוח ובריאות', 'ביטוח': 'ביטוח ובריאות', 'בריאות': 'ביטוח ובריאות', 'תקשורת': 'מנויים ודיגיטל', 'דיגיטל': 'מנויים ודיגיטל',
  'מים': 'חשבונות הבית', 'חשמל': 'חשבונות הבית', 'עמלות': 'עמלות בנק', 'שיק': TRANSFERS, 'מזומן': TRANSFERS, 'העברות': TRANSFERS,
  'חסכון חד פעמי': 'חיסכון', 'חסכון': 'חיסכון', 'הכנסות קבועות': INCOME, 'הכנסות משתנות': INCOME,
  'הוצאות משתנות': null, 'כללי': null, 'תשלומים': TRANSFERS, // RiseUp 'תשלומים' = payment-app/person payments -> payee review
};
export const mapSourceCategory = c => { if (!c) return null; const k = String(c).trim(); return k in SOURCE_CATEGORY_MAP ? SOURCE_CATEGORY_MAP[k] : k; };
// Keywords shorter than 2 chars are ignored; matching is on word boundaries. Hebrew keywords may take one
// prefix letter (ב,ה,ו,ל,מ,ש,כ) e.g. "בני"ע", but no trailing letters (so "כללית" never hits "מכללת").
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const reCache = new Map();
export function keywordRe(kw) {
  const k = normMerchant(kw); if (reCache.has(k)) return reCache.get(k);
  const heb = /^[\u0590-\u05FF]/.test(k);
  const re = k.length < 2 ? null : new RegExp(`(?:^|[^\\p{L}\\p{N}])${heb ? '[בהולמשכ]?' : ''}${esc(k)}(?![\\p{L}\\p{N}])`, 'u');
  reCache.set(k, re); return re;
}
export const keywordHit = (merchant, kw) => { const re = keywordRe(kw); return !!re && re.test(normMerchant(merchant)); };
export function rulesFromDefaults() { const r = []; for (const [cat, kws] of DEFAULT_RULES) for (const k of kws.split(',')) r.push({ category: cat, keyword: k.trim() }); return r; }
const REFUND_RE = /החזר|זיכוי|ביטול|refund/i; const NEUTRAL = new Set(['השקעות', OWN, 'חיסכון']); // never income, never expense (toggle)
// Order: user override -> keyword rules -> mapped source category -> sign fallback.
// Money in (amount<0): neutral categories (investments, transfers) stay; card credits / refund wording -> refund
// (negative expense in its category); other checking inflows -> income.
export const CASH_RE = /משיכ(ה|ת)? (מ)?(בנקט|כספומט|מזומן)|משיכת מזומן|כספומט|\batm\b/i;
export function categorize(t, rules, overrides = {}, opts = {}) {
  const nm = normMerchant(t.merchant);
  if (t.id && overrides['id:' + t.id]) return overrides['id:' + t.id];
  // Large cash withdrawal (> 1000): default household-bills category; per-transaction override wins; beats a payee-wide override (a payee decision on 'משיכה מבנקט' must not swallow large withdrawals).
  if (t.amount > 1000 && CASH_RE.test(t.merchant)) return 'חשבונות הבית';
  if (overrides[nm]) return overrides[nm];
  if (t.amount > 0 && opts.merchantRules?.[nm] && !cardCompanyOf(t.merchant)) return opts.merchantRules[nm];
  if (t.kind === 'checking' && t.amount > 0 && (cardCompanyOf(t.merchant) || /מסטרקרד|mastercard|ויזה|visa/i.test(t.merchant))) return CARD_UNDETAILED;
  if (t.amount < 0 && BIT_RE.test(t.merchant)) return PENDING; // incoming bit/PayBox: not income until decided per sender
  const sorted = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);
  let cat = null; const src = mapSourceCategory(t.srcCategory);
  if (opts.preferSource && src && src !== INCOME) cat = src;
  if (!cat) for (const r of sorted) if (r.keyword && keywordHit(nm, r.keyword)) { cat = r.category; break; }
  if (cat === 'עמלות בנק' && /החזר/.test(nm)) cat = REFUNDS;
  if (!cat && src !== INCOME) cat = src;
  if (t.amount < 0) {
    if (cat && NEUTRAL.has(cat)) return cat;
    if (cat === INCOME || cat === TRANSFERS) return INCOME;
    if (t.kind === 'card' || REFUND_RE.test(nm)) return cat && cat !== INCOME ? cat : REFUNDS;
    return INCOME;
  }
  return cat && cat !== INCOME ? cat : UNCAT;
}
const FX_HINT = /\b(agoda|aliexpress|trip\.com|booking|airbnb|expedia|amazon|ebay|temu|shein|paypal)\b|\s(?!il\b)[a-z]{2}$/i;
export const isForeignLikely = t => !!t.currency || (t.kind === 'card' && FX_HINT.test(String(t.merchant).trim()));

// excludeNeutral (default on): investments + own-account transfers are excluded from expenses and income and shown separately.
// Other transfers/cheques/bit stay expenses; their payees are listed in reviewPayees for a one-time per-payee decision (saved as override).
export function analyze(txs, { rules, overrides = {}, monthMode = 'charge', preferSource = false, excludeNeutral = true, span = null, merchantRules = null } = {}) {
  rules = rules || rulesFromDefaults();
  const live = txs.filter(t => !t.excluded).map(t => ({ ...t, amount: t.residual ?? t.amount, category: categorize(t, rules, overrides, { preferSource, merchantRules }), month: monthOf(t, monthMode) }));
  markRecurringCheques(live, overrides);
  const isInc = c => c === INCOME || /^הכנסות/.test(c); const isNeutral = c => NEUTRAL.has(c) || /^(חסכון|חיסכון)/.test(c);
  const neutral = live.filter(t => isNeutral(t.category));
  const pend = live.filter(t => t.category === PENDING);
  const exp = live.filter(t => t.category !== PENDING && !isInc(t.category) && !(excludeNeutral && isNeutral(t.category)));
  const sumBy = (arr, key) => { const o = {}; for (const t of arr) o[key(t)] = (o[key(t)] || 0) + t.amount; return o; };
  const months = [...new Set(live.map(t => t.month))].sort();
  // coverage: a month is partial if the data's date span does not cover it (allow 3 days slack at each end)
  const dates = (span || txs.map(t => t.date)).filter(Boolean).sort(); const lo = dates[0], hi = dates.at(-1);
  const partial = m => { if (!lo) return false; const [y, mo] = m.split('-').map(Number); const dim = new Date(y, mo, 0).getDate();
    const s = `${m}-04`, e = `${m}-${String(dim - 3).padStart(2, '0')}`; return lo > s || hi < e; };
  const byMonth = months.map(m => ({ month: m, partial: partial(m), expenses: r2(exp.filter(t => t.month === m).reduce((s, t) => s + t.amount, 0)),
    income: r2(-live.filter(t => t.month === m && isInc(t.category)).reduce((s, t) => s + t.amount, 0)) }));
  const full = byMonth.filter(m => !m.partial);
  const total = r2(exp.reduce((s, t) => s + t.amount, 0));
  const byCategory = Object.entries(sumBy(exp, t => t.category)).map(([k, v]) => ({ key: k, total: r2(v) })).sort((a, b) => b.total - a.total);
  const merchName = {}; exp.forEach(t => merchName[normMerchant(t.merchant)] ??= t.merchant.trim());
  const byMerchant = Object.entries(sumBy(exp, t => normMerchant(t.merchant))).map(([k, v]) => ({ key: merchName[k], norm: k, total: r2(v), count: exp.filter(t => normMerchant(t.merchant) === k).length })).sort((a, b) => b.total - a.total);
  const recurring = months.length >= 3 ? detectRecurring(exp) : null;
  const reviewPayees = byMerchant.filter(m => !overrides[m.norm] && exp.some(t => (t.category === TRANSFERS || (t.fixed && t.category === HOUSING)) && normMerchant(t.merchant) === m.norm))
    .map(m => ({ ...m, fixed: !!recurring?.some(r => r.norm === m.norm), suggested: exp.find(t => normMerchant(t.merchant) === m.norm && t.fixed) ? HOUSING : null }));
  const res = { months, byMonth, partialMonths: byMonth.filter(m => m.partial).map(m => m.month), total,
    monthlyAvg: full.length ? r2(full.reduce((s, m) => s + m.expenses, 0) / full.length) : (months.length ? r2(total / months.length) : 0),
    byCategory, byMerchant, top10: byMerchant.slice(0, 10), recurring, reviewPayees, txs: live,
    pendingIncoming: Object.values(pend.reduce((o, t) => { const k = normMerchant(t.merchant); (o[k] ||= { key: t.merchant.trim(), norm: k, total: 0, count: 0 }); o[k].total = r2(o[k].total - t.amount); o[k].count++; return o; }, {})),
    neutral: { total: r2(neutral.reduce((s, t) => s + t.amount, 0)), count: neutral.length, excluded: excludeNeutral },
    excluded: txs.filter(t => t.excluded && !t.dupOf), dupes: txs.filter(t => t.dupOf).map(t => ({ ...t, month: monthOf(t, monthMode), category: 'כפילות' })), residuals: txs.filter(t => t.residual != null),
    refunds: r2(-exp.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
    foreign: exp.filter(t => t.currency).length, foreignLikely: exp.filter(isForeignLikely).length, installments: exp.filter(t => t.instTot > 1).length };
  res.savings = suggestSavings(res);
  return res;
}
// Same-amount cheque (or standing transfer) in >=3 distinct months -> housing/fixed suggestion, unless the user decided otherwise.
export const CHEQUE_RE = /שיק|צ'ק|צק |cheque|check/i;
export function markRecurringCheques(live, overrides = {}) {
  const g = {}; for (const t of live) if (t.amount > 0 && t.category === TRANSFERS && CHEQUE_RE.test(t.merchant) && !overrides[normMerchant(t.merchant)]) (g[t.amount] ||= []).push(t);
  for (const arr of Object.values(g)) if (new Set(arr.map(t => t.date.slice(0, 7))).size >= 3) for (const t of arr) { t.category = HOUSING; t.fixed = true; }
  return live;
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

// Stage 2 insights: computed on-device only. Uses transaction month, full months only (current/partial excluded).
// "חיסכון" only for cancellable recurring charges and price increases; deviations are shown as "מעל הממוצע".
export const IRREGULAR_RE = /דיור|שכירות|חופש|טיסות|נופש|חשבונות הבית/;
export const NO_INSIGHT = new Set([CARD_UNDETAILED, TRANSFERS, UNCAT, PENDING, REFUNDS]);
export const insightKey = (type, k) => `${type}:${normMerchant(k)}`;
export function insights(txs, opt = {}, hidden = {}) {
  const A = analyze(txs, { ...opt, monthMode: 'txn' });
  const full = A.byMonth.filter(m => !m.partial).map(m => m.month);
  const out = [], push = o => { if (!hidden[o.key]) out.push(o); };
  if (full.length < 3) return { enough: false, fullMonths: full.length, items: [], irregular: [] };
  const exp = A.txs.filter(t => full.includes(t.month) && A.byCategory.some(c => c.key === t.category));
  const isIrr = t => IRREGULAR_RE.test(t.category) || (t.amount > 1000 && CASH_RE.test(t.merchant));
  const per = {}; for (const t of exp) if (!isIrr(t) && !NO_INSIGHT.has(t.category)) { (per[t.category] ||= Object.fromEntries(full.map(m => [m, 0])))[t.month] += t.amount; }
  const last = full.at(-1), base = full.slice(0, -1);
  for (const [cat, mm] of Object.entries(per)) {
    const med = median(base.map(m => mm[m])), cur = mm[last];
    if (med > 50 && cur > med * 1.2) push({ key: insightKey('over', cat), type: 'over', title: cat, text: `מעל הממוצע ב-₪${fmt(cur - med)} ב-${last}`, amount: r2(cur - med), saving: false });
  }
  const irr = {}; for (const t of exp) if (isIrr(t)) irr[t.category] = (irr[t.category] || 0) + t.amount;
  const irregular = Object.entries(irr).map(([k, v]) => ({ key: k, monthlyAvg: r2(v / full.length), yearly: r2(v / full.length * 12) }));
  const priceUp = ch => ch.length >= 3 && ch.at(-2).amount > ch[0].amount * 1.05 && ch.at(-1).amount >= ch.at(-2).amount && ch.at(-3).amount <= ch.at(-2).amount;
  for (const r of A.recurring || []) {
    const ch = exp.filter(t => normMerchant(t.merchant) === r.norm && t.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (/מנוי|דיגיטל|סטרימינג/.test(r.category) && !priceUp(ch)) push({ key: insightKey('sub', r.norm), type: 'sub', title: r.merchant, text: `חיוב קבוע: ₪${fmt(r.monthly * 12)} בשנה`, amount: r2(r.monthly * 12), saving: true });
    if (priceUp(ch)) { const first = ch[0].amount, c = ch.at(-1).amount; push({ key: insightKey('price', r.norm), type: 'price', title: r.merchant, text: `המחיר עלה מ-₪${fmt(first)} ל-₪${fmt(c)}`, amount: r2((c - first) * 12), saving: true }); }
  }
  const subs = (A.recurring || []).filter(r => /מנוי|דיגיטל|סטרימינג/.test(r.category));
  if (subs.length >= 2) push({ key: insightKey('dup', subs.map(s => s.norm).sort().join('+')), type: 'dup', title: 'כמה מנויים דיגיטליים', text: `${subs.length} מנויים דיגיטליים קבועים. כדאי לבדוק אם יש כפילות`, amount: r2(Math.min(...subs.map(s => s.monthly)) * 12), saving: true });
  if (full.length >= 2) { const p = full.at(-2); const d = Object.entries(per).map(([k, mm]) => ({ k, d: r2(mm[last] - mm[p]) })).filter(x => x.d).sort((a, b) => b.d - a.d);
    for (const x of [...d.slice(0, 3).filter(x => x.d > 0), ...d.slice(-3).filter(x => x.d < 0)]) push({ key: insightKey('mom', `${x.k}@${last}`), type: 'mom', title: x.k, text: `${x.d > 0 ? 'עלייה' : 'ירידה'} של ₪${fmt(Math.abs(x.d))} לעומת ${p}`, amount: Math.abs(x.d), saving: false }); }
  out.sort((a, b) => (b.saving - a.saving) || b.amount - a.amount);
  return { enough: true, fullMonths: full.length, items: out, irregular };
}
// Text for the user to paste into an AI chat themselves: category x month totals only, no merchants or transactions.
export function summaryText(A) {
  const full = A.byMonth.filter(m => !m.partial).map(m => m.month), cats = A.byCategory.map(c => c.key);
  const rows = cats.map(c => `${c}: ${full.map(m => `${m} ₪${fmt(A.txs.filter(t => t.month === m && t.category === c).reduce((s, t) => s + t.amount, 0))}`).join(', ')}`);
  return `סיכום הוצאות לפי קטגוריה וחודש (חודשים מלאים בלבד):\n${A.byMonth.filter(m => !m.partial).map(m => `${m.month}: הוצאות ₪${fmt(m.expenses)}, הכנסות ₪${fmt(m.income)}`).join('\n')}\n\n${rows.join('\n')}`;
}
