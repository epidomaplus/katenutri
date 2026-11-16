// Κατάλογος σούπερ μάρκετ. Δεν μπαίνει στη μνήμη του db (μπορεί να έχει χιλιάδες γραμμές).
// Postgres όταν υπάρχει DATABASE_URL, αλλιώς data/catalog.json για ανάπτυξη και δοκιμές.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { STORAGE, DATA_DIR, dbQuery, dbTx } from './store.js';
import { norm } from '../shared/text.js';
import { matchesProductQuery, productSearchKey } from '../shared/products.js';

const FILE = () => path.join(DATA_DIR, 'catalog.json');
const emptyOff = () => ({
  status: 'idle', page: 1, line: 0, imported: 0, skipped: 0, seen: 0,
  namesConverted: 0, brandsConverted: 0, examples: [],
  error: '', startedAt: null, finishedAt: null, updatedAt: null,
});
let mem = { products: [], off: emptyOff() };

export async function initCatalog() {
  if (STORAGE === 'postgres') return;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    mem = {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      off: { ...emptyOff(), ...(parsed.off || {}) },
    };
  } catch {
    mem = { products: [], off: emptyOff() };
  }
}

function persistJson() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(mem));
  fs.renameSync(tmp, FILE());
}

function rowToProduct(r) {
  return {
    id: r.id,
    barcode: r.barcode || '',
    name: r.name,
    brand: r.brand || '',
    quantity: r.quantity || '',
    kcal: Number(r.kcal),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    sugars: r.sugars == null ? null : Number(r.sugars),
    fat: Number(r.fat),
    saturated: r.saturated_fat == null ? null : Number(r.saturated_fat),
    fiber: r.fiber == null ? null : Number(r.fiber),
    salt: r.salt == null ? null : Number(r.salt),
    servingSize: r.serving_size || '',
    servingGrams: r.serving_grams == null ? null : Number(r.serving_grams),
    imageUrl: r.image_url || '',
    source: r.source || 'manual',
    searchKey: r.search_key || '',
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : (r.updated_at || null),
  };
}

const SELECT = `id, barcode, name, brand, quantity, kcal, protein, carbs, sugars, fat,
  saturated_fat, fiber, salt, serving_size, serving_grams, image_url, source, search_key, updated_at`;

function likeToken(t) {
  return '%' + String(t).replace(/[\\%_]/g, ch => '\\' + ch) + '%';
}

export async function countProducts() {
  if (STORAGE !== 'postgres') return mem.products.length;
  const { rows } = await dbQuery('SELECT count(*)::int AS n FROM supermarket_products');
  return rows[0].n;
}

export async function searchProducts(query, limit = 30) {
  const q = String(query || '');
  const tokens = norm(q).trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (STORAGE !== 'postgres') {
    const list = tokens.length ? mem.products.filter(p => matchesProductQuery(p, q)) : [];
    return { products: list.slice(0, limit), total: mem.products.length, matched: list.length };
  }
  const total = await countProducts();
  if (!tokens.length) return { products: [], total, matched: 0 };
  const params = [];
  const wheres = tokens.map(t => {
    params.push(likeToken(t));
    return `search_key LIKE $${params.length} ESCAPE '\\'`;
  });
  const where = wheres.join(' AND ');
  const matched = await dbQuery(`SELECT count(*)::int AS n FROM supermarket_products WHERE ${where}`, params);
  params.push(limit);
  const { rows } = await dbQuery(
    `SELECT ${SELECT} FROM supermarket_products WHERE ${where} ORDER BY name LIMIT $${params.length}`,
    params
  );
  return { products: rows.map(rowToProduct), total, matched: matched.rows[0].n };
}

export async function getByBarcode(code) {
  if (!code) return null;
  if (STORAGE !== 'postgres') return mem.products.find(p => p.barcode === code || p.id === code) || null;
  const { rows } = await dbQuery(`SELECT ${SELECT} FROM supermarket_products WHERE barcode = $1 OR id = $1 LIMIT 1`, [code]);
  return rows[0] ? rowToProduct(rows[0]) : null;
}

