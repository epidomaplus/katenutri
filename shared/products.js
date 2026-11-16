import { norm } from './text.js';
import { meatGroup } from './nutrition.js';
import { toGreekMarket, canonicalBrand } from './greeklish.js';

export const IMPORT_HEADERS = ['Barcode', 'Όνομα', 'Μάρκα', 'kcal', 'Πρωτεΐνη', 'Υδατάνθρακες', 'Σάκχαρα', 'Λιπαρά', 'Κορεσμένα', 'Φυτικές ίνες', 'Αλάτι'];

const HEADER_ALIASES = {
  barcode: ['barcode', 'ean', 'upc', 'γραμμωτος κωδικος', 'γραμμωτος'],
  name: ['ονομα', 'name', 'προιον'],
  brand: ['μαρκα', 'brand'],
  kcal: ['kcal', 'θερμιδες', 'ενεργεια'],
  protein: ['πρωτεινη', 'πρωτεινες', 'protein'],
  carbs: ['υδατανθρακες', 'carbs', 'carbohydrates'],
  sugars: ['σακχαρα', 'sugars'],
  fat: ['λιπαρα', 'fat'],
  saturated: ['κορεσμενα', 'saturated', 'κορεσμενα λιπαρα'],
  fiber: ['φυτικες ινες', 'fiber', 'fibre', 'ινες'],
  salt: ['αλατι', 'salt'],
};
for (const key of Object.keys(HEADER_ALIASES)) {
  HEADER_ALIASES[key] = [...new Set(HEADER_ALIASES[key].map(a => norm(a)))];
}

export function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

export function parseNutrient(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().toLowerCase().replace(/\s+/g, '');
  if (!s || s === '-' || s === '—' || s === '–') return null;
  s = s.replace(/(γρ\.?|mg|μg|µg|kcal|kj|g)$/i, '');
  s = s.replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeBarcode(v) {
  return String(v ?? '').replace(/\D/g, '').slice(0, 32);
}

export function nutrientError({ carbs, sugars, fat, saturated }) {
  if (sugars != null && carbs != null && sugars - carbs > 0.001) {
    return 'Τα σάκχαρα δεν μπορεί να είναι περισσότερα από τους υδατάνθρακες.';
  }
  if (saturated != null && fat != null && saturated - fat > 0.001) {
    return 'Τα κορεσμένα δεν μπορεί να είναι περισσότερα από τα λιπαρά.';
  }
  return '';
}

export function productSearchKey(p) {
  return norm([p?.name, p?.brand, p?.barcode, p?.searchExtra].filter(Boolean).join(' '));
}

export function matchesProductQuery(product, query) {
  const q = norm(query).trim();
  if (!q) return true;
  const hay = product?.searchKey || productSearchKey(product);
  return q.split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}

export function tokenScore(product, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const hay = product?.searchKey || productSearchKey(product);
  return tokens.filter(t => hay.includes(t)).length;
}

export function saltToSodium(salt) {
  const n = Number(salt);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 400 * 10) / 10;
}

export function inferGroup({ kcal = 0, protein = 0, carbs = 0, fat = 0 } = {}) {
  if (kcal < 15 && carbs < 2 && protein < 2 && fat < 1) return 'free';
  const cK = carbs * 4, pK = protein * 4, fK = fat * 9;
  if (carbs >= 10 && cK >= pK) return 'starch';
  if (protein >= 6 && pK >= cK && carbs < 12) return meatGroup(protein, fat);
  if (fat >= 8 && fK >= cK && fK >= pK) return 'fat';
  if (carbs >= 5) return 'starch';
  if (protein >= 4) return meatGroup(protein, fat);
  if (fat >= 3) return 'fat';
  return kcal < 40 ? 'free' : 'starch';
}

export function gramsFromServing(text) {
  const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(?:g|γρ|γραμ)/i);
  if (!m) return null;
  const n = parseNutrient(m[1]);
  if (n == null || n <= 0 || n > 5000) return null;
  return round3(n);
}

function cleanHttp(v) {
  const s = String(v || '').trim().slice(0, 500);
  if (!s) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return '';
  return s;
}

function clip(s, n) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

function optNut(v, max = 100) {
  const n = parseNutrient(v);
  if (n == null || n < 0 || n > max) return null;
  return round3(n);
}

function reqNut(v, max) {
  const n = parseNutrient(v);
  if (n == null || n < 0 || n > max) return null;
  return round3(n);
}

