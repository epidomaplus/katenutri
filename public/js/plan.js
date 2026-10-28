import { api } from './api.js';
import { bus, esc, setHandlers, toast, modal, emptyState } from './util.js';
import { fmt, elDate, gramsLabel } from '/shared/text.js';
import {
  GROUPS, normalizePlan, dayNut, dayEx, sumNut, sumEx, itemFromFood, itemFromRecipe,
  scalePlanData, shoppingList, macroSplit, MICRO_REF, EXCHANGE_DISCLAIMER, groupShort, emptyPlan, shiftDate,
} from '/shared/nutrition.js';
import { exText, macroBar } from './format.js';
import { openFoodPicker, openRecipePicker } from './picker.js';

let plan = null;
let clients = [];
let linked = null;
let day = 0;
let panel = 'day';
let timer = null;

function bind(h) { setHandlers(h); bus.handlers = h; }

export async function plansPage() {
  const [plans, cls] = await Promise.all([api('/api/plans'), api('/api/clients')]);
  bind({
    'new-plan': async (data) => {
      const client = cls.find(c => c.id === data.clientId);
      const p = await api('/api/plans', { method: 'POST', body: { ...data, clientName: client?.name || data.clientName || '', data: emptyPlan() } });
      location.hash = '/plan/' + p.id;
    },
    'dup': async (el) => {
      const p = await api('/api/plans/' + el.dataset.id);
      const copy = await api('/api/plans', { method: 'POST', body: { title: p.title + ' (αντίγραφο)', clientId: p.clientId, clientName: p.clientName, data: p.data } });
      location.hash = '/plan/' + copy.id;
    },
    'del-plan': async (el) => {
      if (!confirm('Διαγραφή διαιτολογίου;')) return;
      await api('/api/plans/' + el.dataset.id, { method: 'DELETE' });
      bus.refresh();
    },
  });
  return `<div class="page-h"><div><h1>Διαιτολόγια</h1><p class="muted">Εβδομάδα με γεύματα, μακροθρεπτικά και ισοδύναμα.</p></div></div>
  <form class="card" data-submit="new-plan"><div class="grid-3"><div><label class="lbl">Τίτλος</label><input name="title" required placeholder="Εβδομάδα 1"></div><div><label class="lbl">Πελάτης</label><select name="clientId"><option value="">— χωρίς σύνδεση —</option>${cls.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div><div><button class="primary" type="submit">Δημιουργία</button></div></div></form>
  <div class="card">${plans.length ? plans.map(p => `<div class="list-row"><div><a href="#/plan/${esc(p.id)}"><b>${esc(p.title)}</b></a><div class="muted">${esc(p.clientName || 'Χωρίς πελάτη')}${p.targetKcal ? ' · ' + esc(p.targetKcal) + ' kcal' : ''}${p.visibleToClient ? ' · ορατό στην πύλη' : ''} · ${esc(elDate(p.updatedAt.slice(0, 10)))}</div></div><div class="actions"><a class="btn sm" href="/print.html?id=${esc(p.id)}" target="_blank" rel="noopener">Εκτύπωση</a><button type="button" class="sm" data-act="dup" data-id="${esc(p.id)}">Αντίγραφο</button><button type="button" class="sm danger" data-act="del-plan" data-id="${esc(p.id)}">Διαγραφή</button></div></div>`).join('') : emptyState('Κανένα διαιτολόγιο', 'Φτιάξτε το πρώτο από τη φόρμα πάνω ή από την καρτέλα πελάτη.', '', '')}</div>`;
}

export async function planEditor(id) {
  plan = await api('/api/plans/' + id);
  plan.data = normalizePlan(plan.data);
  clients = await api('/api/clients');
  linked = clients.find(c => c.id === plan.clientId) || null;
  day = 0; panel = 'day';
  bus.beforeLeave = flush;
  bind(handlers());
  return view();
}

