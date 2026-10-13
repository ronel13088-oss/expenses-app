import * as C from './core.js';
import * as DB from './db.js';
import { encryptBackup, decryptBackup } from './backup.js';
import { pickImporter } from './importers.js';

const S = { txs: [], rules: null, overrides: {}, merchantRules: {}, settings: { monthMode: 'charge', preferSource: true, excludeNeutral: true }, tab: 'home', month: null };
const $ = s => document.querySelector(s); const view = $('#view'); const dlg = $('#dlg');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ils = n => `<span class="num">₪ ${(n < 0 ? '-' : '') + C.fmt(Math.abs(n))}</span>`;
const HM = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const mName = m => m ? `${HM[+m.slice(5) - 1]} ${m.slice(0, 4)}` : '';
const COLORS = ['#0E3B36', '#E8A33D', '#3E8E6E', '#7FA7A0', '#D9C7A7', '#5E7B76'];

async function save() { await DB.set('state', C.backupPayload(S)); }
async function load() { const st = await DB.get('state'); if (st) Object.assign(S, st); S.rules ||= C.rulesFromDefaults(); S.merchantRules ||= {}; }
const opts = () => ({ rules: S.rules, overrides: S.overrides, monthMode: S.settings.monthMode, preferSource: S.settings.preferSource, excludeNeutral: S.settings.excludeNeutral !== false, merchantRules: S.merchantRules, span: S.txs.map(t => t.date) });
const all = () => C.analyze(S.txs, opts());
const ofMonth = m => C.analyze(S.txs.filter(t => C.monthOf(t, S.settings.monthMode) === m), opts());

function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (!S.txs.length && S.tab !== 'settings' && S.tab !== 'rules') { view.innerHTML = `<div class="empty"><h2>אין עדיין נתונים</h2><p>ייבוא קובץ CSV או Excel מ-RiseUp, מהבנק או מחברת האשראי. הקובץ נשאר בטלפון בלבד.</p></div>`; return; }
  ({ home, txs: txsView, trend, rules: rulesView, settings })[S.tab]();
}