export function categoryLabel(categories, categoryEn) {
  const en = clip(categoryEn, 120);
  if (en && !/^[a-z]{2}:/.test(en)) return en;
  const cats = String(categories || '').split(',').map(s => s.trim()).filter(Boolean);
  const human = [...cats].reverse().find(c => c && !/^[a-z]{2}:/.test(c));
  if (human) return clip(human, 120);
  const tag = [...cats].reverse().find(c => /^[a-z]{2}:/.test(c)) || en;
  if (!tag) return '';
  return clip(tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '), 120);
}

function containsBrand(name, brand) {
  if (!name || !brand) return false;
  return norm(name).includes(norm(brand));
}

/**
 * Όνομα βιτρίνας: «περιγραφή – μάρκα».
 * Χωρίς όνομα, χρησιμοποιεί κατηγορία ή generic μαζί με τη μάρκα.
 * Χωρίς όνομα και χωρίς μάρκα επιστρέφει null.
 */
export function composeCatalogName(raw) {
  const description = clip(raw.productName || raw.product_name || raw.name || '', 180)
    || clip(raw.abbreviated || raw.abbreviated_product_name || '', 180)
    || clip(raw.genericName || raw.generic_name || '', 180);
  const brandRaw = raw.brands || raw.brand || '';
  const brandInfo = canonicalBrand(brandRaw);
  let desc = description;
  let usedCategory = false;
  if (!desc) {
    desc = categoryLabel(raw.categories, raw.categoryEn || raw.main_category_en);
    usedCategory = !!desc;
  }
  if (!desc && !brandInfo.text) return null;
  const descInfo = desc ? toGreekMarket(desc) : { text: '', changed: false };
  let name = descInfo.text;
  if (brandInfo.text && !containsBrand(name, brandInfo.text)) {
    name = name ? `${name} – ${brandInfo.text}` : brandInfo.text;
  }
  const beforeDesc = description || (usedCategory ? categoryLabel(raw.categories, raw.categoryEn || raw.main_category_en) : '');
  const beforeBrand = clip(String(brandRaw || '').split(/[,;/|]/)[0], 160);
  let before = beforeDesc;
  if (beforeBrand && !containsBrand(before, beforeBrand)) before = before ? `${before} – ${beforeBrand}` : beforeBrand;
  return {
    name: clip(name, 220),
    brand: clip(brandInfo.text, 120),
    namesConverted: !!descInfo.changed,
    brandsConverted: !!brandInfo.changed,
    before: clip(before, 220),
    after: clip(name, 220),
    searchExtra: [description, beforeBrand].filter(Boolean).join(' '),
  };
}

export function soldInGreece(raw) {
  const tags = [];
  for (const key of ['countries_tags', 'countries_hierarchy']) {
    const v = raw?.[key];
    if (Array.isArray(v)) tags.push(...v);
    else if (typeof v === 'string' && v) tags.push(...v.split(','));
  }
  return tags.some(t => String(t).trim().toLowerCase() === 'en:greece');
}

function subOrNull(value, parent) {
  if (value == null) return null;
  if (parent != null && value - parent > 0.05) return null;
  return value;
}

export function mapNutrition(raw) {
  const kcal = reqNut(raw.kcal ?? raw['energy-kcal_100g'], 1e7);
  const protein = reqNut(raw.protein ?? raw.proteins_100g, 1e7);
  const carbs = reqNut(raw.carbs ?? raw.carbohydrates_100g, 1e7);
  const fat = reqNut(raw.fat ?? raw.fat_100g, 1e7);
  if (kcal == null || protein == null || carbs == null || fat == null) return null;
  const sugars = subOrNull(optNut(raw.sugars ?? raw.sugars_100g, 1e7), carbs);
  const saturated = subOrNull(optNut(raw.saturated ?? raw['saturated-fat_100g'] ?? raw.saturated_fat, 1e7), fat);
  return {
    kcal, protein, carbs, sugars, fat, saturated,
    fiber: optNut(raw.fiber ?? raw.fiber_100g, 1e7),
    salt: optNut(raw.salt ?? raw.salt_100g, 1e7),
  };
}

function pickName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.el || v.main || v.en || '';
  return '';
}

