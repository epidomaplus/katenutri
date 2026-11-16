import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import zlib from 'zlib';
import readline from 'readline';
import { toGreekMarket } from '../shared/greeklish.js';
import {
  matchesProductQuery, mapOffProduct, mapSeedRow, mapImportRow, offTextQueries,
  nutrientError, parseNutritionLabel, foodFromCatalogProduct, saltToSodium,
} from '../shared/products.js';
import { foodInput } from '../lib/validate.js';
import { buildTemplate, importMatrix, parseUpload } from '../lib/spreadsheet.js';

const granola = {
  code: '5202535179175',
  product_name: 'Granola Peanut butter And Dark Chocolate',
  brands: 'Healthy Habits',
  countries_tags: ['en:greece'],
  nutriments: {
    'energy-kcal_100g': 480,
    proteins_100g: 10.5,
    carbohydrates_100g: 55.2,
    sugars_100g: 17,
    fat_100g: 22,
    'saturated-fat_100g': 3.9,
    fiber_100g: 9.5,
    salt_100g: 0.03,
  },
  serving_size: '45 g',
  serving_quantity: 45,
};

test('accent-insensitive catalog search', () => {
  const p = { name: 'Γκρανόλα με σοκολάτα', brand: 'Healthy Habits', barcode: '5202535179175' };
  assert.equal(matchesProductQuery(p, 'γκρανολα'), true);
  assert.equal(matchesProductQuery(p, 'ΓΚΡΑΝΌΛΑ'), true);
  assert.equal(matchesProductQuery(p, 'healthy habits'), true);
  assert.equal(matchesProductQuery(p, 'HEALTHY'), true);
  assert.equal(matchesProductQuery(p, 'σοκολατα'), true);
  assert.equal(matchesProductQuery(p, 'ψωμι'), false);
  const sigma = { name: 'Ελιές Καλαμών', brand: '' };
  assert.equal(matchesProductQuery(sigma, 'ελιες'), true);
});

test('greeklish brand and food words, English left as written', () => {
  assert.equal(toGreekMarket('Sklavenitis').text, 'Σκλαβενίτης');
  assert.equal(toGreekMarket('AB').text, 'ΑΒ');
  assert.equal(toGreekMarket('Papadopoulou').text, 'Παπαδοπούλου');
  assert.equal(toGreekMarket('Marata').text, 'Μαράτα');
  assert.equal(toGreekMarket('fasolia').text, 'φασόλια');
  assert.equal(toGreekMarket('fasolya').text, 'φασόλια');
  assert.equal(toGreekMarket('feta').text, 'φέτα');
  assert.equal(toGreekMarket('giaourti').text, 'γιαούρτι');
  assert.equal(toGreekMarket('yiaourti').text, 'γιαούρτι');
  assert.equal(toGreekMarket('Aleifwti Me Feta').text, 'αλειφτή με φέτα');
  assert.equal(toGreekMarket('Psomi Sitou AB').text, 'ψωμί σίτου ΑΒ');
  assert.equal(toGreekMarket('AB Vassilopoulos').text, 'ΑΒ Βασιλόπουλος');
  for (const same of ['Nestlé', 'Lidl', 'Melissa', 'Agrino', 'chipita', 'butter', 'Healthy Habits', 'Peanut Butter', 'chocolate', 'granola']) {
    assert.equal(toGreekMarket(same).text, same, same);
    assert.equal(toGreekMarket(same).changed, false, same);
  }
});

test('OFF product name joins description and brand and keeps Greek sales only', () => {
  const p = mapOffProduct(granola);
  assert.equal(p.name, 'Granola Peanut butter And Dark Chocolate – Healthy Habits');
  assert.equal(p.brand, 'Healthy Habits');
  assert.equal(p.kcal, 480);
  assert.equal(p.protein, 10.5);
  assert.equal(p.carbs, 55.2);
  assert.equal(p.sugars, 17);
  assert.equal(p.fat, 22);
  assert.equal(p.saturated, 3.9);
  assert.equal(p.fiber, 9.5);
  assert.equal(p.salt, 0.03);
  assert.equal(p.servingGrams, 45);
  assert.equal(mapOffProduct({ ...granola, countries_tags: ['en:france'] }), null);
  assert.equal(mapOffProduct({ ...granola, countries_tags: ['en:france', 'en:greece'] }).barcode, '5202535179175');
  assert.equal(mapOffProduct({ ...granola, countries_tags: ['en:european-union'] }), null);
  assert.equal(mapOffProduct({ ...granola, nutriments: { 'energy-kcal_100g': 480, proteins_100g: 1 } }), null);
  const named = mapOffProduct({
    ...granola,
    product_name: '',
    generic_name: '',
    brands: 'Marata',
    categories: '',
    main_category_en: 'Yogurts',
  });
  assert.equal(named.name, 'Yogurts – Μαράτα');
  assert.equal(mapOffProduct({ ...granola, product_name: '', generic_name: '', brands: '', categories: '', main_category_en: '' }), null);
});

test('every live OFF query is limited to Greece', () => {
  const queries = offTextQueries('healthy habits granola');
  assert.ok(queries.length >= 2);
  for (const q of queries) assert.match(q, /countries_tags:"en:greece"/);
  assert.equal(offTextQueries('a').length, 0);
});

