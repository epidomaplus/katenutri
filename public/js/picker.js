import { loadFoods, api, invalidateFoods } from './api.js';
import { modal, esc } from './util.js';
import { norm, fmt } from '/shared/text.js';
import {
  GROUPS, groupShort, portionCarbEx, portionGroupEx, PORTION_UNITS, perUnitLabel,
  resolvePortion, resolveMissingGrams,
} from '/shared/nutrition.js';

export function openFoodPicker({ title = 'Προσθήκη τροφίμου', preferences, onPick }) {
  const flags = { vegan: !!preferences?.vegan, fasting: !!preferences?.fasting, keto: !!preferences?.keto };
  let group = '';
  let q = '';
  const hint = [];
  if (flags.vegan) hint.push('vegan');
  if (flags.fasting) hint.push('νηστεία');
  if (flags.keto) hint.push('keto');
  const m = modal(`<div class="page-h" style="margin-top:0"><h2 style="margin:0">${esc(title)}</h2><button type="button" class="sm" id="x">Κλείσιμο</button></div>
    ${hint.length ? `<div class="banner info">Ενεργά ήπια φίλτρα από τον πελάτη (${esc(hint.join(', '))}). Μπορείτε να τα κλείσετε.</div>` : ''}
    <input id="q" placeholder="Αναζήτηση, π.χ. φακές, τσιπούρα, ψωμί" autocomplete="off">
    <div class="actions" style="margin-top:8px">
      <button type="button" class="sm" data-flag="vegan">Vegan</button>
      <button type="button" class="sm" data-flag="fasting">Νηστεία</button>
      <button type="button" class="sm" data-flag="keto">Keto</button>
      <select id="group"><option value="">Όλες οι ομάδες</option>${GROUPS.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</select>
    </div>
    <div class="grid-3" id="portion-fields" style="margin-top:8px">
      <div><label class="lbl">Μονάδα</label><select id="unit" required>${PORTION_UNITS.map(u => `<option value="${u.id}">${esc(u.label)}</option>`).join('')}</select></div>
      <div><label class="lbl" id="qty-lbl">Ποσότητα (g)</label><input id="qty" type="number" min="0" step="5" inputmode="decimal" placeholder="τυπική μερίδα"></div>
      <div id="equiv-wrap"><label class="lbl">Γραμμάρια</label><input id="equiv" type="number" min="0" step="1" inputmode="decimal" placeholder="αυτόματα, αν υπάρχουν"></div>
    </div>
    <p class="muted" id="portion-hint">Στα τεμάχια και τα φλιτζάνια τα γραμμάρια γεμίζουν από το τρόφιμο. Αν τα γράψετε εσείς, υπερισχύουν.</p>
    <div><label class="lbl">Σημείωση</label><input id="note" placeholder="π.χ. ώριμο"></div>
    <p class="err" id="perr"></p>
    <div class="results" id="list"></div>
    <p class="muted">Τιμές ανά 100 g, κατά προσέγγιση. 1 ισοδύναμο υδατανθράκων ≈ 15 g.</p>`);
  m.el.querySelector('#x').onclick = () => m.close();
  const paintFlags = () => {
    m.el.querySelectorAll('[data-flag]').forEach(b => b.classList.toggle('primary', flags[b.dataset.flag]));
  };
  const draw = async () => {
    const foods = await loadFoods();
    const query = norm(q).trim();
    const list = foods.filter(f => {
      if (flags.vegan && !f.vegan) return false;
      if (flags.fasting && !f.fasting) return false;
      if (flags.keto && !f.keto) return false;
      if (group && f.group !== group) return false;
      if (query && !query.split(/\s+/).every(t => norm(`${f.name} ${f.brand || ''} ${f.barcode || ''} ${f.category} ${groupShort(f.group)}`).includes(t))) return false;
      return true;
    }).slice(0, 80);
    m.el.querySelector('#list').innerHTML = list.map(f => {
      const carb = portionCarbEx(f);
      const ge = f.group === 'free' ? '' : `${fmt(portionGroupEx(f), 1)} ${groupShort(f.group)}`;
      const rates = [f.gramsPerPiece ? `${fmt(f.gramsPerPiece, 0)} g/τεμ.` : '', f.gramsPerCup ? `${fmt(f.gramsPerCup, 0)} g/φλιτζ.` : ''].filter(Boolean).join(' · ');
      return `<div class="r" data-id="${esc(f.id)}"><div><b>${esc(f.name)}</b><div class="muted">${esc(f.category)} · ${esc(f.portionLabel || '')} (${f.portionGrams} g) · ${esc(groupShort(f.group))}${f.secondaryGroup ? ' + άπαχο' : ''}${rates ? ' · ' + esc(rates) : ''}</div></div><div class="muted" style="text-align:right">${fmt(f.kcal, 0)} kcal<br>${fmt(carb, 1)} υδατ. ${ge ? '· ' + ge : ''}</div></div>`;
    }).join('') || '<p class="muted">Δεν βρέθηκαν τρόφιμα.</p>';
    m.el.querySelectorAll('.r').forEach(row => row.onclick = () => choose(list.find(f => f.id === row.dataset.id)));
  };
  const noteOf = (food, grams) => {
    const typed = m.el.querySelector('#note').value;
    if (typed) return typed;
    return grams === food.portionGrams ? (food.portionLabel || '') : '';
  };
  const finish = (food, resolved, note) => {
    onPick({
      food, grams: resolved.grams, note,
      unit: resolved.unit, quantity: resolved.quantity,
      gramsManual: resolved.gramsManual, gramsPerUnit: resolved.gramsPerUnit,
    });
    m.close();
  };
  const choose = async (food) => {
    const err = m.el.querySelector('#perr');
    const unit = m.el.querySelector('#unit').value;
    const qtyRaw = m.el.querySelector('#qty').value;
    const gramsText = unit === 'g' ? '' : m.el.querySelector('#equiv').value;
    const quantity = unit === 'g' ? (qtyRaw === '' ? food.portionGrams : Number(qtyRaw)) : qtyRaw;
    const resolved = resolvePortion({ unit, quantity, gramsText, food });
    if (resolved.needsGrams) { askGrams(food, unit, Number(quantity)); return; }
    if (!resolved.ok) { if (err) err.textContent = resolved.error; return; }
    if (err) err.textContent = '';
    finish(food, resolved, noteOf(food, resolved.grams));
  };
  const askGrams = (food, unit, quantity) => {
    const label = perUnitLabel(unit);
    const word = unit === 'cup' ? 'φλιτζάνια' : 'τεμάχια';
    const box = modal(`<h2>Γραμμάρια</h2>
      <p>Το «${esc(food.name)}» δεν έχει ${esc(label.toLocaleLowerCase('el'))}. Οι θερμίδες υπολογίζονται πάντα από γραμμάρια.</p>
      <label class="lbl">Γραμμάρια για ${esc(String(quantity))} ${esc(word)}</label>
      <input id="total" type="number" min="0" step="1" inputmode="decimal">
      <label class="lbl">${esc(label)} — αποθηκεύεται στο τρόφιμο</label>
      <input id="per" type="number" min="0" step="1" inputmode="decimal">
      <p class="muted">Συμπληρώστε ένα από τα δύο. Αν συμπληρώσετε και τα δύο, τα γραμμάρια αυτής της γραμμής υπερισχύουν και η τιμή ανά μονάδα μένει στο τρόφιμο για την επόμενη φορά.</p>
      <p class="err" id="e"></p>
      <div class="actions"><button type="button" id="cancel">Άκυρο</button><button type="button" class="primary" id="ok">Προσθήκη</button></div>`);
    box.el.querySelector('#cancel').onclick = () => box.close();
    box.el.querySelector('#ok').onclick = async () => {
      const btn = box.el.querySelector('#ok');
      const e = box.el.querySelector('#e');
      const decided = resolveMissingGrams({
        unit, quantity,
        totalGrams: box.el.querySelector('#total').value,
        perUnit: box.el.querySelector('#per').value,
      });
      if (!decided.ok) { e.textContent = decided.error; return; }
      btn.disabled = true;
      try {
        if (decided.savePerUnit) {
          const key = unit === 'cup' ? 'gramsPerCup' : 'gramsPerPiece';
          const saved = await api('/api/foods/' + food.id, { method: 'PUT', body: { ...food, [key]: decided.savePerUnit } });
          Object.assign(food, saved);
          invalidateFoods();
        }
        box.close();
        finish(food, decided, noteOf(food, decided.grams));
      } catch (ex) {
        e.textContent = ex.message;
        btn.disabled = false;
      }
    };
  };
  const syncUnit = () => {
    const unit = m.el.querySelector('#unit').value;
    const grams = unit === 'g';
    m.el.querySelector('#portion-fields').className = grams ? 'grid-2' : 'grid-3';
    m.el.querySelector('#equiv-wrap').hidden = grams;
    m.el.querySelector('#qty-lbl').textContent = grams ? 'Ποσότητα (g)' : 'Ποσότητα';
    const qty = m.el.querySelector('#qty');
    qty.step = grams ? '5' : unit === 'cup' ? '0.25' : '0.5';
    qty.placeholder = grams ? 'τυπική μερίδα' : unit === 'cup' ? 'π.χ. 1' : 'π.χ. 2';
  };
  m.el.querySelector('#unit').onchange = syncUnit;
  syncUnit();
  m.el.querySelector('#q').oninput = e => { q = e.target.value; draw(); };
  m.el.querySelector('#group').onchange = e => { group = e.target.value; draw(); };
  m.el.querySelectorAll('[data-flag]').forEach(b => b.onclick = () => { flags[b.dataset.flag] = !flags[b.dataset.flag]; paintFlags(); draw(); });
  paintFlags();
  draw();
}

export async function openRecipePicker(onPick) {
  const recipes = await api('/api/recipes');
  const m = modal(`<div class="page-h" style="margin-top:0"><h2 style="margin:0">Συνταγή ως μία γραμμή</h2><button type="button" class="sm" id="x">Κλείσιμο</button></div>
    <label class="lbl">Μερίδες που μπαίνουν στο γεύμα</label><input id="serv" type="number" min="0.25" step="0.25" value="1">
    <div class="results">${recipes.map(r => `<div class="r" data-id="${esc(r.id)}"><div><b>${esc(r.name)}</b><div class="muted">${r.servings} μερίδες συνταγής · ${fmt(r.perServing?.kcal || 0, 0)} kcal / μερίδα</div></div></div>`).join('') || '<p class="muted">Δεν υπάρχουν συνταγές.</p>'}</div>`);
  m.el.querySelector('#x').onclick = () => m.close();
  m.el.querySelectorAll('.r').forEach(row => row.onclick = () => {
    const recipe = recipes.find(r => r.id === row.dataset.id);
    onPick({ recipe, servings: Number(m.el.querySelector('#serv').value) || 1 });
    m.close();
  });
}
