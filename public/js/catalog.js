import { api, loadFoods, invalidateFoods } from './api.js';
import { bus, esc, setHandlers, toast, modal, emptyState } from './util.js';
import { fmt, norm } from '/shared/text.js';
import { GROUPS, groupLabel, portionCarbEx, presentRecipe, itemFromFood, EXCHANGE_DISCLAIMER } from '/shared/nutrition.js';
import { exText } from './format.js';
import { openFoodPicker } from './picker.js';

let fq = '';
let fgroup = '';
let flags = { vegan: false, fasting: false, keto: false };

export async function foodsPage() {
  const foods = await loadFoods(true);
  const query = norm(fq).trim();
  const list = foods.filter(f => {
    if (flags.vegan && !f.vegan) return false;
    if (flags.fasting && !f.fasting) return false;
    if (flags.keto && !f.keto) return false;
    if (fgroup && f.group !== fgroup) return false;
    if (query && !query.split(/\s+/).every(t => norm(`${f.name} ${f.category} ${groupLabel(f.group)}`).includes(t))) return false;
    return true;
  });
  setHandlers({
    'fq': (el) => {
      fq = el.value; const pos = el.selectionStart;
      bus.refresh().then(() => { const i = document.querySelector('[data-input="fq"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    },
    'fg': (el) => { fgroup = el.value; bus.refresh(); },
    'ff': (el) => { flags[el.dataset.flag] = el.checked; bus.refresh(); },
    'add-food': () => customFoodModal(),
    'del-food': async (el) => {
      if (!confirm('Διαγραφή τροφίμου;')) return;
      await api('/api/foods/' + el.dataset.id, { method: 'DELETE' });
      invalidateFoods();
      bus.refresh();
    },
  });
  return `<div class="page-h"><div><h1>Τρόφιμα</h1><p class="muted">${foods.length} στη βάση · ${esc(EXCHANGE_DISCLAIMER)}</p></div><button type="button" class="primary" data-act="add-food">Δικό μου τρόφιμο</button></div>
  <div class="card"><input data-input="fq" value="${esc(fq)}" placeholder="Αναζήτηση"><div class="actions" style="margin-top:8px"><select data-change="fg"><option value="">Όλες οι ομάδες</option>${GROUPS.map(g => `<option value="${g.id}" ${fgroup === g.id ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select>
    <label class="checkline"><input type="checkbox" data-change="ff" data-flag="vegan" ${flags.vegan ? 'checked' : ''}> Vegan</label>
    <label class="checkline"><input type="checkbox" data-change="ff" data-flag="fasting" ${flags.fasting ? 'checked' : ''}> Νηστεία</label>
    <label class="checkline"><input type="checkbox" data-change="ff" data-flag="keto" ${flags.keto ? 'checked' : ''}> Keto</label></div></div>
  <div class="card table-wrap"><table><tr><th>Τρόφιμο</th><th>Ομάδα</th><th class="num">kcal</th><th class="num hm">Π</th><th class="num hm">Υ</th><th class="num hm">Λ</th><th class="num">Υδατ. μερίδας</th><th></th></tr>
  ${list.slice(0, 300).map(f => `<tr><td><b>${esc(f.name)}</b><div class="muted">${esc(f.category)} · ${esc(f.portionLabel || '')} ${f.portionGrams} g${f.exchangeNote ? ' · ' + esc(f.exchangeNote) : ''}</div></td><td>${esc(groupLabel(f.group))}${f.vegan ? ' · vegan' : ''}${f.fasting ? ' · νηστ.' : ''}${f.keto ? ' · keto' : ''}</td><td class="num">${fmt(f.kcal, 0)}</td><td class="num hm">${fmt(f.protein, 1)}</td><td class="num hm">${fmt(f.carbs, 1)}</td><td class="num hm">${fmt(f.fat, 1)}</td><td class="num">${fmt(portionCarbEx(f), 1)}</td><td>${f.custom ? `<button type="button" class="sm danger" data-act="del-food" data-id="${esc(f.id)}">Διαγραφή</button>` : ''}</td></tr>`).join('')}</table>
  ${list.length > 300 ? '<p class="muted">Εμφανίζονται τα πρώτα 300. Στενέψτε την αναζήτηση.</p>' : ''}</div>`;
}

function customFoodModal() {
  const m = modal(`<h2>Δικό μου τρόφιμο</h2><p class="muted">Ανά 100 g. Το ισοδύναμο υπολογίζεται από την ομάδα και τα γραμμάρια.</p><form id="cf">
    <label class="lbl">Όνομα</label><input name="name" required>
    <div class="grid-2"><div><label class="lbl">Κατηγορία</label><input name="category" value="Δικά μου"></div><div><label class="lbl">Ομάδα ισοδυνάμου</label><select name="group">${GROUPS.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</select></div></div>
    <div class="grid-3"><div><label class="lbl">kcal</label><input name="kcal" type="number" step="any" required></div><div><label class="lbl">Πρωτεΐνη</label><input name="protein" type="number" step="any" required></div><div><label class="lbl">Υδατάνθρακες</label><input name="carbs" type="number" step="any" required></div><div><label class="lbl">Λίπος</label><input name="fat" type="number" step="any" required></div><div><label class="lbl">Φυτικές ίνες</label><input name="fiber" type="number" step="any"></div><div><label class="lbl">Νάτριο mg</label><input name="sodium" type="number" step="any"></div></div>
    <div class="grid-2"><div><label class="lbl">Μερίδα g</label><input name="portionGrams" type="number" value="100"></div><div><label class="lbl">Περιγραφή μερίδας</label><input name="portionLabel"></div></div>
    <div class="actions"><label class="checkline"><input type="checkbox" name="vegan"> Vegan</label><label class="checkline"><input type="checkbox" name="fasting"> Νηστεία</label><label class="checkline"><input type="checkbox" name="keto"> Keto</label></div>
    <p class="err" id="ferr"></p><button class="primary" type="submit">Αποθήκευση</button>
  </form>`);
  m.el.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.vegan = e.target.vegan.checked; body.fasting = e.target.fasting.checked; body.keto = e.target.keto.checked;
    try {
      await api('/api/foods', { method: 'POST', body });
      invalidateFoods();
      toast('Το τρόφιμο προστέθηκε');
      m.close(); bus.refresh();
    } catch (err) { m.el.querySelector('#ferr').textContent = err.message; }
  };
}

export async function recipesPage() {
  const list = await api('/api/recipes');
  setHandlers({});
  return `<div class="page-h"><div><h1>Συνταγές</h1></div><a class="btn primary" href="#/recipe/new">Νέα συνταγή</a></div>
  <div class="card">${list.length ? list.map(r => `<div class="list-row"><div><a href="#/recipe/${esc(r.id)}"><b>${esc(r.name)}</b></a><div class="muted">${r.servings} μερίδες · ${fmt(r.perServing.kcal, 0)} kcal/μερίδα · ${fmt(r.perServingEx.carb, 1)} υδατ.</div></div><a class="btn sm" href="/print.html?sheet=recipe&id=${esc(r.id)}" target="_blank" rel="noopener">Ετικέτα</a></div>`).join('') : emptyState('Καμία συνταγή', 'Φτιάξτε μια συνταγή από τρόφιμα και βάλτε την σε γεύμα ως μία γραμμή.', '', '')}<p><a class="btn" href="#/recipe/new">Νέα συνταγή</a></p></div>`;
}

let recipe = null;
export async function recipeEditor(id) {
  if (id === 'new') recipe = { id: null, name: '', servings: 1, notes: '', instructions: '', ingredients: [] };
  else recipe = await api('/api/recipes/' + id);
  bindRecipe();
  return recipeHtml();
}
function bindRecipe() {
  const h = {
    'r-name': (el) => { recipe.name = el.value; },
    'r-serv': (el) => { recipe.servings = Math.max(1, Number(el.value) || 1); paintRecipe(); },
    'r-notes': (el) => { recipe.notes = el.value; },
    'r-inst': (el) => { recipe.instructions = el.value; },
    'r-grams': (el) => { recipe.ingredients[+el.dataset.i].grams = Math.max(0, Number(el.value) || 0); paintRecipe(); },
    'r-rm': (el) => { recipe.ingredients.splice(+el.dataset.i, 1); paintRecipe(); },
    'r-add': () => openFoodPicker({ title: 'Υλικό', onPick: ({ food, grams }) => { recipe.ingredients.push(itemFromFood(food, grams)); paintRecipe(); } }),
    'r-save': () => saveRecipe(),
    'r-del': async () => {
      if (!recipe.id || !confirm('Διαγραφή συνταγής;')) return;
      await api('/api/recipes/' + recipe.id, { method: 'DELETE' });
      location.hash = '/recipes';
    },
  };
  setHandlers(h); bus.handlers = h;
}
function paintRecipe() {
  const host = document.getElementById('content');
  if (!host) return;
  host.innerHTML = recipeHtml();
  bindRecipe();
}
function recipeHtml() {
  const view = presentRecipe(recipe);
  return `<div class="page-h"><div><h1>${recipe.id ? 'Συνταγή' : 'Νέα συνταγή'}</h1></div><div class="actions"><a class="btn" href="#/recipes">Λίστα</a>${recipe.id ? `<a class="btn" href="/print.html?sheet=recipe&id=${esc(recipe.id)}" target="_blank" rel="noopener">Ετικέτα</a>` : ''}</div></div>
  <div class="card"><div class="grid-2"><div><label class="lbl">Όνομα</label><input data-input="r-name" value="${esc(recipe.name)}"></div><div><label class="lbl">Μερίδες</label><input data-change="r-serv" type="number" min="1" value="${esc(recipe.servings || 1)}"></div></div>
    <label class="lbl">Οδηγίες</label><textarea data-input="r-inst" rows="3">${esc(recipe.instructions || '')}</textarea>
    <label class="lbl">Σημειώσεις</label><textarea data-input="r-notes" rows="2">${esc(recipe.notes || '')}</textarea></div>
  <div class="card"><div class="actions"><h2 style="flex:1">Υλικά</h2><button type="button" class="primary" data-act="r-add">+ Τρόφιμο</button></div>
    ${recipe.ingredients.length ? `<table><tr><th>Υλικό</th><th class="num">g</th><th class="num">kcal</th><th></th></tr>${recipe.ingredients.map((it, i) => `<tr><td>${esc(it.name)}</td><td class="num"><input class="g" data-change="r-grams" data-i="${i}" type="number" value="${esc(it.grams)}"></td><td class="num">${fmt(it.kcal * it.grams / 100, 0)}</td><td><button type="button" class="sm danger" data-act="r-rm" data-i="${i}">✕</button></td></tr>`).join('')}</table>` : '<p class="muted">Προσθέστε υλικά.</p>'}
  </div>
  <div class="card"><h2>Ανά μερίδα</h2><p><b>${fmt(view.perServingNut.kcal, 0)} kcal</b> · Π ${fmt(view.perServingNut.protein, 1)} g · Υ ${fmt(view.perServingNut.carbs, 1)} g · Λ ${fmt(view.perServingNut.fat, 1)} g · ίνες ${fmt(view.perServingNut.fiber, 1)} g</p><p>${esc(exText(view.perServingEx))}</p><p class="muted">Σύνολο συνταγής ${fmt(view.totalGrams, 0)} g · ${fmt(view.nut.kcal, 0)} kcal. ${esc(EXCHANGE_DISCLAIMER)}</p>
    <div class="actions"><button type="button" class="primary" data-act="r-save">Αποθήκευση</button>${recipe.id ? '<button type="button" class="danger" data-act="r-del">Διαγραφή</button>' : ''}</div><p class="err" id="rerr"></p></div>`;
}
async function saveRecipe() {
  const err = document.getElementById('rerr');
  try {
    const body = { name: recipe.name, servings: recipe.servings, notes: recipe.notes, instructions: recipe.instructions, ingredients: recipe.ingredients.map(i => ({ foodId: i.foodId, grams: i.grams })) };
    const saved = recipe.id ? await api('/api/recipes/' + recipe.id, { method: 'PUT', body }) : await api('/api/recipes', { method: 'POST', body });
    toast('Η συνταγή αποθηκεύτηκε');
    if (!recipe.id) location.hash = '/recipe/' + saved.id;
    else { recipe = saved; paintRecipe(); }
  } catch (e) { if (err) err.textContent = e.message; }
}
