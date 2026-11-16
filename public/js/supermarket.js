import { api, invalidateFoods } from './api.js';
import { esc, modal, toast } from './util.js';
import { fmt } from '/shared/text.js';
import { openBarcodeScanner } from './scan.js';
import { readNutritionLabel } from './label-ocr.js';

let query = '';
let cache = null;
let offState = { status: 'idle', catalogCount: 0 };
let poll = 0;
const byId = new Map();

function n(v) { return v == null || v === '' ? '—' : fmt(v, 1); }

function macroLine(p) {
  const sugar = p.sugars == null ? '' : `, από τους οποίους σάκχαρα ${n(p.sugars)} g`;
  const sat = p.saturated == null ? '' : `, από τα οποία κορεσμένα ${n(p.saturated)} g`;
  return `${n(p.kcal)} kcal · Π ${n(p.protein)} g · Υδατ. ${n(p.carbs)} g${sugar} · Λιπαρά ${n(p.fat)} g${sat}`
    + (p.fiber == null ? '' : ` · ίνες ${n(p.fiber)} g`)
    + (p.salt == null ? '' : ` · αλάτι ${n(p.salt)} g`)
    + ' / 100 g';
}

function offText(s) {
  const count = s.catalogCount ?? 0;
  const base = `${fmt(count, 0)} προϊόντα στον κατάλογο`;
  if (s.status === 'running') return `${base} · εισαγωγή σε εξέλιξη (γραμμή ${s.line || 0}, καταχωρίστηκαν ${s.imported || 0}).`;
  if (s.status === 'paused') return `${base} · η εισαγωγή σταμάτησε. Πατήστε συνέχεια· δεν ξαναρχίζει μόνη της.`;
  if (s.status === 'error') return `${base} · ${s.error || 'σφάλμα'}. Μπορείτε να συνεχίσετε.`;
  if (s.status === 'done') return `${base} · ολοκληρώθηκε (ονόματα σε ελληνικά ${s.namesConverted || 0}, μάρκες ${s.brandsConverted || 0}).`;
  return `${base} · η εισαγωγή από Open Food Facts δεν ξεκινά μόνη της.`;
}

function offButton(s) {
  if (s.status === 'running') return 'Εισαγωγή σε εξέλιξη';
  if (s.status === 'paused' || s.status === 'error') return 'Συνέχεια εισαγωγής';
  if (s.status === 'done') return 'Ενημέρωση από Open Food Facts';
  return 'Εισαγωγή από Open Food Facts';
}

function resultCards(data) {
  byId.clear();
  const products = data?.products || [];
  for (const p of products) byId.set(p.id || p.barcode, p);
  if (!query.trim()) return '<p class="muted">Γράψτε όνομα ή μάρκα. Η αναζήτηση δεν κοιτάζει τόνους ούτε κεφαλαία.</p>';
  if (!products.length) {
    return `<p class="muted">Δεν βρέθηκε κάτι${data?.offError ? '. ' + esc(data.offError) : '.'}</p>`;
  }
  const note = data.source === 'off'
    ? '<p class="muted">Δεν υπήρχε στον κατάλογο. Αποτελέσματα Open Food Facts μόνο για προϊόντα που πωλούνται στην Ελλάδα.</p>'
    : '';
  return note + products.map(p => {
    const id = p.id || p.barcode;
    const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" onerror="this.style.display='none'">` : '';
    return `<div class="product">${img}<div class="grow"><b>${esc(p.name)}</b><div class="muted">${esc(p.brand || '')}${p.barcode ? ' · ' + esc(p.barcode) : ''}${p.quantity ? ' · ' + esc(p.quantity) : ''}</div><div class="muted">${esc(macroLine(p))}</div></div><div class="actions"><button type="button" class="primary sm" data-act="cat-add" data-id="${esc(id)}" data-pending="${data.source === 'off' ? '1' : ''}">Προσθήκη</button><button type="button" class="sm" data-act="cat-edit" data-id="${esc(id)}" data-pending="${data.source === 'off' ? '1' : ''}">Επεξεργασία</button></div></div>`;
  }).join('');
}

export async function supermarketHtml() {
  offState = await api('/api/catalog/off-import').catch(() => offState);
  if (offState.status === 'running') watchOff();
  return `<div class="card" id="catalog-box"><div class="page-h" style="margin-top:0"><div><h2>Προϊόντα σούπερ μάρκετ</h2><p class="muted" id="off-status">${esc(offText(offState))}</p></div></div>
    <input data-input="cq" value="${esc(query)}" placeholder="Αναζήτηση, π.χ. γκρανολα, healthy habits" autocomplete="off">
    <div id="catalog-results">${cache ? resultCards(cache) : resultCards(null)}</div>
    <div class="actions" style="margin-top:10px">
      <button type="button" class="primary" data-act="off-import" ${offState.status === 'running' ? 'disabled' : ''}>${esc(offButton(offState))}</button>
      <button type="button" data-act="scan-barcode">Σάρωση barcode</button>
      <button type="button" data-act="manual-product">Χειροκίνητη καταχώριση</button>
      <a class="btn" href="/api/catalog/template">Λήψη προτύπου</a>
      <label class="btn">Εισαγωγή Excel / CSV<input data-change="import-file" type="file" accept=".xlsx,.xls,.csv,text/csv" hidden></label>
    </div>
    <p class="attrib">Δεδομένα προϊόντων: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a></p>
  </div>`;
}