export function mapOffProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!soldInGreece(raw)) return null;
  const barcode = normalizeBarcode(raw.code || raw._id || '');
  if (!barcode) return null;
  const nutr = raw.nutriments || {};
  const nutrition = mapNutrition({
    kcal: raw.kcal ?? nutr['energy-kcal_100g'],
    protein: raw.protein ?? nutr.proteins_100g,
    carbs: raw.carbs ?? nutr.carbohydrates_100g,
    sugars: raw.sugars ?? nutr.sugars_100g,
    fat: raw.fat ?? nutr.fat_100g,
    saturated: raw.saturated ?? nutr['saturated-fat_100g'],
    fiber: raw.fiber ?? nutr.fiber_100g,
    salt: raw.salt ?? nutr.salt_100g,
  });
  if (!nutrition) return null;
  const named = composeCatalogName({
    productName: pickName(raw.product_name_el) || pickName(raw.product_name) || raw.product_name,
    abbreviated: raw.abbreviated_product_name,
    genericName: pickName(raw.generic_name),
    brands: Array.isArray(raw.brands) ? raw.brands.filter(Boolean).join(', ') : (raw.brands || raw.brand || ''),
    categories: Array.isArray(raw.categories_tags) ? raw.categories_tags.join(', ') : (raw.categories || ''),
    categoryEn: raw.main_category_en || '',
  });
  if (!named) return null;
  const servingSize = clip(raw.serving_size || raw.servingSize || '', 80);
  let servingGrams = parseNutrient(raw.serving_quantity ?? raw.servingGrams);
  if (!(servingGrams > 0 && servingGrams <= 5000)) servingGrams = gramsFromServing(servingSize);
  const product = {
    id: barcode,
    barcode,
    name: named.name,
    brand: named.brand,
    quantity: clip(raw.quantity || '', 80),
    ...nutrition,
    servingSize,
    servingGrams: servingGrams || null,
    imageUrl: cleanHttp(raw.image_front_small_url || raw.image_small_url || raw.image_front_url || raw.image_url || raw.imageUrl),
    source: 'off',
    searchExtra: named.searchExtra,
    namesConverted: named.namesConverted,
    brandsConverted: named.brandsConverted,
    before: named.before,
    after: named.after,
  };
  product.searchKey = productSearchKey(product);
  return product;
}

/** Γραμμή της εγκεκριμένης εξαγωγής CSV (seed). */
export function mapSeedRow(raw) {
  return mapOffProduct({ ...raw, countries_tags: ['en:greece'] });
}