function schedule() {
  const el = document.getElementById('saveState');
  if (el) el.textContent = 'Αποθήκευση…';
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}
async function flush() {
  if (!plan) return;
  clearTimeout(timer);
  try {
    const saved = await api('/api/plans/' + plan.id, { method: 'PUT', body: { title: plan.title, clientName: plan.clientName, clientId: plan.clientId, visibleToClient: !!plan.visibleToClient, data: plan.data } });
    plan.updatedAt = saved.updatedAt;
    const el = document.getElementById('saveState');
    if (el) el.textContent = 'Αποθηκεύτηκε';
  } catch (e) {
    const el = document.getElementById('saveState');
    if (el) el.textContent = e.message;
  }
}
function render() {
  const host = document.getElementById('content');
  if (host) host.innerHTML = view();
  bind(handlers());
}
function syncMeals() {
  const n = plan.data.mealNames.length;
  for (const d of plan.data.days) {
    while (d.meals.length < n) d.meals.push([]);
    d.meals.length = n;
  }
}

function handlers() {
  return {
    'title': (el) => { plan.title = el.value; schedule(); },
    'client': (el) => {
      plan.clientId = el.value;
      linked = clients.find(c => c.id === el.value) || null;
      if (linked) plan.clientName = linked.name;
      schedule(); render();
    },
    'kcal': (el) => { plan.data.targetKcal = el.value; schedule(); },
    'start': (el) => { plan.data.startDate = el.value; schedule(); },
    'notes': (el) => { plan.data.notes = el.value; schedule(); },
    'day-note': (el) => { plan.data.days[day].note = el.value; schedule(); },
    'visible': (el) => { plan.visibleToClient = el.checked; schedule(); },
    'mode': (el) => { plan.data.viewMode = el.dataset.mode; schedule(); render(); },
    'panel': (el) => { panel = el.dataset.panel; if (el.dataset.day != null) day = Number(el.dataset.day); render(); },
    'day': (el) => { day = Number(el.dataset.day); panel = 'day'; render(); },
    'grams': (el) => {
      const [mi, ii] = el.dataset.idx.split(':').map(Number);
      plan.data.days[day].meals[mi][ii].grams = Math.max(0, Number(el.value) || 0);
      schedule(); render();
    },
    'rm': (el) => {
      const [mi, ii] = el.dataset.idx.split(':').map(Number);
      plan.data.days[day].meals[mi].splice(ii, 1);
      schedule(); render();
    },
    'add-food': (el) => openFoodPicker({ title: 'Στο «' + plan.data.mealNames[el.dataset.mi] + '»', preferences: linked?.preferences, onPick: ({ food, grams, note }) => { plan.data.days[day].meals[el.dataset.mi].push(itemFromFood(food, grams, note)); schedule(); render(); } }),
    'add-recipe': async (el) => openRecipePicker(({ recipe, servings }) => { plan.data.days[day].meals[el.dataset.mi].push(itemFromRecipe(recipe, servings)); schedule(); render(); }),
    'meal-tpl': (el) => mealTemplateModal(Number(el.dataset.mi)),
    'meals': () => mealsModal(),
    'targets': () => targetsModal(),
    'templates': () => templateModal(),
    'scale': () => {
      const target = Number(plan.data.targetKcal);
      if (!target) { toast('Βάλτε στόχο kcal πρώτα'); return; }
      plan.data = scalePlanData(plan.data, target);
      schedule(); render(); toast('Οι ποσότητες κλιμακώθηκαν προς τον στόχο');
    },
    'shop': () => shopModal(),
    'copy-day': () => {
      const v = document.getElementById('copyTo').value;
      const src = JSON.parse(JSON.stringify(plan.data.days[day].meals));
      const targets = v === 'all' ? plan.data.days.map((_, i) => i).filter(i => i !== day) : [Number(v)];
      if (!confirm('Θα αντικατασταθούν τα γεύματα των επιλεγμένων ημερών.')) return;
      targets.forEach(i => { plan.data.days[i].meals = JSON.parse(JSON.stringify(src)); });
      schedule(); render();
    },
    'clear-day': () => {
      if (!confirm('Καθαρισμός της ημέρας;')) return;
      plan.data.days[day].meals = plan.data.mealNames.map(() => []);
      schedule(); render();
    },
  };
}