function watchOff() {
  clearInterval(poll);
  poll = setInterval(async () => {
    const el = document.getElementById('off-status');
    if (!el) { clearInterval(poll); return; }
    offState = await api('/api/catalog/off-import').catch(() => offState);
    el.textContent = offText(offState);
    if (offState.status !== 'running') {
      clearInterval(poll);
      const { bus } = await import('./util.js');
      bus.refresh();
    }
  }, 2000);
}

async function addProduct(p, pending) {
  let id = p.id || p.barcode;
  if (pending) {
    const saved = await api('/api/catalog/products', { method: 'POST', body: { ...p, source: 'off' } });
    id = saved.id;
  }
  await api('/api/catalog/products/' + encodeURIComponent(id) + '/adopt', { method: 'POST' });
  invalidateFoods();
  toast('Προστέθηκε στα τρόφιμά σας. Η ομάδα ισοδυνάμου είναι εκτίμηση.');
  const { bus } = await import('./util.js');
  bus.refresh();
}

function fillNumbers(form, values) {
  for (const [k, v] of Object.entries(values || {})) {
    const input = form.elements[k];
    if (input && v != null && v !== '') input.value = String(Math.round(v * 1000) / 1000);
  }
}

export function productForm(product, { title, ocr = false } = {}) {
  const p = product || {};
  const v = (k) => esc(p[k] ?? '');
  return `<h2>${esc(title)}</h2><p class="muted">Τιμές ανά 100 g. Τα σάκχαρα και τα κορεσμένα είναι προαιρετικά.</p><form id="pf">
    <label class="lbl">Όνομα</label><input name="name" value="${v('name')}" required>
    <div class="grid-2"><div><label class="lbl">Μάρκα</label><input name="brand" value="${v('brand')}"></div><div><label class="lbl">Barcode</label><input name="barcode" value="${v('barcode')}" inputmode="numeric"></div></div>
    <label class="lbl">Ποσότητα συσκευασίας</label><input name="quantity" value="${v('quantity')}">
    <div class="grid-3">
      <div><label class="lbl">kcal</label><input name="kcal" type="number" step="any" min="0" required value="${v('kcal')}"></div>
      <div><label class="lbl">Πρωτεΐνη</label><input name="protein" type="number" step="any" min="0" required value="${v('protein')}"></div>
      <div><label class="lbl">Υδατάνθρακες</label><input name="carbs" type="number" step="any" min="0" required value="${v('carbs')}"><label class="lbl subfield">από τους οποίους σάκχαρα</label><input name="sugars" type="number" step="any" min="0" value="${v('sugars')}"></div>
      <div><label class="lbl">Λιπαρά</label><input name="fat" type="number" step="any" min="0" required value="${v('fat')}"><label class="lbl subfield">από τα οποία κορεσμένα</label><input name="saturated" type="number" step="any" min="0" value="${v('saturated')}"></div>
      <div><label class="lbl">Φυτικές ίνες</label><input name="fiber" type="number" step="any" min="0" value="${v('fiber')}"></div>
      <div><label class="lbl">Αλάτι</label><input name="salt" type="number" step="any" min="0" value="${v('salt')}"></div>
    </div>
    ${ocr ? `<div class="actions"><label class="btn">Φωτογραφία ετικέτας<input id="ocr-file" type="file" accept="image/*" capture="environment" hidden></label><span class="muted" id="ocr-status"></span></div><p class="muted">Η φωτογραφία διαβάζεται στη συσκευή σας και οι τιμές μπαίνουν για έλεγχο. Δεν αποθηκεύεται μόνη της.</p>` : ''}
    <p class="err" id="perr"></p><button class="primary" type="submit">Αποθήκευση</button>
  </form>`;
}

