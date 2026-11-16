import { IMPORT_HEADERS, mapImportRow } from '../shared/products.js';
import { norm } from '../shared/text.js';

const INSTRUCTIONS = [
  ['Οδηγίες εισαγωγής προϊόντων σούπερ μάρκετ'],
  [''],
  ['Συμπληρώστε το φύλλο «Προϊόντα». Μην αλλάζετε τα ονόματα των στηλών στην πρώτη γραμμή.'],
  ['Όλες οι διατροφικές τιμές είναι ανά 100 g.'],
  ['Στήλες: Barcode, Όνομα, Μάρκα, kcal, Πρωτεΐνη, Υδατάνθρακες, Σάκχαρα, Λιπαρά, Κορεσμένα, Φυτικές ίνες, Αλάτι.'],
  ['Το όνομα (ή η μάρκα), οι θερμίδες, η πρωτεΐνη, οι υδατάνθρακες και τα λιπαρά είναι υποχρεωτικά.'],
  ['Τα σάκχαρα δεν μπορεί να ξεπερνούν τους υδατάνθρακες. Τα κορεσμένα δεν μπορεί να ξεπερνούν τα λιπαρά.'],
  ['Τα σάκχαρα είναι «από τους οποίους σάκχαρα» κάτω από τους υδατάνθρακες. Τα κορεσμένα είναι «από τα οποία κορεσμένα» κάτω από τα λιπαρά.'],
  ['Το barcode είναι προαιρετικό. Αν το συμπληρώσετε, η επόμενη εισαγωγή ενημερώνει το ίδιο προϊόν.'],
  ['Οι δεκαδικοί γράφονται με κόμμα (3,9) ή με τελεία (3.9).'],
  ['Γίνεται δεκτό και CSV με τις ίδιες στήλες (κόμμα ή ερωτηματικό).'],
  ['Παράδειγμα: 5202535179175, Γκρανόλα, Healthy Habits, 480, 10,5, 55,2, 17, 22, 3,9, 9,5, 0,03.'],
  ['Το κενό πρότυπο δεν προσθέτει προϊόντα. Σβήστε ό,τι δεν θέλετε να εισαχθεί.'],
];

async function xlsx() {
  return import('xlsx');
}

export async function buildTemplate() {
  const XLSX = await xlsx();
  const wb = XLSX.utils.book_new();
  const products = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS]);
  products['!cols'] = IMPORT_HEADERS.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const help = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  help['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, products, 'Προϊόντα');
  XLSX.utils.book_append_sheet(wb, help, 'Οδηγίες');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = src.split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  return lines.map(line => splitCsvLine(line, delim));
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function importMatrix(matrix) {
  if (!matrix?.length) return { products: [], errors: [{ row: 1, error: 'Το αρχείο είναι κενό.' }] };
  const headers = (matrix[0] || []).map(h => String(h ?? '').trim());
  const products = [];
  const errors = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i] || [];
    if (line.every(c => String(c ?? '').trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = line[idx] ?? ''; });
    const mapped = mapImportRow(obj);
    if (mapped.error) errors.push({ row: i + 1, error: mapped.error });
    else products.push(mapped.value);
  }
  return { products, errors };
}

export async function parseUpload({ filename, buffer }) {
  const name = String(filename || '').toLowerCase();
  const textHead = buffer.slice(0, 400).toString('utf8');
  const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isZip && (name.endsWith('.csv') || name.endsWith('.txt') || /barcode|όνομα|ονομα/i.test(textHead))) {
    return parseCsv(buffer.toString('utf8'));
  }
  const XLSX = await xlsx();
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.find(n => norm(n).includes('προιον')) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });
}