test('excel row mapping, comma decimals, and nutrient bounds', () => {
  const ok = mapImportRow({
    Barcode: '5202535179175', Όνομα: 'fasolia gigantes', Μάρκα: 'Sklavenitis',
    kcal: '116', Πρωτεΐνη: '9', Υδατάνθρακες: '20', Σάκχαρα: '1,2',
    Λιπαρά: '0,4', Κορεσμένα: '0,1', 'Φυτικές ίνες': '8', Αλάτι: '0,03',
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.name, 'φασόλια γίγαντες');
  assert.equal(ok.value.brand, 'Σκλαβενίτης');
  assert.equal(ok.value.sugars, 1.2);
  assert.equal(ok.value.saturated, 0.1);
  assert.equal(ok.value.salt, 0.03);
  assert.equal(ok.value.source, 'excel');
  const bad = mapImportRow({ Όνομα: 'Γιαούρτι', kcal: 80, Πρωτεΐνη: 8, Υδατάνθρακες: 5, Σάκχαρα: 9, Λιπαρά: 2, Κορεσμένα: 3 });
  assert.match(bad.error, /σάκχαρα|κορεσμένα/);
  assert.match(nutrientError({ carbs: 5, sugars: 9, fat: 2, saturated: 0 }), /σάκχαρα/);
  assert.match(nutrientError({ carbs: 10, sugars: 4, fat: 2, saturated: 3 }), /κορεσμένα/);
  assert.equal(nutrientError({ carbs: 10, sugars: null, fat: 2, saturated: null }), '');
  const food = foodInput({ name: 'Γιαούρτι', group: 'milk', kcal: 80, protein: 8, carbs: 5, sugars: 4, fat: 2, saturated: 1, category: 'Δικά μου' });
  assert.equal(food.value.sugars, 4);
  assert.equal(food.value.saturated, 1);
  assert.match(foodInput({ name: 'Γιαούρτι', group: 'milk', kcal: 80, protein: 8, carbs: 5, sugars: 9, fat: 2, saturated: 1 }).error, /σάκχαρα/);
});

test('label text prefills sugars under carbs and saturated fat under fat', () => {
  const v = parseNutritionLabel(`Ενέργεια 2008 kJ / 480 kcal
Λιπαρά 22 g
εκ των οποίων κορεσμένα 3,9 g
Υδατάνθρακες 55,2 g
εκ των οποίων σάκχαρα 17 g
Εδώδιμες ίνες 9,5 g
Πρωτεΐνες 10,5 g
Αλάτι 0,03 g`);
  assert.equal(v.kcal, 480);
  assert.equal(v.fat, 22);
  assert.equal(v.saturated, 3.9);
  assert.equal(v.carbs, 55.2);
  assert.equal(v.sugars, 17);
  assert.equal(v.fiber, 9.5);
  assert.equal(v.protein, 10.5);
  assert.equal(v.salt, 0.03);
});

test('adopting a product keeps per-100 g values and a usable portion', () => {
  const p = mapOffProduct(granola);
  const food = foodFromCatalogProduct(p);
  assert.equal(food.kcal, 480);
  assert.equal(food.sugars, 17);
  assert.equal(food.saturated, 3.9);
  assert.equal(food.portionGrams, 45);
  assert.equal(food.sodium, saltToSodium(0.03));
  assert.equal(food.category, 'Σούπερ μάρκετ');
  assert.ok(food.group);
});

test('template has the product columns and an instructions sheet', async () => {
  const buf = await buildTemplate();
  const matrix = await parseUpload({ filename: 't.xlsx', buffer: Buffer.from(buf) });
  assert.deepEqual(matrix[0], ['Barcode', 'Όνομα', 'Μάρκα', 'kcal', 'Πρωτεΐνη', 'Υδατάνθρακες', 'Σάκχαρα', 'Λιπαρά', 'Κορεσμένα', 'Φυτικές ίνες', 'Αλάτι']);
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('Οδηγίες'));
  assert.ok(wb.SheetNames.includes('Προϊόντα'));
  const csv = 'Barcode;Όνομα;Μάρκα;kcal;Πρωτεΐνη;Υδατάνθρακες;Σάκχαρα;Λιπαρά;Κορεσμένα;Φυτικές ίνες;Αλάτι\n5200000000012;giaourti;Marata;80;8;5;4;2;1;0;0,1\n';
  const imported = importMatrix(await parseUpload({ filename: 't.csv', buffer: Buffer.from(csv) }));
  assert.equal(imported.products.length, 1);
  assert.equal(imported.products[0].name, 'γιαούρτι');
  assert.equal(imported.products[0].brand, 'Μαράτα');
  assert.equal(imported.products[0].sugars, 4);
});

test('the approved Greek dump is 9461 products and is not imported on startup', async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(new URL('../seed/off-greece.jsonl.gz', import.meta.url)).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  let rows = 0;
  let kept = 0;
  let names = 0;
  let brands = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows += 1;
    const p = mapSeedRow(JSON.parse(line));
    if (!p) continue;
    kept += 1;
    if (p.namesConverted) names += 1;
    if (p.brandsConverted) brands += 1;
    if (p.barcode === '5202535179175') {
      assert.equal(p.name, 'Granola Peanut butter And Dark Chocolate – Healthy Habits');
      assert.equal(p.kcal, 480);
    }
  }
  assert.equal(rows, 9461);
  assert.equal(kept, 9442);
  assert.equal(names, 544);
  assert.equal(brands, 1182);
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const boot = server.slice(server.lastIndexOf('await initStore'));
  assert.doesNotMatch(boot, /startOffImport/);
  assert.match(server, /initCatalog/);
  const job = fs.readFileSync(new URL('../lib/off-job.js', import.meta.url), 'utf8');
  assert.match(job, /Δεν καλείται στην εκκίνηση/);
  assert.doesNotMatch(job, /startOffImport\(\)/);
});