export async function getById(id) {
  if (!id) return null;
  if (STORAGE !== 'postgres') return mem.products.find(p => p.id === id) || null;
  const { rows } = await dbQuery(`SELECT ${SELECT} FROM supermarket_products WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ? rowToProduct(rows[0]) : null;
}

function dedupe(list) {
  const m = new Map();
  for (const p of list) m.set(p.barcode || p.id, p);
  return [...m.values()];
}

export function newProductId() {
  return 'm_' + crypto.randomBytes(9).toString('base64url');
}

export async function saveProduct(input) {
  const existing = input.barcode ? await getByBarcode(input.barcode) : (input.id ? await getById(input.id) : null);
  const product = {
    ...input,
    id: existing?.id || input.id || input.barcode || newProductId(),
    source: input.source || existing?.source || 'manual',
    searchKey: input.searchKey || productSearchKey(input),
    updatedAt: new Date().toISOString(),
  };
  await upsertProducts([product], { protectEdits: false });
  return (await getById(product.id)) || product;
}

export async function upsertProducts(list, { protectEdits = false } = {}) {
  const rows = dedupe(list).filter(p => p && p.name && p.id);
  if (!rows.length) return 0;
  if (STORAGE !== 'postgres') {
    for (const p of rows) {
      const idx = mem.products.findIndex(x => (p.barcode && x.barcode === p.barcode) || x.id === p.id);
      if (idx >= 0) {
        if (protectEdits && mem.products[idx].source && mem.products[idx].source !== 'off') continue;
        mem.products[idx] = { ...mem.products[idx], ...p, id: mem.products[idx].id };
      } else mem.products.push(p);
    }
    persistJson();
    return rows.length;
  }
  const payload = JSON.stringify(rows.map(p => ({
    id: p.id,
    barcode: p.barcode || '',
    name: p.name,
    brand: p.brand || '',
    quantity: p.quantity || '',
    kcal: p.kcal,
    protein: p.protein,
    carbs: p.carbs,
    sugars: p.sugars == null ? null : p.sugars,
    fat: p.fat,
    saturated: p.saturated == null ? null : p.saturated,
    fiber: p.fiber == null ? null : p.fiber,
    salt: p.salt == null ? null : p.salt,
    servingSize: p.servingSize || '',
    servingGrams: p.servingGrams == null ? null : p.servingGrams,
    imageUrl: p.imageUrl || '',
    source: p.source || 'off',
    searchKey: p.searchKey || productSearchKey(p),
  })));
  await dbTx(async (q) => {
    await q(
      `UPDATE supermarket_products AS t SET
         name = x.name, brand = x.brand, quantity = x.quantity,
         kcal = x.kcal, protein = x.protein, carbs = x.carbs, sugars = x.sugars,
         fat = x.fat, saturated_fat = x.saturated, fiber = x.fiber, salt = x.salt,
         serving_size = x.serving_size, serving_grams = x.serving_grams,
         image_url = x.image_url, source = x.source, search_key = x.search_key, updated_at = now()
       FROM (
         SELECT x->>'id' AS id, NULLIF(x->>'barcode','') AS barcode, x->>'name' AS name,
           COALESCE(x->>'brand','') AS brand, COALESCE(x->>'quantity','') AS quantity,
           (x->>'kcal')::float8 AS kcal, (x->>'protein')::float8 AS protein, (x->>'carbs')::float8 AS carbs,
           NULLIF(x->>'sugars','')::float8 AS sugars, (x->>'fat')::float8 AS fat,
           NULLIF(x->>'saturated','')::float8 AS saturated, NULLIF(x->>'fiber','')::float8 AS fiber,
           NULLIF(x->>'salt','')::float8 AS salt, COALESCE(x->>'servingSize','') AS serving_size,
           NULLIF(x->>'servingGrams','')::float8 AS serving_grams, COALESCE(x->>'imageUrl','') AS image_url,
           COALESCE(NULLIF(x->>'source',''),'off') AS source, COALESCE(x->>'searchKey','') AS search_key
         FROM jsonb_array_elements($1::jsonb) AS x
       ) AS x
       WHERE ((x.barcode IS NOT NULL AND t.barcode = x.barcode) OR t.id = x.id)
         AND ($2::bool = false OR t.source = 'off')`,
      [payload, protectEdits]
    );
    await q(
      `INSERT INTO supermarket_products (
         id, barcode, name, brand, quantity, kcal, protein, carbs, sugars, fat, saturated_fat, fiber, salt,
         serving_size, serving_grams, image_url, source, search_key, updated_at)
       SELECT x.id, x.barcode, x.name, x.brand, x.quantity, x.kcal, x.protein, x.carbs, x.sugars, x.fat,
         x.saturated, x.fiber, x.salt, x.serving_size, x.serving_grams, x.image_url, x.source, x.search_key, now()
       FROM (
         SELECT x->>'id' AS id, NULLIF(x->>'barcode','') AS barcode, x->>'name' AS name,
           COALESCE(x->>'brand','') AS brand, COALESCE(x->>'quantity','') AS quantity,
           (x->>'kcal')::float8 AS kcal, (x->>'protein')::float8 AS protein, (x->>'carbs')::float8 AS carbs,
           NULLIF(x->>'sugars','')::float8 AS sugars, (x->>'fat')::float8 AS fat,
           NULLIF(x->>'saturated','')::float8 AS saturated, NULLIF(x->>'fiber','')::float8 AS fiber,
           NULLIF(x->>'salt','')::float8 AS salt, COALESCE(x->>'servingSize','') AS serving_size,
           NULLIF(x->>'servingGrams','')::float8 AS serving_grams, COALESCE(x->>'imageUrl','') AS image_url,
           COALESCE(NULLIF(x->>'source',''),'off') AS source, COALESCE(x->>'searchKey','') AS search_key
         FROM jsonb_array_elements($1::jsonb) AS x
       ) AS x
       WHERE NOT EXISTS (
         SELECT 1 FROM supermarket_products t
         WHERE t.id = x.id OR (x.barcode IS NOT NULL AND t.barcode = x.barcode)
       )
       ON CONFLICT (id) DO UPDATE SET
         barcode = EXCLUDED.barcode, name = EXCLUDED.name, brand = EXCLUDED.brand, quantity = EXCLUDED.quantity,
         kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, carbs = EXCLUDED.carbs, sugars = EXCLUDED.sugars,
         fat = EXCLUDED.fat, saturated_fat = EXCLUDED.saturated_fat, fiber = EXCLUDED.fiber, salt = EXCLUDED.salt,
         serving_size = EXCLUDED.serving_size, serving_grams = EXCLUDED.serving_grams, image_url = EXCLUDED.image_url,
         source = EXCLUDED.source, search_key = EXCLUDED.search_key, updated_at = now()`,
      [payload]
    );
  });
  return rows.length;
}

export async function readOffState() {
  if (STORAGE !== 'postgres') return { ...emptyOff(), ...mem.off };
  try {
    const { rows } = await dbQuery(`SELECT value FROM schema_meta WHERE key = 'off_import'`);
    if (!rows[0]) return emptyOff();
    return { ...emptyOff(), ...JSON.parse(rows[0].value) };
  } catch {
    return emptyOff();
  }
}

export async function writeOffState(state) {
  const next = { ...emptyOff(), ...state, updatedAt: new Date().toISOString() };
  if (STORAGE !== 'postgres') {
    mem.off = next;
    persistJson();
    return next;
  }
  await dbQuery(
    `INSERT INTO schema_meta (key, value) VALUES ('off_import', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(next)]
  );
  return next;
}
