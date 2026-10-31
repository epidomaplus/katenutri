import { esc, fmt, gramsLabel, elDate } from '/shared/text.js';
import { normalizePlan, dayNut, dayEx, sumNut, sumEx, shoppingList, MICRO_REF, macroSplit, EXCHANGE_DISCLAIMER, shiftDate, presentRecipe } from '/shared/nutrition.js';
import { prescriptionSummary } from '/shared/prescription.js';
import { sheetSections } from '/shared/measures.js';
import { lineChart } from '/shared/chart.js';
import { exText } from '/js/format.js';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') || 'plan';
const prefs = JSON.parse(localStorage.printPrefs || '{}');
const state = {
  macros: prefs.macros !== false,
  grams: prefs.grams !== false,
  exchanges: prefs.exchanges !== false,
  large: prefs.large === true || q.get('theme') === 'large',
};

function savePrefs() {
  localStorage.printPrefs = JSON.stringify({ macros: state.macros, grams: state.grams, exchanges: state.exchanges, large: state.large });
  document.body.classList.toggle('large', state.large);
}

async function api(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Απαιτείται σύνδεση ή δεν βρέθηκε.');
  return j;
}

function tools(extra = '') {
  document.body.classList.add('sheet-' + sheet);
  document.body.classList.toggle('large', state.large);
  document.getElementById('tools').innerHTML = `<button type="button" id="print">Εκτύπωση / PDF</button>
    <label><input type="checkbox" id="large" ${state.large ? 'checked' : ''}> Μεγάλα γράμματα</label>
    ${extra}
    <label><input type="checkbox" id="macros" ${state.macros ? 'checked' : ''}> Θερμίδες / μακροθρεπτικά</label>
    <label><input type="checkbox" id="grams" ${state.grams ? 'checked' : ''}> Γραμμάρια</label>
    <label><input type="checkbox" id="ex" ${state.exchanges ? 'checked' : ''}> Ισοδύναμα</label>`;
  document.getElementById('print').onclick = () => window.print();
  for (const [id, key] of [['large', 'large'], ['macros', 'macros'], ['grams', 'grams'], ['ex', 'exchanges']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.onchange = () => { state[key] = el.checked; savePrefs(); draw(); };
  }
}

function header(brand, title, meta) {
  return `${brand.logoUrl ? `<img class="logo" src="${esc(brand.logoUrl)}" alt="" onerror="this.remove()">` : ''}
    <h1>${esc(title)}</h1><div class="meta">${esc(brand.practiceName || brand.dietitianName || '')}${brand.phone ? ' · ' + esc(brand.phone) : ''}${meta ? ' · ' + meta : ''}</div>`;
}

let brand = {};
let payload = null;

function planArticle(plan, onlyDay) {
  const data = normalizePlan(plan.data);
  const days = onlyDay == null ? data.days : [data.days[onlyDay]].filter(Boolean);
  const blocks = days.map((day, idx) => {
    const real = onlyDay == null ? idx : onlyDay;
    const when = data.startDate ? ' · ' + elDate(shiftDate(data.startDate, real)) : '';
    const n = dayNut(day); const ex = dayEx(day);
    const meals = data.mealNames.map((name, i) => {
      const items = day.meals[i] || [];
      if (!items.length) return '';
      const line = items.map(it => esc(it.name) + (state.grams ? ' ' + fmt(it.grams, 0) + ' g' : '') + (it.note ? ' (' + esc(it.note) + ')' : '')).join(', ');
      const extra = [];
      if (state.macros) extra.push(fmt(sumNut(items).kcal, 0) + ' kcal');
      if (state.exchanges) extra.push(fmt(sumEx(items).carb, 1) + ' υδατ.');
      return `<div><b>${esc(name)}:</b> ${line}${extra.length ? ` <span class="muted">— ${extra.join(' · ')}</span>` : ''}</div>`;
    }).join('');
    const headExtra = [];
    if (state.macros) headExtra.push(fmt(n.kcal, 0) + ' kcal');
    if (state.exchanges) headExtra.push(exText(ex));
    return `<section class="day"><h2>${esc(day.name)}${esc(when)} <span class="muted">${headExtra.join(' · ')}</span></h2>${meals || '<span class="muted">—</span>'}${day.note ? `<p>${esc(day.note)}</p>` : ''}</section>`;
  }).join('');
  const all = (onlyDay == null ? data.days : [data.days[onlyDay]]).filter(Boolean);
  const items = all.flatMap(d => d.meals.flat());
  const nut = sumNut(items); const ex = sumEx(all.flatMap(d => d.meals.flat()));
  const filled = all.filter(d => dayNut(d).kcal > 0).length || 1;
  const s = macroSplit(nut);
  let summary = '';
  if (state.macros || state.exchanges) {
    summary = `<table><tr><th>Μέσος όρος ημέρας</th>${state.macros ? '<th>kcal</th><th>Π</th><th>Υ</th><th>Λ</th>' : ''}${state.exchanges ? '<th>Υδατ.</th>' : ''}</tr>
      <tr><td></td>${state.macros ? `<td>${fmt(nut.kcal / filled, 0)}</td><td>${fmt(nut.protein / filled, 1)}</td><td>${fmt(nut.carbs / filled, 1)}</td><td>${fmt(nut.fat / filled, 1)}</td>` : ''}${state.exchanges ? `<td>${fmt(ex.carb / filled, 1)}</td>` : ''}</tr></table>`;
    if (state.macros) summary += `<p class="muted">${fmt(s.pp, 0)}% πρωτεΐνη · ${fmt(s.cp, 0)}% υδατάνθρακες · ${fmt(s.fp, 0)}% λίπος</p>`;
    if (state.exchanges) summary += `<p>${esc(exText({ carb: ex.carb / filled, groups: Object.fromEntries(Object.entries(ex.groups).map(([k, v]) => [k, v / filled])) }))}</p>`;
  }
  if (onlyDay != null && state.macros) {
    const micros = MICRO_REF.map(m => `<tr><td>${esc(m.label)}</td><td>${fmt(nut[m.key] || 0, 1)} ${esc(m.unit)}</td><td>${Math.round((nut[m.key] || 0) / m.ref * 100)}%</td></tr>`).join('');
    summary += `<h3>Μικροθρεπτικά (προσέγγιση)</h3><table><tr><th></th><th>Ποσότητα</th><th>% ενδεικτικού</th></tr>${micros}</table>`;
  }
  const rx = prescriptionSummary(data);
  return `${header(brand, plan.title, `${plan.clientName || ''}${data.targetKcal ? ' · στόχος ' + data.targetKcal + ' kcal' : ''}`)}
    ${rx ? `<p><b>Εντολή ημέρας:</b> ${esc(rx)}</p>` : ''}
    ${blocks}${summary}${data.notes ? `<h3>Οδηγίες</h3><p style="white-space:pre-wrap">${esc(data.notes)}</p>` : ''}`;
}

function draw() {
  savePrefs();
  const out = document.getElementById('out');
  if (sheet === 'shopping') {
    tools('');
    const groups = shoppingList(payload.data);
    out.innerHTML = `${header(brand, 'Λίστα αγορών', payload.title)}
      ${groups.map(g => `<h2>${esc(g.category)}</h2><ul>${g.items.map(i => `<li>☐ ${esc(i.name)} — ${esc(gramsLabel(i.grams))}</li>`).join('')}</ul>`).join('') || '<p>Κενή λίστα.</p>'}
      <p class="foot">${esc(brand.printFooter || EXCHANGE_DISCLAIMER)}</p>`;
    return;
  }
  if (sheet === 'recipe') {
    tools('');
    const p = presentRecipe(payload);
    out.innerHTML = `${header(brand, payload.name, payload.servings + ' μερίδες')}
      <div class="card"><h2>Ανά μερίδα</h2><p><b>${fmt(p.perServingNut.kcal, 0)} kcal</b> · Π ${fmt(p.perServingNut.protein, 1)} g · Υ ${fmt(p.perServingNut.carbs, 1)} g · Λ ${fmt(p.perServingNut.fat, 1)} g · ίνες ${fmt(p.perServingNut.fiber, 1)} g</p>
      <p>${esc(exText(p.perServingEx))}</p><p class="muted">Ανά 100 g: ${fmt(p.totalGrams ? p.nut.kcal * 100 / p.totalGrams : 0, 0)} kcal</p></div>
      <h3>Υλικά</h3><ul>${payload.ingredients.map(i => `<li>${esc(i.name)} — ${fmt(i.grams, 0)} g</li>`).join('')}</ul>
      ${payload.instructions ? `<h3>Οδηγίες</h3><p style="white-space:pre-wrap">${esc(payload.instructions)}</p>` : ''}
      <p class="foot">${esc(EXCHANGE_DISCLAIMER)}</p>`;
    document.title = payload.name;
    return;
  }
  if (sheet === 'visits') {
    tools('');
    document.getElementById('macros').parentElement.style.display = 'none';
    document.getElementById('grams').parentElement.style.display = 'none';
    document.getElementById('ex').parentElement.style.display = 'none';
    const visits = payload.visits;
    const sections = visits[0] ? sheetSections(visits[0]) : [];
    const tables = sections.map(sec => `<h2>${esc(sec.title)}</h2><table><tr><th>Μέτρηση</th>${visits.map(v => `<th>${esc(elDate(v.date))}</th>`).join('')}</tr>
      ${sec.rows.map(row => `<tr><td>${esc(row.label)}</td>${visits.map(v => {
        const found = sheetSections(v).find(s => s.title === sec.title).rows.find(r => r.label === row.label);
        return `<td>${found?.value == null ? '' : esc(fmt(found.value, 2))}</td>`;
      }).join('')}</tr>`).join('')}</table>`).join('');
    const charts = `<div class="grid">${lineChart(payload.visits.filter(v => v.anthro?.weightKg != null).map(v => ({ label: v.date.slice(8) + '/' + v.date.slice(5, 7), value: v.anthro.weightKg })), { title: 'Βάρος', color: '#B8960B' })}
      ${lineChart(payload.visits.filter(v => v.anthro?.bodyFatPct != null).map(v => ({ label: v.date.slice(8) + '/' + v.date.slice(5, 7), value: v.anthro.bodyFatPct })), { title: 'Λίπος %', color: '#c47b12' })}
      ${lineChart(payload.visits.filter(v => v.anthro?.muscleKg != null).map(v => ({ label: v.date.slice(8) + '/' + v.date.slice(5, 7), value: v.anthro.muscleKg })), { title: 'Μυϊκή μάζα', color: '#1d6fbf' })}</div>`;
    out.innerHTML = `${header(brand, 'Φύλλο παρακολούθησης', payload.client.name)}
      ${charts}${tables}<h2>Σημειώσεις</h2>${visits.map(v => v.notes ? `<p><b>${esc(elDate(v.date))}.</b> ${esc(v.notes)}</p>` : '').join('') || '<p class="muted">—</p>'}
      <p class="foot">Καταγραφή μετρήσεων. Δεν αποτελεί διάγνωση.</p>`;
    return;
  }
  tools('');
  const only = sheet === 'analysis' ? Number(q.get('day') || 0) : null;
  out.innerHTML = planArticle(payload, Number.isInteger(only) ? only : null) + `<p class="foot">${esc(brand.printFooter || EXCHANGE_DISCLAIMER)}</p>`;
  document.title = payload.title;
}

async function main() {
  try {
    brand = await api('/api/branding');
    if (sheet === 'recipe') payload = await api('/api/recipes/' + q.get('id'));
    else if (sheet === 'visits') {
      const client = await api('/api/clients/' + q.get('client'));
      const visits = await api('/api/clients/' + q.get('client') + '/visits');
      payload = { client, visits };
    } else payload = await api('/api/plans/' + q.get('id'));
    draw();
  } catch (e) {
    document.getElementById('out').textContent = e.message;
  }
}
main();
