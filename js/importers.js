// Importer registry. Each importer: { id, label, accepts(file) , read(file) -> Promise<{rows, encoding}> }.
// Stage 2 (auto bank import) adds an importer whose read() returns rows/transactions from a bank connector; UI and DB stay unchanged.
import { decodeBytes, parseCSV } from './core.js';
export const importers = [
  { id: 'csv', label: 'CSV', accepts: f => /\.(csv|txt)$/i.test(f.name),
    async read(f) { const { text, encoding } = decodeBytes(await f.arrayBuffer()); return { rows: parseCSV(text), encoding }; } },
  { id: 'sheet', label: 'Excel', accepts: f => /\.(xlsx?|html?)$/i.test(f.name),
    async read(f) { const buf = await f.arrayBuffer(); const u8 = new Uint8Array(buf);
      // Hapoalim "xls" is often HTML; decode text ourselves to get cp1255 right
      const head = new TextDecoder('latin1').decode(u8.slice(0, 200));
      const wb = /<(html|table|!doctype)/i.test(head) ? XLSX.read(decodeBytes(u8).text, { type: 'string', cellDates: true }) : XLSX.read(u8, { type: 'array', cellDates: true, codepage: 1255 });
      const ws = wb.Sheets[wb.SheetNames[0]]; return { rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), encoding: 'xlsx' }; } },
];
export const pickImporter = f => importers.find(i => i.accepts(f)) || importers[0];