export function escapeLucene(s) {
  return String(s || '').replace(/[+\-!(){}[\]^"~*?:\\/]|&&|\|\|/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Κάθε ερώτημα προς το Open Food Facts περιορίζεται σε en:greece. */
export function offTextQueries(text) {
  const safe = escapeLucene(text).slice(0, 80);
  const tokens = safe.split(/\s+/).filter(t => t.length >= 2).slice(0, 6);
  if (!tokens.length) return [];
  const country = 'countries_tags:"en:greece"';
  const phrase = tokens.join(' ');
  return [...new Set([
    `${country} AND (${tokens.join(' AND ')})`,
    `${country} AND brands:"${phrase}"`,
    `${country} AND (${tokens.map(t => `brands:${t}`).join(' AND ')})`,
    `${country} AND (${tokens.join(' OR ')})`,
  ])];
}

export const OFF_USER_AGENT = 'KateNutri/1.0 (info@epidomaplus.gr)';
export const OFF_FIELDS = 'code,product_name,generic_name,abbreviated_product_name,brands,categories,categories_tags,main_category_en,quantity,nutriments,serving_size,serving_quantity,image_front_small_url,image_front_url,image_url,countries_tags';

export function offSearchUrl({ page = 1, pageSize = 24, q }) {
  const params = new URLSearchParams({ q, page: String(page), page_size: String(pageSize), fields: OFF_FIELDS });
  return 'https://search.openfoodfacts.org/search?' + params.toString();
}

export function offProductUrl(code) {
  const params = new URLSearchParams({ fields: OFF_FIELDS });
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?` + params.toString();
}

function readField(flat, field) {
  for (const alias of HEADER_ALIASES[field]) {
    if (flat[alias] !== undefined && String(flat[alias]).trim() !== '') return flat[alias];
  }
  for (const [k, v] of Object.entries(flat)) {
    if (HEADER_ALIASES[field].some(a => k === a || k.startsWith(a + ' '))) {
      if (String(v).trim() !== '') return v;
    }
  }
  return '';
}

export function mapImportRow(obj) {
  const flat = {};
  for (const [k, v] of Object.entries(obj || {})) {
    flat[norm(String(k).trim())] = v;
  }
  const body = {
    barcode: readField(flat, 'barcode'),
    name: readField(flat, 'name'),
    brand: readField(flat, 'brand'),
    kcal: readField(flat, 'kcal'),
    protein: readField(flat, 'protein'),
    carbs: readField(flat, 'carbs'),
    sugars: readField(flat, 'sugars'),
    fat: readField(flat, 'fat'),
    saturated: readField(flat, 'saturated'),
    fiber: readField(flat, 'fiber'),
    salt: readField(flat, 'salt'),
  };
  const parsed = productInput(body, 'excel');
  return parsed;
}

export function productInput(b = {}, source = 'manual') {
  // Η χειροκίνητη καταχώριση και το Excel κρατούν όνομα και μάρκα χωριστά,
  // αφού περάσουν από την ίδια μετατροπή Greeklish.
  const typedName = clip(b.name || b.product_name || '', 180);
  const brandInfo = canonicalBrand(b.brand || b.brands || '');
  const nameInfo = typedName ? toGreekMarket(typedName) : { text: '', changed: false };
  const name = nameInfo.text;
  const brand = brandInfo.text;
  if (!name && !brand) return { error: 'Χρειάζεται όνομα ή μάρκα.' };
  const display = name || brand;
  const kcal = reqNut(b.kcal, 1e7);
  const protein = reqNut(b.protein, 1e7);
  const carbs = reqNut(b.carbs, 1e7);
  const fat = reqNut(b.fat, 1e7);
  if (kcal == null || protein == null || carbs == null || fat == null) {
    return { error: 'Χρειάζονται kcal, πρωτεΐνη, υδατάνθρακες και λιπαρά ανά 100 g.' };
  }
  const sugars = optNut(b.sugars, 1e7);
  const saturated = optNut(b.saturated, 1e7);
  const err = nutrientError({ carbs, sugars, fat, saturated });
  if (err) return { error: err };
  const barcode = normalizeBarcode(b.barcode);
  const servingSize = clip(b.servingSize || b.serving_size || '', 80);
  let servingGrams = parseNutrient(b.servingGrams ?? b.serving_quantity);
  if (!(servingGrams > 0 && servingGrams <= 5000)) servingGrams = gramsFromServing(servingSize);
  const product = {
    id: barcode || clip(b.id, 40),
    barcode,
    name: display,
    brand: clip(brand, 120),
    quantity: clip(b.quantity, 80),
    kcal, protein, carbs,
    sugars: subOrNull(sugars, carbs),
    fat,
    saturated: subOrNull(saturated, fat),
    fiber: optNut(b.fiber, 1e7),
    salt: optNut(b.salt, 1e7),
    servingSize,
    servingGrams: servingGrams || null,
    imageUrl: cleanHttp(b.imageUrl || b.image_url),
    source: source === 'off' || source === 'excel' ? source : 'manual',
    searchExtra: [typedName, b.brand || b.brands || ''].filter(Boolean).join(' '),
  };
  product.searchKey = productSearchKey(product);
  return { value: product };
}

export function foodFromCatalogProduct(product) {
  const group = inferGroup(product);
  const portion = product.servingGrams || 100;
  return {
    name: product.name,
    brand: product.brand || '',
    barcode: product.barcode || '',
    category: 'Σούπερ μάρκετ',
    group,
    kcal: product.kcal,
    protein: product.protein,
    carbs: product.carbs,
    sugars: product.sugars,
    fat: product.fat,
    saturated: product.saturated,
    fiber: product.fiber || 0,
    sodium: saltToSodium(product.salt),
    calcium: 0,
    iron: 0,
    vitC: 0,
    vitD: 0,
    portionGrams: portion,
    portionLabel: clip(product.servingSize || product.quantity || '100 g', 80),
    vegan: false,
    fasting: false,
    keto: false,
    catalogId: product.id,
  };
}

const LABEL_RULES = [
  { key: 'saturated', test: /κορεσμ|saturat/ },
  { key: 'sugars', test: /σακχαρ|sugar/ },
  { key: 'fat', test: /λιπαρ|\bfat\b/ },
  { key: 'carbs', test: /υδατανθρακ|carbohydrat/ },
  { key: 'protein', test: /πρωτε|protein/ },
  { key: 'fiber', test: /ινεσ|fibre|fiber|φυτικ/ },
  { key: 'salt', test: /αλατι|\bsalt\b/ },
];

/** Κείμενο OCR ετικέτας → τιμές ανά 100 g, για έλεγχο πριν την αποθήκευση. */
export function parseNutritionLabel(text) {
  const out = {};
  const lines = String(text || '').split(/\n+/);
  for (const line0 of lines) {
    const line = line0.trim();
    if (!line) continue;
    const folded = norm(line);
    if (/ενεργ|kcal|energy/.test(folded)) {
      const kcal = line.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
      if (kcal) out.kcal = parseNutrient(kcal[1]);
      else {
        const kj = line.match(/(\d+(?:[.,]\d+)?)\s*k?j/i);
        if (kj) {
          const n = parseNutrient(kj[1]);
          if (n != null) out.kcal = round3(n / 4.184);
        }
      }
    }
    for (const rule of LABEL_RULES) {
      if (out[rule.key] != null) continue;
      if (!rule.test.test(folded)) continue;
      if (rule.key === 'fat' && /κορεσμ|saturat/.test(folded)) continue;
      if (rule.key === 'carbs' && /σακχαρ|sugar/.test(folded)) continue;
      const m = line.match(/(\d+(?:[.,]\d+)?)/);
      if (m) out[rule.key] = parseNutrient(m[1]);
    }
  }
  return out;
}