function home() {
  const A = all(); const ms = A.months; if (!ms.includes(S.month)) S.month = ms.at(-1);
  const i = ms.indexOf(S.month), M = ofMonth(S.month), prev = i > 0 ? ofMonth(ms[i - 1]) : null;
  const diff = prev ? M.total - prev.total : null;
  const cmp = prev ? (diff <= 0 ? `<span class="good">${ils(-diff)} פחות</span> מ${HM[+ms[i - 1].slice(5) - 1]}` : `${ils(diff)} יותר מ${HM[+ms[i - 1].slice(5) - 1]}`) : '';
  const max = Math.max(1, ...M.byCategory.map(c => c.total));
  const cats = M.byCategory.map((c, k) => `<div class="bar"><span>${esc(c.key)}</span><div class="track"><div class="fill ${c.key === C.UNCAT ? 'hatch' : ''}" style="width:${Math.max(0, c.total / max * 100)}%;background:${c.key === C.UNCAT ? '' : COLORS[k % COLORS.length]}"></div></div>${ils(c.total)}</div>`).join('');
  const sav = A.savings[0];
  view.innerHTML = `<section class="hero"><div class="row"><span>${mName(S.month)}</span><small class="mmode">${S.settings.monthMode === 'charge' ? 'לפי חודש חיוב' : 'לפי חודש עסקה'}</small><span class="nav">
      <button id="prev" ${i <= 0 ? 'disabled' : ''}>› קודם</button><button id="next" ${i >= ms.length - 1 ? 'disabled' : ''}>הבא ‹</button></span></div>
    <div class="big num">₪ ${C.fmt(M.total)}</div><div class="sub">הוצאות החודש${cmp ? ' · ' + cmp : ''}${M.byMonth[0]?.partial ? ' · <b>חודש חלקי – אין נתונים לכל החודש</b>' : ''}</div></section>
    <div class="card"><h2>לפי קטגוריה <button class="link" id="cats">סה"כ ${ils(M.total)}</button></h2>${cats}</div>
    ${sav ? `<div class="card"><h2>הצעת חיסכון <button class="link" id="allsav">כל ההצעות ›</button></h2><div class="sav"><div class="ic">₪</div><div>${esc(sav.text)}.<br><span class="pos">חיסכון משוער ${ils(sav.monthly)} בחודש</span></div></div></div>` : ''}
    <div class="card"><h2>בתי עסק מובילים <button class="link" id="top10">הצג את כל ה-10 ›</button></h2>${M.top10.slice(0, 3).map(m => `<div class="li"><span>${esc(m.key)}</span>${ils(m.total)}</div>`).join('')}</div>
    ${M.excluded.length ? `<div class="card"><h2>לא נספרו פעמיים</h2><p style="font-size:14px;margin:0">${M.excluded.length} חיובי כרטיס בעו"ש הוצאו (${ils(M.excluded.reduce((s, t) => s + t.amount, 0))}), כי העסקאות עצמן כבר נספרו.${M.excluded.some(t => !t.settlement?.matched) ? ' <span class="bad">חלקם לא תואמים בסכום לחיובי הכרטיס – כנראה חסר קובץ של חלק מהכרטיסים.</span>' : ''}</p></div>` : ''}
    ${M.residuals.length ? `<div class="card"><h2>חיובי כרטיס בלי פירוט מלא</h2><p style="font-size:14px;margin:0">${M.residuals.map(t => `${esc(t.merchant)}: נספר הפער ${ils(t.residual)} (חיוב ${ils(t.amount)}, בקובץ הכרטיס ${ils(t.settlement.cardSum)})`).join('<br>')}</p></div>` : ''}
    ${M.neutral.count ? `<div class="card"><h2>השקעות והעברות בין חשבונות</h2><p style="font-size:14px;margin:0">${M.neutral.count} תנועות, נטו ${ils(M.neutral.total)}. ${M.neutral.excluded ? 'לא נספרות כהוצאה או כהכנסה.' : 'נספרות בהוצאות (לפי ההגדרות).'}</p></div>` : ''}
    ${A.reviewPayees.length ? `<div class="card"><h2>מקבלי העברות לבדיקה</h2><p style="font-size:13px;color:var(--muted)">כרגע נספרים כהוצאה. בחר קטגוריה, וההחלטה תישמר כחוק קבוע לנמען.</p>${A.reviewPayees.map((p, k) => `<div class="li"><span>${esc(p.key)}<small>${p.count} פעמים${p.fixed ? ' · הוצאה קבועה' : ''}${p.suggested ? ` · הצעה: ${esc(p.suggested)}` : ''}</small><select data-p="${k}"><option value="">להחליט…</option>${[...new Set([...C.DEFAULT_RULES.map(r => r[0]), C.HOUSING, C.TRANSFERS, C.OWN, 'השקעות'])].map(c => `<option>${esc(c)}</option>`).join('')}</select></span>${ils(p.total)}</div>`).join('')}</div>` : ''}`;
  if (A.pendingIncoming.length) view.insertAdjacentHTML('beforeend', `<div class="card"><h2>bit נכנס לבדיקה</h2><p style="font-size:13px;color:var(--muted)">לא נספר כהכנסה וגם לא כהוצאה עד שתחליט. ההחלטה נשמרת לכל שולח.</p>${A.pendingIncoming.map((p, k) => `<div class="li"><span>${esc(p.key)}<small>${p.count} פעמים</small><select data-pi="${k}"><option value="">להחליט…</option><option value="${C.INCOME}">הכנסה</option><option value="${C.REFUNDS}">החזר (מקזז הוצאה)</option></select></span>${ils(p.total)}</div>`).join('')}</div>`);
  view.querySelectorAll('select[data-pi]').forEach(s => s.onchange = async () => { if (!s.value) return; S.overrides[A.pendingIncoming[s.dataset.pi].norm] = s.value; await save(); render(); });
  view.querySelectorAll('select[data-p]').forEach(s => s.onchange = async () => { if (!s.value) return; S.overrides[A.reviewPayees[s.dataset.p].norm] = s.value; await save(); render(); });
  $('#prev').onclick = () => { S.month = ms[i - 1]; render(); }; $('#next').onclick = () => { S.month = ms[i + 1]; render(); };
  $('#top10').onclick = () => modal(`<h2>10 בתי העסק המובילים · ${mName(S.month)}</h2>${M.top10.map((m, k) => `<div class="li"><span>${k + 1}. ${esc(m.key)}<small>${m.count} עסקאות</small></span>${ils(m.total)}</div>`).join('')}<h3>כל התקופה</h3>${A.top10.map((m, k) => `<div class="li"><span>${k + 1}. ${esc(m.key)}</span>${ils(m.total)}</div>`).join('')}`);
  $('#cats').onclick = () => modal(`<h2>בתי עסק · ${mName(S.month)}</h2>${M.byMerchant.map(m => `<div class="li"><span>${esc(m.key)}<small>${m.count} עסקאות</small></span>${ils(m.total)}</div>`).join('')}`);
  if (sav) $('#allsav').onclick = savingsModal;
}
function savingsModal() {
  const A = all(); const tot = A.savings.reduce((s, x) => s + x.monthly, 0);
  modal(`<h2>הצעות חיסכון</h2><p style="font-size:13px;color:var(--muted)">הערכות לפי כללים פשוטים, לא ייעוץ. סכום = החלק שאפשר להפחית בחודש.</p>${A.savings.map(s => `<div class="li"><span><b>${esc(s.title)}</b><small>${esc(s.text)}</small></span><span class="pos">${ils(s.monthly)}</span></div>`).join('') || 'אין הצעות כרגע.'}<p>סה"כ פוטנציאל: <span class="pos">${ils(tot)} בחודש</span></p>
  <h2>מנויים וחיובים קבועים</h2>${A.recurring ? A.recurring.map(r => `<div class="li"><span>${esc(r.merchant)}<small>${r.months} חודשים · ${esc(r.category)}</small></span>${ils(r.monthly)}</div>`).join('') || 'לא זוהו.' : '<p>הזיהוי מופעל רק כשיש לפחות 3 חודשים של נתונים.</p>'}`);
}

function txsView() {
  const A = all(); const cats = [...new Set([...S.rules.map(r => r.category), ...A.txs.map(t => t.category), C.UNCAT])];
  const list = [...A.txs, ...A.dupes].filter(t => t.month === S.month || !S.month).sort((a, b) => b.date.localeCompare(a.date));
  view.innerHTML = `<div class="card"><h2>עסקאות · ${mName(S.month)}</h2><p style="font-size:13px;color:var(--muted)">שינוי קטגוריה נשמר כחוק לבית העסק הזה.</p>
  ${list.map((t, k) => `<div class="li"><span>${esc(t.merchant)}<small>${t.date.split('-').reverse().join('/')}${t.instTot > 1 ? ` · תשלום ${t.instNo}/${t.instTot}` : ''}${t.currency ? ` · ${esc(t.currency)} ${t.origAmount ?? ''}` : ''}${t.amount < 0 ? ' · זיכוי' : ''}${t.residual != null ? ' · פער לא מפורט' : ''}${t.dupOf ? ' · <b class="dup">כפילות – לא נספר</b>' : ''}</small>
   <select data-k="${k}">${cats.map(c => `<option ${c === t.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></span>${ils(t.amount)}</div>`).join('')}</div>`;
  view.querySelectorAll('select').forEach(s => s.onchange = async () => { S.overrides[C.normMerchant(list[s.dataset.k].merchant)] = s.value; await save(); render(); });
}

function trend() {
  const A = all(); const W = 340, Hh = 180, n = A.byMonth.length, mx = Math.max(1, ...A.byMonth.map(m => m.expenses)); const bw = W / n;
  const bars = A.byMonth.map((m, k) => { const h = m.expenses / mx * (Hh - 30); const x = W - (k + 1) * bw;
    return `<rect x="${x + 6}" y="${Hh - 20 - h}" width="${bw - 12}" height="${h}" rx="4" fill="${m.month === S.month ? '#E8A33D' : '#0E3B36'}"/><text x="${x + bw / 2}" y="${Hh - 5}" font-size="10" text-anchor="middle" fill="#6B7A77">${HM[+m.month.slice(5) - 1].slice(0, 3)}</text>`; }).join('');
  view.innerHTML = `<div class="card"><h2>מגמה חודשית</h2><svg viewBox="0 0 ${W} ${Hh}" width="100%">${bars}</svg>
   <div class="li"><span>ממוצע חודשי<small>${A.partialMonths.length ? 'ללא חודשים חלקיים' : ''}</small></span>${ils(A.monthlyAvg)}</div><div class="li"><span>סה"כ ${n} חודשים</span>${ils(A.total)}</div>
   <div class="li"><span>זיכויים והחזרים</span><span class="pos">${ils(A.refunds)}</span></div>
   ${A.byMonth.map(m => `<div class="li"><span>${mName(m.month)}${m.partial ? ' (חלקי)' : ''}<small>הכנסות ${ils(m.income)}</small></span>${ils(m.expenses)}</div>`).join('')}</div>
   <div class="card"><h2>קטגוריות – כל התקופה</h2>${A.byCategory.map(c => `<div class="li"><span>${esc(c.key)}</span>${ils(c.total)}</div>`).join('')}</div>
   <div class="card"><h2>מנויים וחיסכון <button class="link" id="sv">פתח ›</button></h2>${A.recurring ? `${A.recurring.length} חיובים קבועים זוהו.` : 'זיהוי מנויים יופעל אחרי 3 חודשים של נתונים.'}</div>`;
  $('#sv').onclick = savingsModal;
}

function rulesView() {
  const by = {}; S.rules.forEach((r, i) => (by[r.category] ||= []).push([r.keyword, i]));
  view.innerHTML = `<div class="card"><h2>חוקי סיווג</h2><p style="font-size:13px;color:var(--muted)">מילת מפתח שמופיעה בשם בית העסק קובעת קטגוריה. מילים ארוכות קודמות לקצרות.</p>
   <div class="grid2"><input id="kw" type="text" placeholder="מילת מפתח"><input id="cat" type="text" placeholder="קטגוריה" list="catl"></div>
   <datalist id="catl">${Object.keys(by).map(c => `<option>${esc(c)}</option>`).join('')}</datalist><p><button class="btn" id="add">הוספה</button> <button class="btn alt" id="reset">שחזור ברירת מחדל</button></p>
   ${Object.entries(by).map(([c, ks]) => `<h3>${esc(c)}</h3><div class="chips">${ks.map(([k, i]) => `<span class="chip">${esc(k)} <a href="#" data-i="${i}">✕</a></span>`).join('')}</div>`).join('')}</div>
   <div class="card"><h2>תיקונים שלך (${Object.keys(S.overrides).length})</h2>${Object.entries(S.overrides).map(([m, c]) => `<div class="li"><span>${esc(m)}<small>${esc(c)}</small></span><a href="#" data-o="${esc(m)}">מחיקה</a></div>`).join('')}</div>`;
  $('#add').onclick = async () => { const k = $('#kw').value.trim(), c = $('#cat').value.trim(); if (k && c) { S.rules.push({ keyword: k, category: c }); await save(); render(); } };
  $('#reset').onclick = async () => { if (confirm('לשחזר את חוקי ברירת המחדל?')) { S.rules = C.rulesFromDefaults(); await save(); render(); } };
  view.querySelectorAll('[data-i]').forEach(a => a.onclick = async e => { e.preventDefault(); S.rules.splice(+a.dataset.i, 1); await save(); render(); });
  view.querySelectorAll('[data-o]').forEach(a => a.onclick = async e => { e.preventDefault(); delete S.overrides[a.dataset.o]; await save(); render(); });
}

function settings() {
  view.innerHTML = `<div class="card"><h2>הגדרות</h2><p class="privacy" style="font-size:13px">🔒 כל הנתונים נשמרים רק במכשיר ולא נשלחים לשום שרת</p>
   <div class="grid2"><label>החודש של עסקה נקבע לפי</label><select id="mm"><option value="charge">תאריך החיוב</option><option value="date">תאריך העסקה</option></select>
   <label>קטגוריה מהקובץ (RiseUp) קודמת לחוקים</label><select id="ps"><option value="1">כן</option><option value="0">לא</option></select>
   <label>להוציא השקעות והעברות בין החשבונות שלי מהחישוב</label><select id="xn"><option value="1">כן</option><option value="0">לא</option></select></div>
   <p style="font-size:14px">${S.txs.length} עסקאות שמורות במכשיר בלבד.</p></div>
   <div class="card"><h2>גיבוי מוצפן</h2><div class="warn"><b>חשוב:</b> הגיבוי מוצפן בסיסמה שתבחר. אין שום דרך לשחזר סיסמה שנשכחה – אם תשכח אותה, הגיבוי אבוד לתמיד.</div>
   <p><input id="pw" type="password" placeholder="סיסמה (לפחות 8 תווים)"></p><p><button class="btn" id="bk">יצירת גיבוי</button> <button class="btn alt" id="rs">שחזור מגיבוי</button></p></div>
   <div class="card"><h2>מחיקת כל הנתונים</h2><button class="btn alt" id="wipe">מחיקה מהמכשיר</button></div>`;
  $('#mm').value = S.settings.monthMode; $('#ps').value = S.settings.preferSource ? '1' : '0';
  $('#xn').value = S.settings.excludeNeutral === false ? '0' : '1'; $('#xn').onchange = async e => { S.settings.excludeNeutral = e.target.value === '1'; await save(); };
  $('#mm').onchange = async e => { S.settings.monthMode = e.target.value; await save(); };
  $('#ps').onchange = async e => { S.settings.preferSource = e.target.value === '1'; await save(); };
  $('#bk').onclick = async () => { const pw = $('#pw').value; if (pw.length < 8) return alert('סיסמה קצרה מדי');
    if (!confirm('אם תשכח את הסיסמה, לא תהיה דרך לפתוח את הגיבוי. להמשיך?')) return;
    const blob = new Blob([await encryptBackup(C.backupPayload(S), pw)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `expenses-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
  $('#rs').onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json'; f.onchange = async () => {
    try { const o = await decryptBackup(await f.files[0].text(), $('#pw').value); C.applyBackup(S, o); await save(); alert('שוחזר'); S.tab = 'home'; render(); } catch { alert('הסיסמה שגויה או שהקובץ פגום'); } }; f.click(); };
  $('#wipe').onclick = async () => { if (confirm('למחוק את כל הנתונים מהמכשיר?')) { await DB.clearAll(); location.reload(); } };
}

function modal(html) { dlg.innerHTML = html + `<p><button class="btn" id="mclose">סגירה</button></p>`; $('#mclose').onclick = () => dlg.close(); dlg.showModal(); }

async function importFile(f) {
  const imp = pickImporter(f); const { rows, encoding } = await imp.read(f); const det = C.detectColumns(rows);
  const hdr = rows[det.headerRow] || []; const opt = i => hdr.map((h, j) => `<option value="${j}" ${i === j ? 'selected' : ''}>${esc(h || 'עמודה ' + (j + 1))}</option>`).join('');
  const F = { date: 'תאריך עסקה', chargeDate: 'תאריך חיוב', description: 'בית עסק / תיאור', amount: 'סכום', debit: 'חובה', credit: 'זכות', currency: 'מטבע', origAmount: 'סכום מקורי', instNo: 'מס׳ תשלום', instTot: 'מתוך', srctype: 'סוג מקור', src: 'חברה', card: 'כרטיס', category: 'קטגוריה' };
  return new Promise(res => {
    dlg.innerHTML = `<h2>ייבוא: ${esc(f.name)}</h2><p style="font-size:13px">קידוד: ${encoding} · ${rows.length} שורות · ${det.ok ? 'העמודות זוהו אוטומטית, אפשר לתקן' : '<span class="bad">לא כל העמודות זוהו – יש לבחור ידנית</span>'}</p>
     <div class="grid2"><label>שורת כותרת</label><input id="hr" type="text" value="${det.headerRow + 1}">
     ${Object.entries(F).map(([k, l]) => `<label>${l}</label><select data-f="${k}"><option value="">—</option>${opt(det.map[k])}</select>`).join('')}
     <label>סוג החשבון (אם אין בקובץ)</label><select id="kind"><option value="checking">עו"ש</option><option value="card">כרטיס אשראי</option></select>
     <label>הוצאות בקובץ הן</label><select id="sign"><option value="">זיהוי אוטומטי</option><option value="neg">שליליות</option><option value="pos">חיוביות</option></select></div>
     <table id="pv"></table><p><button class="btn" id="ok">ייבוא</button> <button class="btn alt" id="cancel">ביטול</button></p>`;
    const cur = () => { const map = {}; dlg.querySelectorAll('[data-f]').forEach(s => { if (s.value !== '') map[s.dataset.f] = +s.value; });
      return { headerRow: Math.max(0, (+$('#hr').value || 1) - 1), map }; };
    const pv = () => { const t = C.rowsToTransactions(rows, cur(), { kind: $('#kind').value, expenseSign: $('#sign').value || undefined, company: C.cardCompanyOf(f.name) }).slice(0, 5);
      $('#pv').innerHTML = `<tr><th>תאריך</th><th>חיוב</th><th>בית עסק</th><th>סכום</th></tr>` + t.map(x => `<tr><td>${x.date}</td><td>${x.chargeDate}</td><td>${esc(x.merchant)}</td><td>${ils(x.amount)}</td></tr>`).join(''); };
    dlg.querySelectorAll('select,input').forEach(e => e.onchange = pv); pv();
    $('#cancel').onclick = () => { dlg.close(); res(0); };
    $('#ok').onclick = async () => { const t = C.rowsToTransactions(rows, cur(), { kind: $('#kind').value, expenseSign: $('#sign').value || undefined, fileName: f.name, company: C.cardCompanyOf(f.name) });
      const dr = C.mergeRules(S.merchantRules, C.deriveSourceRules(t)); S.merchantRules = dr.rules; const m = C.mergeTransactions(S.txs, t); S.txs = C.markSettlements(m.list); await save(); dlg.close(); alert(`נוספו ${m.added} עסקאות${m.skipped ? `, ${m.skipped} כפולות דולגו` : ''}${dr.added ? `, ${dr.added} חוקי בית עסק נלמדו מהקטגוריות שבקובץ` : ''}`); res(m.added); };
    dlg.showModal();
  });
}

$('#fab').onclick = () => $('#file').click();
$('#file').onchange = async e => { for (const f of e.target.files) await importFile(f); e.target.value = ''; S.month = null; S.tab = 'home'; render(); };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) $('#ios-note').hidden = false;
if ('serviceWorker' in navigator) {
  const banner = w => { if ($('#upd')) return; const b = document.createElement('div'); b.id = 'upd'; b.className = 'note upd'; b.innerHTML = 'גרסה חדשה זמינה — <button class="link">רענן</button>';
    b.querySelector('button').onclick = () => w.postMessage('skipWaiting'); document.body.prepend(b); };
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) banner(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) banner(w); }); });
    setInterval(() => reg.update(), 60 * 60 * 1000); });
  let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
await load(); DB.persist(); render();