function openProductForm(product, { title, create }) {
  const m = modal(productForm(product, { title, ocr: true }), { wide: true });
  const form = m.el.querySelector('#pf');
  const file = m.el.querySelector('#ocr-file');
  if (file) file.onchange = async () => {
    const status = m.el.querySelector('#ocr-status');
    const f = file.files?.[0];
    if (!f) return;
    try {
      const { text, values } = await readNutritionLabel(f, (msg) => { if (status) status.textContent = msg; });
      fillNumbers(form, values);
      const found = Object.values(values).some(v => v != null);
      if (status) status.textContent = found ? 'Ελέγξτε τις τιμές πριν την αποθήκευση.' : 'Δεν αναγνωρίστηκαν τιμές. Συμπληρώστε τις χειροκίνητα.';
      if (text && status) status.title = text.slice(0, 500);
    } catch {
      if (status) status.textContent = 'Η ανάγνωση ετικέτας δεν ήταν διαθέσιμη. Συμπληρώστε τις τιμές χειροκίνητα.';
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      if (create) await api('/api/catalog/products', { method: 'POST', body });
      else await api('/api/catalog/products/' + encodeURIComponent(product.id), { method: 'PUT', body });
      toast('Το προϊόν αποθηκεύτηκε στον κατάλογο');
      m.close();
      const { bus } = await import('./util.js');
      bus.refresh();
    } catch (err) { m.el.querySelector('#perr').textContent = err.message; }
  };
}

function b64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function supermarketHandlers() {
  return {
    cq: (el) => {
      query = el.value;
      const box = document.getElementById('catalog-results');
      clearTimeout(supermarketHandlers._t);
      supermarketHandlers._t = setTimeout(async () => {
        if (!box) return;
        const q = query;
        if (!q.trim()) { cache = null; box.innerHTML = resultCards(null); return; }
        box.insertAdjacentHTML('beforeend', '');
        try {
          const data = await api('/api/catalog/search?q=' + encodeURIComponent(q));
          if (query !== q) return;
          cache = data;
          const host = document.getElementById('catalog-results');
          if (host) host.innerHTML = resultCards(data);
        } catch (err) {
          const host = document.getElementById('catalog-results');
          if (host) host.innerHTML = `<p class="err">${esc(err.message)}</p>`;
        }
      }, 320);
    },
    'cat-add': async (el) => {
      const p = byId.get(el.dataset.id);
      if (!p) return;
      try { await addProduct(p, el.dataset.pending === '1'); }
      catch (err) { toast(err.message); }
    },
    'cat-edit': (el) => {
      const p = byId.get(el.dataset.id);
      if (!p) return;
      if (el.dataset.pending === '1' || !p.id) openProductForm(p, { title: 'Καταχώριση από Open Food Facts', create: true });
      else openProductForm(p, { title: 'Επεξεργασία προϊόντος' });
    },
    'manual-product': () => openProductForm(null, { title: 'Χειροκίνητη καταχώριση', create: true }),
    'scan-barcode': async () => {
      const code = await openBarcodeScanner();
      if (!code) return;
      try {
        const data = await api('/api/catalog/barcode/' + encodeURIComponent(code));
        if (!data.product) {
          toast('Δεν βρέθηκε στον κατάλογο ούτε στο Open Food Facts για την Ελλάδα.');
          openProductForm({ barcode: code }, { title: 'Νέο προϊόν', create: true });
          return;
        }
        const p = data.product;
        const m = modal(`<h2>${esc(p.name)}</h2><p class="muted">${esc(p.brand || '')}${p.barcode ? ' · ' + esc(p.barcode) : ''}</p><p>${esc(macroLine(p))}</p><div class="actions"><button type="button" class="primary" id="scan-add">Προσθήκη</button><button type="button" id="scan-edit">Επεξεργασία</button></div>`, { wide: true });
        m.el.querySelector('#scan-add').onclick = async () => {
          try { await addProduct(p, false); m.close(); } catch (err) { toast(err.message); }
        };
        m.el.querySelector('#scan-edit').onclick = () => { m.close(); openProductForm(p, { title: 'Επεξεργασία προϊόντος' }); };
      } catch (err) { toast(err.message); }
    },
    'off-import': async () => {
      const restart = offState.status === 'done' || offState.status === 'idle';
      try {
        offState = await api('/api/catalog/off-import', { method: 'POST', body: { restart } });
        toast(restart && offState.status !== 'paused' ? 'Η εισαγωγή ξεκίνησε' : 'Συνέχεια εισαγωγής');
        watchOff();
        const { bus } = await import('./util.js');
        bus.refresh();
      } catch (err) { toast(err.message); }
    },
    'import-file': async (el) => {
      const file = el.files?.[0];
      el.value = '';
      if (!file) return;
      try {
        const data = b64(await file.arrayBuffer());
        const res = await api('/api/catalog/import', { method: 'POST', body: { filename: file.name, data } });
        toast(`Εισήχθησαν ${res.imported} προϊόντα` + (res.errorCount ? ` · ${res.errorCount} γραμμές με σφάλμα` : ''));
        if (res.errors?.length) {
          modal(`<h2>Γραμμές που δεν πέρασαν</h2><ul>${res.errors.map(e => `<li>Γραμμή ${e.row}: ${esc(e.error)}</li>`).join('')}</ul>`);
        }
        const { bus } = await import('./util.js');
        bus.refresh();
      } catch (err) { toast(err.message); }
    },
  };
}
