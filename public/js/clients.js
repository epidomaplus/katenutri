import { api } from './api.js';
import { bus, esc, setHandlers, toast, emptyState, sexLabel, copyText, modal } from './util.js';
import { fmt, elDate, todayISO, euro } from '/shared/text.js';
import { ageFromDob, bmi, bmrMifflin, bmrHarris, ACTIVITIES, emptyPlan } from '/shared/nutrition.js';
import { percentsFromEstimate, targetsFromPercents, emptyMacroTargets } from '/shared/prescription.js';
import { MEASURE_FORM, sheetSections, skinfoldSum, whr } from '/shared/measures.js';
import { lineChart } from '/shared/chart.js';

let listMode = localStorage.npClients || 'cards';
let q = '';
let tag = '';

export async function clientsPage() {
  const all = await api('/api/clients');
  const tags = [...new Set(all.flatMap(c => c.tags || []))].sort((a, b) => a.localeCompare(b, 'el'));
  const nq = q.trim().toLocaleLowerCase('el');
  const list = all.filter(c => {
    if (tag && !(c.tags || []).includes(tag)) return false;
    if (!nq) return true;
    return `${c.name} ${c.email} ${c.phone} ${(c.tags || []).join(' ')}`.toLocaleLowerCase('el').includes(nq);
  });
  setHandlers({
    'q': (el) => { q = el.value; const pos = el.selectionStart; bus.refresh().then(() => { const i = document.getElementById('cq'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }); },
    'tag': (el) => { tag = tag === el.dataset.tag ? '' : el.dataset.tag; bus.refresh(); },
    'view': (el) => { listMode = el.dataset.view; localStorage.npClients = listMode; bus.refresh(); },
    'go-new': () => { location.hash = '/client/new/profile'; },
  });
  const cards = list.map(c => `<a class="card client-card" href="#/client/${esc(c.id)}/profile"><h3>${esc(c.name)}</h3><div class="muted">${esc(sexLabel(c.sex))}${c.dob ? ' · ' + (ageFromDob(c.dob) ?? '') + ' ετών' : ''}${c.heightCm ? ' · ' + c.heightCm + ' cm' : ''}</div><div class="tags">${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="muted">${c.lastWeight ? 'Τελευταίο βάρος ' + fmt(c.lastWeight, 1) + ' kg' : 'Χωρίς μέτρηση'}${c.nextAppointment ? ' · ραντεβού ' + esc(elDate(c.nextAppointment.slice(0, 10))) : ''}</div></a>`).join('');
  const table = `<div class="table-wrap"><table><tr><th>Όνομα</th><th>Επικοινωνία</th><th>Ετικέτες</th><th class="num">Βάρος</th><th class="num">Συνεδρία</th></tr>${list.map(c => `<tr><td><a href="#/client/${esc(c.id)}/profile"><b>${esc(c.name)}</b></a></td><td class="muted">${esc(c.email || '')}<br>${esc(c.phone || '')}</td><td>${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</td><td class="num">${c.lastWeight ? fmt(c.lastWeight, 1) : '—'}</td><td class="num">${esc(euro(c.sessionPrice || 0))}</td></tr>`).join('')}</table></div>`;
  return `<div class="page-h"><div><h1>Πελάτες</h1><p class="muted">${all.length} στον φάκελο</p></div><div class="actions"><div class="seg"><button type="button" data-act="view" data-view="cards" class="${listMode === 'cards' ? 'on' : ''}">Κάρτες</button><button type="button" data-act="view" data-view="table" class="${listMode === 'table' ? 'on' : ''}">Πίνακας</button></div><button type="button" class="primary" data-act="go-new">Νέος πελάτης</button></div></div>
  <div class="card"><input id="cq" data-input="q" value="${esc(q)}" placeholder="Αναζήτηση ονόματος, email, τηλεφώνου"><div class="tags" style="margin-top:8px">${tags.map(t => `<button type="button" class="tag ${tag === t ? 'on' : ''}" data-act="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('') || '<span class="muted">Οι ετικέτες εμφανίζονται μόλις προσθέσετε.</span>'}</div></div>
  ${list.length ? (listMode === 'cards' ? `<div class="cards">${cards}</div>` : `<div class="card">${table}</div>`) : emptyState('Κανένας πελάτης', 'Ξεκινήστε με το ονοματεπώνυμο. Τα υπόλοιπα συμπληρώνονται στην πορεία.', 'Νέος πελάτης', 'go-new')}`;
}

function tabs(id, active) {
  const items = [['profile', 'Στοιχεία'], ['measures', 'Μετρήσεις'], ['energy', 'Ενέργεια'], ['plans', 'Διαιτολόγια'], ['diary', 'Ημερολόγιο'], ['messages', 'Μηνύματα']];
  if (id === 'new') return '';
  return `<div class="tabs">${items.map(([k, l]) => `<a class="btn ${active === k ? 'on' : ''}" href="#/client/${esc(id)}/${k}">${l}</a>`).join('')}</div>`;
}

export async function clientFile(id, tab) {
  if (id === 'new') return profile(null);
  const client = await api('/api/clients/' + id);
  if (tab === 'measures') return measures(client);
  if (tab === 'energy') return energy(client);
  if (tab === 'plans') return plans(client);
  if (tab === 'diary') return diary(client);
  if (tab === 'messages') return messages(client);
  return profile(client);
}

function profile(client) {
  const c = client || { name: '', email: '', phone: '', sex: '', dob: '', ageYears: '', heightCm: '', sessionPrice: 0, tags: [], goalNotes: '', allergies: '', preferences: {} };
  const prefs = c.preferences || {};
  setHandlers({
    'save-client': async (data, form) => {
      const err = document.getElementById('cerr');
      const body = {
        ...data,
        preferences: {
          vegan: !!form.vegan?.checked, fasting: !!form.fasting?.checked, keto: !!form.keto?.checked, carbLoading: !!form.carbLoading?.checked,
        },
      };
      try {
        const saved = await api(client ? '/api/clients/' + client.id : '/api/clients', { method: client ? 'PUT' : 'POST', body });
        toast('Ο πελάτης αποθηκεύτηκε');
        location.hash = '/client/' + saved.id + '/profile';
        bus.refresh();
      } catch (e) { if (err) err.textContent = e.message; }
    },
    'del-client': async () => {
      if (!client || !confirm('Διαγραφή πελάτη και μετρήσεων; Τα διαιτολόγια μένουν, χωρίς σύνδεση.')) return;
      await api('/api/clients/' + client.id, { method: 'DELETE' });
      location.hash = '/clients';
    },
    'invite': async () => {
      const portal = await api('/api/clients/' + client.id + '/invite', { method: 'POST' });
      toast('Νέα πρόσκληση');
      const link = location.origin + '/#/join/' + portal.token;
      modal(`<h2>Πρόσκληση</h2><p>Κωδικός: <b>${esc(portal.code)}</b></p><p class="muted">Σύνδεσμος (τον στέλνετε εσείς, δεν φεύγει email):</p><input readonly value="${esc(link)}"><div class="actions" style="margin-top:8px"><button type="button" class="primary" id="cp">Αντιγραφή συνδέσμου</button></div>`);
      document.getElementById('cp').onclick = () => copyText(link);
    },
    'copy-code': (el) => copyText(el.dataset.text),
  });
  const link = client?.portal ? location.origin + '/#/join/' + client.portal.token : '';
  return `${client ? `<div class="page-h"><div><h1>${esc(client.name)}</h1></div></div>${tabs(client.id, 'profile')}` : `<div class="page-h"><div><h1>Νέος πελάτης</h1></div></div>`}
  <form class="card" data-submit="save-client">
    <div class="grid-2">
      <div><label class="lbl">Ονοματεπώνυμο</label><input name="name" required value="${esc(c.name)}"></div>
      <div><label class="lbl">Email</label><input name="email" type="email" value="${esc(c.email || '')}"></div>
      <div><label class="lbl">Τηλέφωνο</label><input name="phone" value="${esc(c.phone || '')}"></div>
      <div><label class="lbl">Φύλο</label><select name="sex"><option value="">—</option><option value="female" ${c.sex === 'female' ? 'selected' : ''}>Γυναίκα</option><option value="male" ${c.sex === 'male' ? 'selected' : ''}>Άνδρας</option><option value="other" ${c.sex === 'other' ? 'selected' : ''}>Άλλο / δεν δηλώνεται</option></select></div>
      <div><label class="lbl">Ημερομηνία γέννησης</label><input name="dob" type="date" value="${esc(c.dob || '')}"></div>
      <div><label class="lbl">Ηλικία (αν δεν υπάρχει ημερομηνία)</label><input name="ageYears" type="number" min="0" max="120" value="${c.ageYears ?? ''}"></div>
      <div><label class="lbl">Ύψος (cm)</label><input name="heightCm" type="number" step="0.1" value="${c.heightCm ?? ''}"></div>
      <div><label class="lbl">Τιμή συνεδρίας (€)</label><input name="sessionPrice" type="number" min="0" step="0.5" value="${c.sessionPrice ?? 0}"></div>
    </div>
    <label class="lbl">Ετικέτες (χωρισμένες με κόμμα)</label><input name="tags" value="${esc((c.tags || []).join(', '))}">
    <label class="lbl">Στόχος</label><textarea name="goalNotes" rows="2">${esc(c.goalNotes || '')}</textarea>
    <label class="lbl">Αλλεργίες / αποφυγές</label><textarea name="allergies" rows="2">${esc(c.allergies || '')}</textarea>
    <p class="lbl">Σημάνσεις (ήπια φίλτρα στα τρόφιμα)</p>
    <div class="actions"><label class="checkline"><input type="checkbox" name="vegan" ${prefs.vegan ? 'checked' : ''}> Vegan</label><label class="checkline"><input type="checkbox" name="fasting" ${prefs.fasting ? 'checked' : ''}> Νηστεία</label><label class="checkline"><input type="checkbox" name="keto" ${prefs.keto ? 'checked' : ''}> Keto</label><label class="checkline"><input type="checkbox" name="carbLoading" ${prefs.carbLoading ? 'checked' : ''}> Φόρτιση υδατανθράκων</label></div>
    <p class="err" id="cerr"></p>
    <button class="primary" type="submit">Αποθήκευση</button>
  </form>
  ${client ? `<div class="card"><h2>Πύλη πελάτη</h2>${client.portalUser ? '<p class="banner info">Ο πελάτης έχει ήδη λογαριασμό.</p>' : '<p class="muted">Με κωδικό ή σύνδεσμο ορίζει κωδικό και βλέπει το κοινοποιημένο πλάνο.</p>'}
    ${client.portal ? `<p>Κωδικός: <b>${esc(client.portal.code)}</b> <button type="button" class="sm" data-act="copy-code" data-text="${esc(client.portal.code)}">Αντιγραφή</button></p><p class="muted">${esc(link)}</p><button type="button" class="sm" data-act="copy-code" data-text="${esc(link)}">Αντιγραφή συνδέσμου</button>` : ''}
    <p><button type="button" data-act="invite">${client.portal ? 'Νέα πρόσκληση' : 'Δημιουργία πρόσκλησης'}</button></p>
    <p class="muted">Νέα πρόσκληση ακυρώνει τον προηγούμενο σύνδεσμο. Δεν στέλνουμε email.</p></div>
    <p><button type="button" class="danger" data-act="del-client">Διαγραφή πελάτη</button></p>` : ''}`;
}

async function measures(client) {
  const visits = await api('/api/clients/' + client.id + '/visits');
  let edit = visits[visits.length - 1] || null;
  let sub = 'entry';
  const draw = () => {
    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = measuresHtml(client, visits, edit, sub);
    setHandlers(measureHandlers());
    bus.handlers = measureHandlers();
  };
  function measureHandlers() {
    return {
      'sub': (el) => { sub = el.dataset.sub; draw(); },
      'pick-visit': (el) => { edit = visits.find(v => v.id === el.dataset.id) || null; sub = 'entry'; draw(); },
      'new-visit': () => { edit = null; sub = 'entry'; draw(); },
      'visit-save': async (data) => {
        const body = { date: data.date, notes: data.notes, anthro: {}, skinfolds: {}, circ: {}, vitamins: {}, blood: {}, biochem: {}, hormones: {} };
        for (const [k, v] of Object.entries(data)) {
          const dot = k.indexOf('.');
          if (dot < 0) continue;
          const sec = k.slice(0, dot); const field = k.slice(dot + 1);
          if (!body[sec]) continue;
          body[sec][field] = v === '' ? null : Number(v);
        }
        if (!body.anthro.heightCm && client.heightCm) body.anthro.heightCm = client.heightCm;
        const err = document.getElementById('verr');
        try {
          const saved = edit?.id ? await api('/api/visits/' + edit.id, { method: 'PUT', body }) : await api('/api/clients/' + client.id + '/visits', { method: 'POST', body });
          toast('Η επίσκεψη αποθηκεύτηκε');
          const idx = visits.findIndex(v => v.id === saved.id);
          if (idx >= 0) visits[idx] = saved; else visits.push(saved);
          visits.sort((a, b) => a.date.localeCompare(b.date));
          edit = saved;
          draw();
        } catch (e) { if (err) err.textContent = e.message; }
      },
      'visit-del': async () => {
        if (!edit?.id || !confirm('Διαγραφή επίσκεψης;')) return;
        await api('/api/visits/' + edit.id, { method: 'DELETE' });
        const idx = visits.findIndex(v => v.id === edit.id);
        if (idx >= 0) visits.splice(idx, 1);
        edit = visits[visits.length - 1] || null;
        draw();
      },
      'live': () => updateLive(),
      'bmr-fill': () => {
        const form = document.getElementById('vform');
        const w = Number(form.querySelector('[name="anthro.weightKg"]').value);
        const h = Number(form.querySelector('[name="anthro.heightCm"]').value) || client.heightCm;
        const age = ageFromDob(client.dob) ?? client.ageYears;
        const sex = client.sex === 'male' ? 'male' : 'female';
        if (!w || !h || age == null) { toast('Χρειάζονται βάρος, ύψος και ηλικία'); return; }
        form.querySelector('[name="anthro.bmrKcal"]').value = Math.round(bmrMifflin({ sex, kg: w, cm: h, age }));
      },
    };
  }
  setHandlers(measureHandlers());
  return measuresHtml(client, visits, edit, sub);
}

function updateLive() {
  const form = document.getElementById('vform');
  if (!form) return;
  const num = name => { const v = form.querySelector(`[name="${name}"]`)?.value; return v === '' || v == null ? null : Number(v); };
  const w = num('anthro.weightKg'); const h = num('anthro.heightCm');
  const b = document.getElementById('bmiLive');
  if (b) b.textContent = w && h ? fmt(bmi(w, h), 1) : '—';
  const sf = {};
  for (const k of ['triceps', 'biceps', 'subscapular', 'suprailiac', 'thigh', 'calf']) sf[k] = num('skinfolds.' + k);
  const s = document.getElementById('sumLive');
  if (s) { const v = skinfoldSum(sf); s.textContent = v == null ? '—' : fmt(v, 1) + ' mm'; }
  const ratio = whr({ waist: num('circ.waist'), hip: num('circ.hip') });
  const wr = document.getElementById('whrLive');
  if (wr) wr.textContent = ratio == null ? '—' : fmt(ratio, 2);
}

function val(visit, sec, key) {
  const v = visit?.[sec]?.[key];
  return v == null ? '' : v;
}
function measuresHtml(client, visits, edit, sub) {
  const v = edit || { date: todayISO(), notes: '', anthro: { heightCm: client.heightCm || null } };
  const charts = `<div class="grid-2">${lineChart(series(visits, 'weightKg'), { title: 'Βάρος (kg)', color: '#B8960B', unit: 'kg' })}${lineChart(series(visits, 'bodyFatPct'), { title: 'Σωματικό λίπος (%)', color: '#c47b12', unit: '%' })}${lineChart(series(visits, 'muscleKg'), { title: 'Μυϊκή μάζα (kg)', color: '#1d6fbf', unit: 'kg' })}</div>`;
  const sheet = sheetTable(visits);
  const bmi0 = v.anthro?.weightKg && v.anthro?.heightCm ? fmt(bmi(v.anthro.weightKg, v.anthro.heightCm), 1) : '—';
  const sum0 = skinfoldSum(v.skinfolds);
  const whr0 = whr(v.circ);
  const form = `<form id="vform" data-submit="visit-save"><div class="grid-2"><div><label class="lbl">Ημερομηνία</label><input name="date" type="date" required value="${esc(v.date || todayISO())}"></div><div><label class="lbl">BMI</label><p id="bmiLive" style="margin:8px 0">${bmi0}</p></div></div>
    <label class="lbl">Σημειώσεις συνεδρίας</label><textarea name="notes" rows="3">${esc(v.notes || '')}</textarea>
    ${MEASURE_FORM.map((sec, idx) => `<details class="fold" ${idx === 0 ? 'open' : ''}><summary>${esc(sec.title)}</summary><p class="muted">${esc(sec.note || '')}</p><div class="grid-3">${sec.fields.map(f => `<div><label class="lbl">${esc(f.label)} (${esc(f.unit)})</label><input name="${sec.id}.${f.key}" type="number" step="${f.step}" value="${esc(val(v, sec.id, f.key))}" data-input="live"></div>`).join('')}</div>${sec.id === 'anthro' ? `<p class="muted">Μέση / ισχίο: <b id="whrLive">${whr0 == null ? '—' : fmt(whr0, 2)}</b> (από τις μεζούρες). <button type="button" class="sm" data-act="bmr-fill">Υπολογισμός BMR (Mifflin)</button></p>` : ''}${sec.id === 'skinfolds' ? `<p>Άθροισμα: <b id="sumLive">${sum0 == null ? '—' : fmt(sum0, 1) + ' mm'}</b></p>` : ''}</details>`).join('')}
    <p class="err" id="verr"></p><div class="actions"><button class="primary" type="submit">Αποθήκευση επίσκεψης</button>${edit?.id ? '<button type="button" class="danger" data-act="visit-del">Διαγραφή</button>' : ''}</div></form>`;
  return `<div class="page-h"><div><h1>${esc(client.name)}</h1><p class="muted">Φύλλο παρακολούθησης</p></div><a class="btn" href="/print.html?sheet=visits&client=${esc(client.id)}" target="_blank" rel="noopener">Εκτύπωση</a></div>${tabs(client.id, 'measures')}
  <div class="tabs"><button type="button" class="${sub === 'entry' ? 'on' : ''}" data-act="sub" data-sub="entry">Καταχώριση</button><button type="button" class="${sub === 'sheet' ? 'on' : ''}" data-act="sub" data-sub="sheet">Φύλλο</button><button type="button" class="${sub === 'charts' ? 'on' : ''}" data-act="sub" data-sub="charts">Γραφήματα</button></div>
  ${sub !== 'entry' ? '' : `<div class="card"><div class="actions" style="margin-bottom:8px"><button type="button" class="primary" data-act="new-visit">Νέα επίσκεψη</button>${visits.map(x => `<button type="button" class="sm ${edit?.id === x.id ? 'primary' : ''}" data-act="pick-visit" data-id="${esc(x.id)}">${esc(elDate(x.date))}</button>`).join('')}</div>${form}<p class="muted">Κενά πεδία επιτρέπονται. Οι εργαστηριακές τιμές καταγράφονται, δεν ερμηνεύονται.</p></div>`}
  ${sub === 'sheet' ? `<div class="card">${sheet}</div>` : ''}
  ${sub === 'charts' ? `<div class="card">${charts}</div>` : ''}`;
}
function series(visits, key) {
  return visits.filter(v => v.anthro?.[key] != null).map(v => ({ label: v.date.slice(8) + '/' + v.date.slice(5, 7), value: v.anthro[key] }));
}
function sheetTable(visits) {
  if (!visits.length) return '<p class="muted">Δεν υπάρχουν επισκέψεις.</p>';
  const head = visits.map(v => `<th class="num">${esc(elDate(v.date))}</th>`).join('');
  return sheetSections(visits[0]).map(sec => {
    const rows = sec.rows.map(row => {
      const cells = visits.map(v => {
        const found = sheetSections(v).find(s => s.title === sec.title)?.rows.find(r => r.label === row.label);
        return `<td class="num">${found?.value == null || found.value === '' ? '' : esc(fmt(found.value, 2))}</td>`;
      }).join('');
      return `<tr><td>${esc(row.label)}${row.unit ? ' <span class="muted">' + esc(row.unit) + '</span>' : ''}</td>${cells}</tr>`;
    }).join('');
    const notes = visits.some(v => v.notes) && sec.title === 'Σωματομετρικές' ? `<tr><td>Σημειώσεις</td>${visits.map(v => `<td>${esc(v.notes || '')}</td>`).join('')}</tr>` : '';
    return `<h3 style="margin:12px 0 6px">${esc(sec.title)}</h3><div class="table-wrap"><table><tr><th>Μέτρηση</th>${head}</tr>${rows}${notes}</table></div>`;
  }).join('');
}

async function energy(client) {
  const visits = await api('/api/clients/' + client.id + '/visits');
  const latest = [...visits].reverse().find(v => v.anthro?.weightKg);
  const saved = client.energy || {};
  const age = ageFromDob(client.dob) ?? client.ageYears;
  setHandlers({ 'save-energy': () => saveEnergy(client, false), 'make-plan': () => saveEnergy(client, true) });
  return `<div class="page-h"><div><h1>Ενεργειακές ανάγκες</h1><p class="muted">Εκτιμήσεις, όχι μέτρηση και όχι ιατρική συμβουλή.</p></div></div>${tabs(client.id, 'energy')}
  <p class="muted">Κατηγορίες BMI, Cockcroft–Gault, TyG και φυτικές ίνες είναι στα <a href="#/tools">Εργαλεία</a>.</p>
  <div class="card" id="energy">
    <div class="grid-3">
      <div><label class="lbl">Βάρος (kg)</label><input id="ew" type="number" step="0.1" value="${saved.weightKg ?? latest?.anthro?.weightKg ?? ''}"></div>
      <div><label class="lbl">Ύψος (cm)</label><input id="eh" type="number" step="0.1" value="${saved.heightCm ?? client.heightCm ?? latest?.anthro?.heightCm ?? ''}"></div>
      <div><label class="lbl">Ηλικία</label><input id="ea" type="number" value="${saved.age ?? age ?? ''}"></div>
    </div>
    <label class="lbl">Εξίσωση που εφαρμόζεται</label>
    <div class="actions"><label class="checkline"><input type="radio" name="eq" value="mifflin" ${saved.equation !== 'harris' ? 'checked' : ''}> Mifflin–St Jeor</label><label class="checkline"><input type="radio" name="eq" value="harris" ${saved.equation === 'harris' ? 'checked' : ''}> Harris–Benedict (αναθ.)</label></div>
    ${client.sex === 'other' || !client.sex ? '<p class="muted">Οι εξισώσεις έχουν δημοσιευτεί για γυναίκα / άνδρα. Διαλέξτε ποια εκτίμηση θα χρησιμοποιηθεί.</p><div class="actions"><label class="checkline"><input type="radio" name="sexUsed" value="female" checked> Γυναικεία</label><label class="checkline"><input type="radio" name="sexUsed" value="male"> Ανδρική</label></div>' : `<input type="hidden" name="sexUsed" value="${client.sex}">`}
    <label class="lbl">Δραστηριότητα</label><select id="eact">${ACTIVITIES.map(a => `<option value="${a.factor}" ${String(saved.activity) === String(a.factor) ? 'selected' : ''}>${esc(a.label)} · ${a.factor} · ${esc(a.detail)}</option>`).join('')}</select>
    <div class="grid-3" style="margin-top:8px"><div><label class="lbl">Στόχος kcal (προσυμπληρώνεται με το TDEE)</label><input id="ekcal" type="number" value="${saved.kcalTarget ?? ''}"></div><div><label class="lbl">Πρωτεΐνη g/kg</label><input id="epk" type="number" step="0.1" value="${saved.proteinPerKg ?? 1.2}"></div><div><label class="lbl">Υδατάνθρακες % ενέργειας</label><input id="ecp" type="number" step="1" value="45"></div></div>
    <label class="checkline"><input type="checkbox" id="ecarb" checked> Να μπει στόχος ισοδυνάμων υδατανθράκων (γραμμάρια ÷ 15). Δεν μοιράζει τις ομάδες.</label>
    <div id="eres" class="banner info" style="margin-top:10px"></div>
    <div class="actions"><button type="button" class="primary" data-act="save-energy">Αποθήκευση εκτίμησης</button><button type="button" data-act="make-plan">Νέο διαιτολόγιο με αυτόν τον στόχο</button></div>
  </div>`;
}
function readEnergy(client) {
  const root = document.getElementById('energy');
  const kg = Number(root.querySelector('#ew').value);
  const cm = Number(root.querySelector('#eh').value);
  const age = Number(root.querySelector('#ea').value);
  const sex = root.querySelector('input[name="sexUsed"]:checked')?.value || root.querySelector('[name="sexUsed"]')?.value || (client.sex === 'male' ? 'male' : 'female');
  const eq = root.querySelector('input[name="eq"]:checked')?.value || 'mifflin';
  const act = Number(root.querySelector('#eact').value);
  if (!(kg > 0) || !(cm > 0) || !(age >= 0)) return { error: 'Συμπληρώστε βάρος, ύψος και ηλικία.' };
  const both = {
    mifflinF: bmrMifflin({ sex: 'female', kg, cm, age }), mifflinM: bmrMifflin({ sex: 'male', kg, cm, age }),
    harrisF: bmrHarris({ sex: 'female', kg, cm, age }), harrisM: bmrHarris({ sex: 'male', kg, cm, age }),
  };
  const bmr = Math.round((eq === 'harris' ? bmrHarris : bmrMifflin)({ sex, kg, cm, age }));
  const tdee = Math.round(bmr * act);
  let kcal = Number(root.querySelector('#ekcal').value);
  if (!kcal) { kcal = tdee; root.querySelector('#ekcal').value = kcal; }
  const pG = kg * (Number(root.querySelector('#epk').value) || 0);
  const cPct = Number(root.querySelector('#ecp').value) || 0;
  const cG = (cPct / 100) * kcal / 4;
  const fG = (kcal - pG * 4 - cG * 4) / 9;
  return { kg, cm, age, sex, eq, act, bmr, tdee, kcal, pG, cG, fG, both, carbEx: cG / 15, pPerKg: Number(root.querySelector('#epk').value) || 0, useCarb: root.querySelector('#ecarb').checked };
}
async function saveEnergy(client, makePlan) {
  const box = document.getElementById('eres');
  const r = readEnergy(client);
  if (r.error) { box.textContent = r.error; return; }
  box.innerHTML = `Mifflin: γυναίκα ${fmt(r.both.mifflinF, 0)} / άνδρας ${fmt(r.both.mifflinM, 0)} kcal · Harris: ${fmt(r.both.harrisF, 0)} / ${fmt(r.both.harrisM, 0)}.<br>
    Επιλεγμένο BMR <b>${fmt(r.bmr, 0)}</b> · TDEE <b>${fmt(r.tdee, 0)}</b> · στόχος <b>${fmt(r.kcal, 0)}</b> kcal.<br>
    Πρωτεΐνη ${fmt(r.pG, 0)} g · υδατάνθρακες ${fmt(r.cG, 0)} g (${fmt(r.carbEx, 1)} ισοδ. υδατ.) · λίπος ${fmt(r.fG, 0)} g ${r.fG < 0 ? '<span class="over">(αρνητικό — μειώστε πρωτεΐνη ή υδατάνθρακες)</span>' : ''}.`;
  const payload = { equation: r.eq, sexUsed: r.sex, activity: String(r.act), weightKg: r.kg, heightCm: r.cm, age: r.age, bmr: r.bmr, tdee: r.tdee, kcalTarget: r.kcal, proteinPerKg: r.pPerKg, proteinG: Math.round(r.pG), carbsG: Math.round(r.cG), fatG: Math.round(r.fG) };
  await api('/api/clients/' + client.id + '/energy', { method: 'POST', body: payload });
  if (!makePlan) { toast('Η εκτίμηση αποθηκεύτηκε'); return; }
  const data = emptyPlan();
  data.targetKcal = String(Math.round(r.kcal));
  const split = percentsFromEstimate(r.kcal, { protein: r.pG, carbs: r.cG, fat: Math.max(0, r.fG) });
  data.macroTargets = split
    ? targetsFromPercents(r.kcal, split)
    : { ...emptyMacroTargets(), protein: String(Math.round(r.pG)), carbs: String(Math.round(r.cG)), fat: String(Math.max(0, Math.round(r.fG))) };
  if (r.useCarb) data.exchangeTargets.carb = String(Math.round(r.carbEx));
  const plan = await api('/api/plans', { method: 'POST', body: { clientId: client.id, clientName: client.name, title: `Πλάνο ${Math.round(r.kcal)} kcal`, data } });
  location.hash = '/plan/' + plan.id;
}
async function plans(client) {
  const list = await api('/api/plans?clientId=' + client.id);
  setHandlers({
    'new-plan': async () => {
      const plan = await api('/api/plans', { method: 'POST', body: { clientId: client.id, clientName: client.name, title: 'Νέο διαιτολόγιο' } });
      location.hash = '/plan/' + plan.id;
    },
  });
  return `<div class="page-h"><div><h1>Διαιτολόγια</h1></div><button type="button" class="primary" data-act="new-plan">Νέο για ${esc(client.name)}</button></div>${tabs(client.id, 'plans')}
  <div class="card">${list.length ? list.map(p => `<div class="list-row"><div><a href="#/plan/${esc(p.id)}"><b>${esc(p.title)}</b></a><div class="muted">${p.macroSummary ? esc(p.macroSummary) + ' · ' : (p.targetKcal ? esc(p.targetKcal) + ' kcal · ' : '')}${p.visibleToClient ? 'ορατό στην πύλη · ' : ''}${esc(elDate(p.updatedAt.slice(0, 10)))}</div></div><a class="btn sm" href="/print.html?id=${esc(p.id)}" target="_blank" rel="noopener">Εκτύπωση</a></div>`).join('') : emptyState('Κανένα διαιτολόγιο', 'Δημιουργήστε εβδομάδα και συνδέστε τον στόχο από την καρτέλα Ενέργεια.', 'Νέο διαιτολόγιο', 'new-plan')}</div>`;
}

async function diary(client) {
  const rows = await api('/api/clients/' + client.id + '/diary');
  setHandlers({});
  return `<div class="page-h"><div><h1>Ημερολόγιο πελάτη</h1><p class="muted">Ό,τι καταγράφει στην πύλη.</p></div></div>${tabs(client.id, 'diary')}
  <div class="card">${rows.length ? rows.map(r => `<article style="margin-bottom:12px"><b>${esc(elDate(r.date))}</b> <span class="pill">${r.waterGlasses || 0} ποτήρια</span><p style="white-space:pre-wrap">${esc(r.mealsText || '—')}</p></article>`).join('') : '<p class="muted">Ο πελάτης δεν έχει γράψει ακόμη.</p>'}</div>`;
}

async function messages(client) {
  const list = await api('/api/clients/' + client.id + '/messages');
  setHandlers({
    'msg': async (data, form) => {
      if (!data.text?.trim()) return;
      await api('/api/clients/' + client.id + '/messages', { method: 'POST', body: { text: data.text } });
      form.reset();
      bus.refresh();
    },
  });
  return `<div class="page-h"><div><h1>Μηνύματα</h1></div></div>${tabs(client.id, 'messages')}
  <div class="card">${list.map(m => `<div class="msg ${m.authorRole === 'dietitian' ? 'mine' : ''}"><div class="meta">${esc(m.authorName)} · ${esc(elDate(m.createdAt.slice(0, 10)))}</div>${esc(m.text)}</div>`).join('') || '<p class="muted">Κανένα μήνυμα.</p>'}
    <form data-submit="msg"><textarea name="text" rows="3" placeholder="Απάντηση"></textarea><button class="primary" type="submit">Αποστολή</button></form></div>`;
}