function view() {
  const d = plan.data;
  const mode = d.viewMode || 'both';
  const showM = mode !== 'exchanges';
  const showE = mode !== 'macros';
  const dateHint = d.startDate ? elDate(shiftDate(d.startDate, day)) : '';
  const tabs = d.days.map((x, i) => `<button type="button" class="${panel === 'day' && day === i ? 'on' : ''}" data-act="day" data-day="${i}">${esc(x.name)} <span class="muted">${fmt(dayNut(x).kcal, 0)}</span></button>`).join('');
  let body = '';
  if (panel === 'week') body = weekHtml();
  else if (panel === 'analysis') body = analysisHtml(d.days[day], dateHint);
  else body = dayHtml(showM, showE, dateHint);
  const allergy = linked?.allergies ? `<div class="banner">Αλλεργίες / αποφυγές: ${esc(linked.allergies)}</div>` : '';
  const flags = linked?.preferences || {};
  const flagTxt = [flags.vegan && 'vegan', flags.fasting && 'νηστεία', flags.keto && 'keto', flags.carbLoading && 'φόρτιση υδατανθράκων'].filter(Boolean).join(', ');
  return `<div class="page-h"><div><h1>Διαιτολόγιο</h1><p class="muted" id="saveState">Αποθηκεύτηκε</p></div><div class="actions"><a class="btn" href="#/plans">Λίστα</a><a class="btn primary" href="/print.html?id=${esc(plan.id)}" target="_blank" rel="noopener">Εκτύπωση</a></div></div>
  <div class="card"><div class="grid-3"><div><label class="lbl">Τίτλος</label><input data-input="title" value="${esc(plan.title)}"></div><div><label class="lbl">Πελάτης</label><select data-change="client"><option value="">—</option>${clients.map(c => `<option value="${esc(c.id)}" ${c.id === plan.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div><label class="lbl">Στόχος kcal</label><input data-input="kcal" type="number" value="${esc(d.targetKcal || '')}"></div><div><label class="lbl">Έναρξη (Δευτέρα)</label><input data-change="start" type="date" value="${esc(d.startDate || '')}"></div></div>
    <div class="actions" style="margin-top:10px"><div class="seg"><button type="button" data-act="mode" data-mode="macros" class="${mode === 'macros' ? 'on' : ''}">Μακροθρεπτικά</button><button type="button" data-act="mode" data-mode="exchanges" class="${mode === 'exchanges' ? 'on' : ''}">Ισοδύναμα</button><button type="button" data-act="mode" data-mode="both" class="${mode === 'both' ? 'on' : ''}">Και τα δύο</button></div>
      <label class="checkline"><input type="checkbox" data-change="visible" ${plan.visibleToClient ? 'checked' : ''}> Ορατό στην πύλη</label></div>
    <div class="actions" style="margin-top:8px"><button type="button" class="sm" data-act="meals">Γεύματα</button><button type="button" class="sm" data-act="targets">Στόχοι ισοδυνάμων</button><button type="button" class="sm" data-act="templates">Πρότυπα</button><button type="button" class="sm" data-act="scale">Κλιμάκωση</button><button type="button" class="sm" data-act="shop">Λίστα αγορών</button></div>
  </div>
  ${allergy}${flagTxt ? `<p class="muted">Σημάνσεις πελάτη: ${esc(flagTxt)}. Εφαρμόζονται ως ήπια φίλτρα όταν προσθέτετε τρόφιμο.</p>` : ''}
  <div class="tabs">${tabs}<button type="button" class="${panel === 'week' ? 'on' : ''}" data-act="panel" data-panel="week">Εβδομάδα</button><button type="button" class="${panel === 'analysis' ? 'on' : ''}" data-act="panel" data-panel="analysis">Ανάλυση ημέρας</button></div>
  ${body}
  <div class="card"><label class="lbl">Οδηγίες για τον πελάτη</label><textarea data-input="notes" rows="3">${esc(d.notes || '')}</textarea><p class="disclaimer">${esc(EXCHANGE_DISCLAIMER)}</p></div>`;
}

function totals(nut, ex, label) {
  const s = macroSplit(nut);
  const mt = plan.data.macroTargets || {};
  const mode = plan.data.viewMode || 'both';
  return `<div class="card"><h3>${esc(label)}</h3><div class="totals" style="margin-top:8px"><div><b>${fmt(nut.kcal, 0)}</b>kcal${plan.data.targetKcal ? `<div class="muted">στόχος ${esc(plan.data.targetKcal)}</div>` : ''}</div><div><b style="color:var(--p)">${fmt(nut.protein, 1)} g</b>Πρωτεΐνη${mt.protein ? `<div class="muted">στόχος ${esc(mt.protein)} g</div>` : ''}</div><div><b style="color:var(--c)">${fmt(nut.carbs, 1)} g</b>Υδατάνθρακες${mt.carbs ? `<div class="muted">στόχος ${esc(mt.carbs)} g</div>` : ''}</div><div><b style="color:var(--f)">${fmt(nut.fat, 1)} g</b>Λίπος${mt.fat ? `<div class="muted">στόχος ${esc(mt.fat)} g</div>` : ''}</div></div>${macroBar(nut)}<p class="muted">${fmt(s.pp, 0)}% Π · ${fmt(s.cp, 0)}% Υ · ${fmt(s.fp, 0)}% Λ</p>${mode !== 'macros' ? targetCards(ex) : ''}</div>`;
}
function tone(actual, target) {
  if (target === '' || target == null) return '';
  const t = Number(target);
  if (!t) return '';
  if (actual > t * 1.1) return 'over';
  if (actual < t * 0.9) return 'under';
  return 'ok';
}
function targetCards(ex) {
  const t = plan.data.exchangeTargets || {};
  const rows = GROUPS.filter(g => g.id !== 'free').map(g => ({ label: g.label, actual: ex.groups[g.id] || 0, target: t[g.id] }));
  rows.push({ label: 'Ισοδύναμα υδατανθράκων', actual: ex.carb || 0, target: t.carb });
  const visible = rows.filter(r => r.actual >= 0.05 || r.target !== '' && r.target != null);
  if (!visible.length) return '';
  return `<div class="ex-grid" style="margin-top:8px">${visible.map(r => `<div class="ex-row"><span class="muted">${esc(r.label)}</span><b class="${tone(r.actual, r.target)}">${fmt(r.actual, 1)}${r.target !== '' && r.target != null ? ' / ' + esc(r.target) : ''}</b></div>`).join('')}</div><p class="muted">Τα ισοδύναμα υδατανθράκων είναι το σύνολο CHO ÷ 15 και δεν ταυτίζονται με το άθροισμα των ομάδων.</p>`;
}
function cols(showM, showE) {
  return `<th>Τρόφιμο</th><th class="num">g</th>${showM ? '<th class="num">kcal</th><th class="num hm">Π</th><th class="num hm">Υ</th><th class="num hm">Λ</th>' : ''}${showE ? '<th class="num">Υδατ.</th><th>Ομάδα</th>' : ''}<th></th>`;
}
function cells(it, showM, showE) {
  const nut = sumNut([it]); const ex = sumEx([it]);
  const group = it.isRecipe ? 'συνταγή' : (it.group ? `${fmt(ex.groups[it.group] || 0, 1)} ${groupShort(it.group)}` : '—');
  return `<td>${esc(it.name)}${it.note ? `<div class="muted">${esc(it.note)}</div>` : ''}</td><td class="num"><input class="g" type="number" min="0" step="5" value="${esc(it.grams)}" data-change="grams" data-idx="__IDX__"></td>${showM ? `<td class="num">${fmt(nut.kcal, 0)}</td><td class="num hm">${fmt(nut.protein, 1)}</td><td class="num hm">${fmt(nut.carbs, 1)}</td><td class="num hm">${fmt(nut.fat, 1)}</td>` : ''}${showE ? `<td class="num">${fmt(ex.carb, 1)}</td><td>${esc(group)}</td>` : ''}`;
}
function dayHtml(showM, showE, dateHint) {
  const d = plan.data.days[day];
  const head = totals(dayNut(d), dayEx(d), d.name + (dateHint ? ' · ' + dateHint : ''));
  const meals = plan.data.mealNames.map((name, mi) => {
    const meal = d.meals[mi] || [];
    const nut = sumNut(meal); const ex = sumEx(meal);
    const rows = meal.map((it, ii) => `<tr>${cells(it, showM, showE).replaceAll('__IDX__', mi + ':' + ii)}<td><button type="button" class="sm danger" data-act="rm" data-idx="${mi}:${ii}" aria-label="Αφαίρεση">✕</button></td></tr>`).join('');
    return `<div class="card meal"><div class="hd"><h3>${esc(name)}</h3><span class="pill">${fmt(nut.kcal, 0)} kcal</span>${showE ? `<span class="pill">${fmt(ex.carb, 1)} υδατ.</span>` : ''}<button type="button" class="sm primary" data-act="add-food" data-mi="${mi}">+ Τρόφιμο</button><button type="button" class="sm" data-act="add-recipe" data-mi="${mi}">Συνταγή</button><button type="button" class="sm" data-act="meal-tpl" data-mi="${mi}">Πρότυπο</button></div>
      ${meal.length ? `<div class="table-wrap"><table><tr>${cols(showM, showE)}</tr>${rows}<tr class="tot"><td>Σύνολο</td><td></td>${showM ? `<td class="num">${fmt(nut.kcal, 0)}</td><td class="num hm">${fmt(nut.protein, 1)}</td><td class="num hm">${fmt(nut.carbs, 1)}</td><td class="num hm">${fmt(nut.fat, 1)}</td>` : ''}${showE ? `<td class="num">${fmt(ex.carb, 1)}</td><td class="muted">${esc(exText(ex))}</td>` : ''}<td></td></tr></table></div>` : '<p class="muted">Κανένα τρόφιμο.</p>'}</div>`;
  }).join('');
  return `${head}${meals}<div class="card"><label class="lbl">Σημείωση ημέρας</label><input data-input="day-note" value="${esc(d.note || '')}"><div class="actions" style="margin-top:8px"><select id="copyTo"><option value="all">Αντιγραφή σε όλες τις άλλες</option>${plan.data.days.map((x, i) => i !== day ? `<option value="${i}">${esc(x.name)}</option>` : '').join('')}</select><button type="button" data-act="copy-day">Αντιγραφή ημέρας</button><button type="button" class="danger" data-act="clear-day">Καθαρισμός</button></div></div>`;
}
function weekHtml() {
  const rows = plan.data.days.map(d => {
    const n = dayNut(d); const ex = dayEx(d);
    return `<tr><td>${esc(d.name)}</td><td class="num">${fmt(n.kcal, 0)}</td><td class="num hm">${fmt(n.protein, 1)}</td><td class="num hm">${fmt(n.carbs, 1)}</td><td class="num hm">${fmt(n.fat, 1)}</td><td class="num">${fmt(ex.carb, 1)}</td><td>${esc(exText(ex))}</td></tr>`;
  }).join('');
  const allItems = plan.data.days.flatMap(d => d.meals.flat());
  const n = sumNut(allItems); const ex = sumEx(allItems);
  const filled = plan.data.days.filter(d => dayNut(d).kcal > 0).length || 1;
  return `<div class="card"><h2>Εβδομάδα</h2><p class="muted">Μέσος όρος συμπληρωμένης ημέρας: ${fmt(n.kcal / filled, 0)} kcal · ${fmt(ex.carb / filled, 1)} ισοδ. υδατανθράκων.</p><div class="table-wrap"><table><tr><th>Ημέρα</th><th class="num">kcal</th><th class="num hm">Π</th><th class="num hm">Υ</th><th class="num hm">Λ</th><th class="num">Υδατ.</th><th>Ισοδύναμα</th></tr>${rows}</table></div></div>`;
}
function analysisHtml(d, dateHint) {
  const nut = dayNut(d); const ex = dayEx(d);
  const micros = MICRO_REF.map(m => {
    const v = nut[m.key] || 0; const p = m.ref ? Math.round(v / m.ref * 100) : 0;
    const warn = m.watchHigh && p > 100 ? 'over' : '';
    return `<tr><td>${esc(m.label)}</td><td class="num ${warn}">${fmt(v, 1)} ${esc(m.unit)}</td><td class="num ${warn}">${p}%</td><td class="muted">ενδ. ${m.ref} ${esc(m.unit)}</td></tr>`;
  }).join('');
  const meals = plan.data.mealNames.map((name, i) => {
    const nutM = sumNut(d.meals[i] || []); const exM = sumEx(d.meals[i] || []);
    if (!nutM.kcal) return '';
    return `<tr><td>${esc(name)}</td><td class="num">${fmt(nutM.kcal, 0)}</td><td class="num">${fmt(nutM.protein, 1)}</td><td class="num">${fmt(nutM.carbs, 1)}</td><td class="num">${fmt(nutM.fat, 1)}</td><td class="num">${fmt(exM.carb, 1)}</td></tr>`;
  }).join('');
  return `${totals(nut, ex, 'Ανάλυση · ' + d.name + (dateHint ? ' · ' + dateHint : ''))}<div class="card"><h2>Μικροθρεπτικά (προσέγγιση)</h2><p class="muted">Σύγκριση με ενδεικτικό μέγεθος ενηλίκων, όχι με στόχο αυτού του πελάτη.</p><div class="table-wrap"><table><tr><th></th><th class="num">Ποσότητα</th><th class="num">%</th><th></th></tr>${micros}</table></div><p><a href="/print.html?sheet=analysis&id=${esc(plan.id)}&day=${day}" target="_blank" rel="noopener">Εκτύπωση ανάλυσης</a></p></div>
  <div class="card"><h2>Γεύματα</h2><div class="table-wrap"><table><tr><th>Γεύμα</th><th class="num">kcal</th><th class="num">Π</th><th class="num">Υ</th><th class="num">Λ</th><th class="num">Υδατ.</th></tr>${meals}</table></div></div>`;
}

function mealsModal() {
  const d = plan.data;
  const m = modal(`<h2>Γεύματα</h2><p class="muted">Ισχύουν και για τις επτά ημέρες.</p><div id="ml"></div><div class="actions"><button type="button" id="add">+ Γεύμα</button><button type="button" class="primary" id="ok">Κλείσιμο</button></div>`);
  const draw = () => {
    m.el.querySelector('#ml').innerHTML = d.mealNames.map((n, i) => `<div class="actions" style="margin-bottom:6px"><input value="${esc(n)}" data-i="${i}"><button type="button" class="sm" data-up="${i}">↑</button><button type="button" class="sm danger" data-rm="${i}">✕</button></div>`).join('');
    m.el.querySelectorAll('[data-i]').forEach(inp => inp.oninput = () => { d.mealNames[+inp.dataset.i] = inp.value; });
    m.el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const i = +b.dataset.rm;
      if (d.days.some(x => (x.meals[i] || []).length) && !confirm('Το γεύμα έχει τρόφιμα. Διαγραφή;')) return;
      d.mealNames.splice(i, 1); syncMeals(); draw();
    });
    m.el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      const i = +b.dataset.up; if (!i) return;
      const swap = arr => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; };
      swap(d.mealNames); d.days.forEach(x => swap(x.meals)); draw();
    });
  };
  draw();
  m.el.querySelector('#add').onclick = () => { d.mealNames.push('Νέο γεύμα'); syncMeals(); draw(); };
  m.el.querySelector('#ok').onclick = () => { m.close(); schedule(); render(); };
}
function targetsModal() {
  const t = plan.data.exchangeTargets;
  const fields = GROUPS.filter(g => g.id !== 'free').map(g => `<div><label class="lbl">${esc(g.label)} <span class="muted">${esc(g.hint)}</span></label><input data-k="${g.id}" type="number" min="0" step="0.5" value="${esc(t[g.id] ?? '')}"></div>`).join('');
  const m = modal(`<h2>Στόχοι ισοδυνάμων ανά ημέρα</h2><p class="muted">Αφήστε κενό ό,τι δεν θέλετε να συγκρίνεται. ${esc(EXCHANGE_DISCLAIMER)}</p><div class="grid-2">${fields}<div><label class="lbl">Ισοδύναμα υδατανθράκων (CHO ÷ 15)</label><input data-k="carb" type="number" min="0" step="0.5" value="${esc(t.carb ?? '')}"></div></div><button type="button" class="primary" id="ok">Εφαρμογή</button>`);
  m.el.querySelector('#ok').onclick = () => {
    m.el.querySelectorAll('[data-k]').forEach(inp => { plan.data.exchangeTargets[inp.dataset.k] = inp.value; });
    m.close(); schedule(); render();
  };
}
async function templateModal() {
  const tpls = await api('/api/templates');
  const m = modal(`<h2>Πρότυπα</h2><h3>Εφαρμογή σε αυτό το διαιτολόγιο</h3><div id="tp">${tpls.filter(t => t.kind === 'plan').map(t => `<div class="list-row"><div><b>${esc(t.name)}</b><div class="muted">${esc(t.description || '')}${t.approxKcal ? ' · ~' + t.approxKcal + ' kcal' : ''}</div></div><button type="button" class="sm" data-id="${esc(t.id)}">Εφαρμογή</button></div>`).join('')}</div>
    <h3>Αποθήκευση αυτού ως πρότυπο</h3><div class="actions"><input id="tn" placeholder="Όνομα"><button type="button" id="save">Αποθήκευση</button></div>`, { wide: true });
  m.el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
    const t = tpls.find(x => x.id === b.dataset.id);
    if (!confirm('Θα αντικατασταθούν οι ημέρες. Οι στόχοι kcal μένουν.')) return;
    const target = plan.data.targetKcal;
    const next = normalizePlan(t.data);
    next.targetKcal = target || next.targetKcal;
    next.macroTargets = plan.data.macroTargets;
    next.exchangeTargets = plan.data.exchangeTargets;
    next.viewMode = plan.data.viewMode;
    plan.data = target ? scalePlanData(next, Number(target)) : next;
    if (!target) plan.data.targetKcal = next.targetKcal;
    m.close(); schedule(); render();
  });
  m.el.querySelector('#save').onclick = async () => {
    const name = m.el.querySelector('#tn').value.trim();
    if (!name) return;
    await api('/api/templates', { method: 'POST', body: { kind: 'plan', name, data: plan.data } });
    toast('Το πρότυπο αποθηκεύτηκε');
    m.close();
  };
}
async function mealTemplateModal(mi) {
  const tpls = (await api('/api/templates?kind=meal')).filter(t => t.kind === 'meal');
  const m = modal(`<h2>Πρότυπο γεύματος</h2>${tpls.map(t => `<div class="list-row"><div><b>${esc(t.name)}</b><div class="muted">${esc(t.description || '')}</div></div><button type="button" class="sm" data-id="${esc(t.id)}">Εισαγωγή</button></div>`).join('') || '<p class="muted">Δεν υπάρχουν πρότυπα γεύματος.</p>'}
    <div class="actions" style="margin-top:8px"><input id="mn" placeholder="Όνομα νέου προτύπου"><button type="button" id="save">Αποθήκευση αυτού του γεύματος</button></div>`);
  m.el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
    const t = tpls.find(x => x.id === b.dataset.id);
    const items = JSON.parse(JSON.stringify(t.data.items || []));
    const meal = plan.data.days[day].meals[mi];
    if (meal.length && !confirm('Να προστεθούν στα υπάρχοντα; Άκυρο για να μείνετε ως έχετε.')) return;
    meal.push(...items);
    m.close(); schedule(); render();
  });
  m.el.querySelector('#save').onclick = async () => {
    const name = m.el.querySelector('#mn').value.trim();
    if (!name) return;
    await api('/api/templates', { method: 'POST', body: { kind: 'meal', name, data: { items: plan.data.days[day].meals[mi] } } });
    toast('Το γεύμα αποθηκεύτηκε ως πρότυπο');
    m.close();
  };
}
function shopModal() {
  const groups = shoppingList(plan.data);
  const text = groups.map(g => g.category + '\n' + g.items.map(i => `☐ ${i.name} — ${gramsLabel(i.grams)}`).join('\n')).join('\n\n');
  const m = modal(`<h2>Λίστα αγορών</h2>${groups.map(g => `<h3>${esc(g.category)}</h3><ul>${g.items.map(i => `<li>${esc(i.name)} — ${esc(gramsLabel(i.grams))}</li>`).join('')}</ul>`).join('') || '<p class="muted">Το πλάνο είναι κενό.</p>'}<div class="actions"><button type="button" id="cp">Αντιγραφή</button><a class="btn" href="/print.html?sheet=shopping&id=${esc(plan.id)}" target="_blank" rel="noopener">Εκτύπωση</a></div>`, { wide: true });
  m.el.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Αντιγράφηκε'); } catch { toast('Αποτυχία αντιγραφής'); } };
}
