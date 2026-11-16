import path from 'path';
import { fileURLToPath } from 'url';
import { authDiet } from './auth.js';
import { adoptCatalogProduct } from './food-records.js';
import { fetchOffBarcode, getOffStatus, liveOffEnabled, searchOffLive, startOffImport } from './off-job.js';
import { getByBarcode, getById, saveProduct, searchProducts, upsertProducts } from './catalog-store.js';
import { normalizeBarcode, productInput } from '../shared/products.js';
import { buildTemplate, importMatrix, parseUpload } from './spreadsheet.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(res, code, error) { return res.status(code).json({ error }); }

export function mountCatalog(app) {
  app.get('/vendor/html5-qrcode.min.js', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(root, 'node_modules/html5-qrcode/html5-qrcode.min.js'));
  });

  app.get('/api/catalog/search', authDiet, async (req, res) => {
    const q = String(req.query.q || '');
    try {
      const local = await searchProducts(q, 30);
      if (!q.trim() || local.matched > 0 || !liveOffEnabled()) {
        return res.json({ ...local, source: 'local', query: q });
      }
      try {
        const off = await searchOffLive(q);
        if (off.length) return res.json({ products: off, total: local.total, matched: off.length, source: 'off', query: q });
      } catch (err) {
        return res.json({ ...local, source: 'local', query: q, offError: 'Το Open Food Facts δεν απάντησε. Δοκιμάστε ξανά.' });
      }
      return res.json({ ...local, source: 'local', query: q });
    } catch (err) {
      return fail(res, 500, err.message || 'Σφάλμα αναζήτησης.');
    }
  });

  app.get('/api/catalog/barcode/:code', authDiet, async (req, res) => {
    const code = normalizeBarcode(req.params.code);
    if (!code) return fail(res, 400, 'Μη έγκυρο barcode.');
    const local = await getByBarcode(code);
    if (local) return res.json({ product: local, source: 'local' });
    try {
      const mapped = await fetchOffBarcode(code);
      if (!mapped) return res.json({ product: null, source: 'off' });
      const saved = await saveProduct(mapped);
      return res.json({ product: saved, source: 'off' });
    } catch {
      return res.json({ product: null, source: 'off', offError: 'Το Open Food Facts δεν απάντησε.' });
    }
  });

  app.post('/api/catalog/products', authDiet, async (req, res) => {
    const source = req.body?.source === 'off' ? 'off' : 'manual';
    const parsed = productInput(req.body || {}, source);
    if (parsed.error) return fail(res, 400, parsed.error);
    const saved = await saveProduct(parsed.value);
    res.json(saved);
  });

  app.put('/api/catalog/products/:id', authDiet, async (req, res) => {
    const existing = await getById(req.params.id);
    if (!existing) return fail(res, 404, 'Το προϊόν δεν βρέθηκε.');
    const parsed = productInput({ ...req.body, id: existing.id }, 'manual');
    if (parsed.error) return fail(res, 400, parsed.error);
    parsed.value.id = existing.id;
    parsed.value.source = 'manual';
    const saved = await saveProduct(parsed.value);
    res.json(saved);
  });

  app.post('/api/catalog/products/:id/adopt', authDiet, async (req, res) => {
    const product = await getById(req.params.id);
    if (!product) return fail(res, 404, 'Το προϊόν δεν βρέθηκε.');
    const out = adoptCatalogProduct(req.user.id, product);
    if (out.error) return fail(res, 400, out.error);
    res.json(out.food);
  });

  app.get('/api/catalog/template', authDiet, async (req, res) => {
    const buf = await buildTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="katenutri-proionta.xlsx"');
    res.send(Buffer.from(buf));
  });

  app.post('/api/catalog/import', authDiet, async (req, res) => {
    if (!req.body?.data) return fail(res, 400, 'Λείπει το αρχείο.');
    const buf = Buffer.from(String(req.body.data), 'base64');
    if (!buf.length || buf.length > 4_000_000) return fail(res, 400, 'Το αρχείο είναι κενό ή μεγαλύτερο από 4 MB.');
    let matrix;
    try { matrix = await parseUpload({ filename: req.body.filename, buffer: buf }); }
    catch { return fail(res, 400, 'Δεν διαβάστηκε το αρχείο. Χρησιμοποιήστε το πρότυπο Excel ή CSV.'); }
    const { products, errors } = importMatrix(matrix);
    if (products.length) await upsertProducts(products, { protectEdits: false });
    res.json({ imported: products.length, errors: errors.slice(0, 30), errorCount: errors.length });
  });

  app.get('/api/catalog/off-import', authDiet, async (req, res) => {
    res.json(await getOffStatus());
  });

  app.post('/api/catalog/off-import', authDiet, async (req, res) => {
    const status = await startOffImport({ restart: !!req.body?.restart });
    res.status(202).json(status);
  });
}
