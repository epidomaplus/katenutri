import { loadFoods, api } from './api.js';
import { modal, esc } from './util.js';
import { norm, fmt } from '/shared/text.js';
import { GROUPS, groupShort, portionCarbEx, portionGroupEx } from '/shared/nutrition.js';

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
    <div class="grid-2" style="margin-top:8px">
      <div><label class="lbl">Ποσότητα (g)</label><input id="grams" type="number" min="0" step="5" placeholder="τυπική μερίδα"></div>
      <div><label class="lbl">Σημείωση</label><input id="note" placeholder="π.χ. 1 φέτα"></div>
    </div>
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
      if (query && !query.split(/\s+/).every(t => norm(`${f.name} ${f.category} ${groupShort(f.group)}`).includes(t))) return false;
      return true;
    }).slice(0, 80);
    m.el.querySelector('#list').innerHTML = list.map(f => {
      const carb = portionCarbEx(f);
      const ge = f.group === 'free' ? '' : `${fmt(portionGroupEx(f), 1)} ${groupShort(f.group)}`;
      return `<div class="r" data-id="${esc(f.id)}"><div><b>${esc(f.name)}</b><div class="muted">${esc(f.category)} · ${esc(f.portionLabel || '')} (${f.portionGrams} g) · ${esc(groupShort(f.group))}${f.secondaryGroup ? ' + άπαχο' : ''}</div></div><div class="muted" style="text-align:right">${fmt(f.kcal, 0)} kcal<br>${fmt(carb, 1)} υδατ. ${ge ? '· ' + ge : ''}</div></div>`;
    }).join('') || '<p class="muted">Δεν βρέθηκαν τρόφιμα.</p>';
    m.el.querySelectorAll('.r').forEach(row => row.onclick = () => {
      const food = list.find(f => f.id === row.dataset.id);
      const grams = Number(m.el.querySelector('#grams').value) || food.portionGrams;
      const note = m.el.querySelector('#note').value || (grams === food.portionGrams ? (food.portionLabel || '') : '');
      onPick({ food, grams, note });
      m.close();
    });
  };
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
