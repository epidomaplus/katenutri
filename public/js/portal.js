import { api, state } from './api.js';
import { bus, esc, setHandlers, toast } from './util.js';
import { fmt, elDate, todayISO } from '/shared/text.js';
import { normalizePlan, dayNut, dayEx, sumEx, EXCHANGE_DISCLAIMER } from '/shared/nutrition.js';
import { exText } from './format.js';

export async function portalPage(tab) {
  if (tab === 'diary') return diary();
  if (tab === 'messages') return messages();
  return plan();
}

async function plan() {
  const plans = await api('/api/portal/plans');
  if (!plans.length) {
    setHandlers({});
    return `<div class="card empty"><h2>Δεν έχει κοινοποιηθεί πλάνο</h2><p class="muted">Όταν ο διαιτολόγος ενεργοποιήσει την εμφάνιση, το εβδομαδιαίο διαιτολόγιο θα φανεί εδώ.</p></div>`;
  }
  let current = plans[0];
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const chosen = plans.find(p => p.id === params.get('plan')) || current;
  const full = await api('/api/portal/plans/' + chosen.id);
  const data = normalizePlan(full.data);
  let mode = localStorage.portalMode || 'both';
  const markup = () => data.days.map(day => {
      const n = dayNut(day); const ex = dayEx(day);
      if (!n.kcal && data.days.some(d => dayNut(d).kcal)) return '';
      return `<section class="card"><h2>${esc(day.name)} <span class="pill">${fmt(n.kcal, 0)} kcal</span> <span class="pill">${fmt(ex.carb, 1)} υδατ.</span></h2>
        ${data.mealNames.map((name, i) => {
          const items = day.meals[i] || [];
          if (!items.length) return '';
          const mt = items.reduce((s, it) => s + (it.kcal * it.grams / 100), 0);
          return `<p><b>${esc(name)}.</b> ${items.map(it => esc(it.name) + (it.grams ? ' ' + fmt(it.grams, 0) + ' g' : '')).join(', ')}
            ${mode !== 'exchanges' ? `<span class="muted"> — ${fmt(mt, 0)} kcal</span>` : ''}
            ${mode !== 'macros' ? `<span class="muted"> — ${esc(exText(sumEx(items)))}</span>` : ''}</p>`;
        }).join('') || '<p class="muted">Κενή ημέρα.</p>'}
        ${mode !== 'macros' ? `<p class="muted">${esc(exText(ex))}</p>` : ''}</section>`;
    }).join('');
  setHandlers({
    'p-mode': (el) => {
      mode = el.dataset.mode;
      localStorage.portalMode = mode;
      const host = document.getElementById('portal-plan');
      if (host) host.innerHTML = markup();
    },
  });
  return `<div class="page-h"><div><h1>${esc(full.title)}</h1><p class="muted">${full.clientName ? esc(full.clientName) + ' · ' : ''}${data.targetKcal ? 'Στόχος ' + esc(data.targetKcal) + ' kcal' : ''}</p></div>
    <div class="seg"><button type="button" data-act="p-mode" data-mode="macros">Μακροθρεπτικά</button><button type="button" data-act="p-mode" data-mode="exchanges">Ισοδύναμα</button><button type="button" data-act="p-mode" data-mode="both">Και τα δύο</button></div></div>
  ${plans.length > 1 ? `<p>${plans.map(p => `<a class="btn sm ${p.id === full.id ? 'primary' : ''}" href="#/portal?plan=${esc(p.id)}">${esc(p.title)}</a>`).join(' ')}</p>` : ''}
  <div id="portal-plan">${markup()}</div>
  ${data.notes ? `<div class="card"><h2>Οδηγίες</h2><p style="white-space:pre-wrap">${esc(data.notes)}</p></div>` : ''}
  <p class="disclaimer">${esc(EXCHANGE_DISCLAIMER)}</p>
  <p><a href="/print.html?id=${esc(full.id)}" target="_blank" rel="noopener">Εκτύπωση</a></p>`;
}

async function diary() {
  const rows = await api('/api/portal/diary');
  const date = todayISO();
  const todayRow = rows.find(r => r.date === date) || { mealsText: '', waterGlasses: 0 };
  setHandlers({
    'diary-save': async (data) => {
      await api('/api/portal/diary', { method: 'POST', body: data });
      toast('Το ημερολόγιο αποθηκεύτηκε');
      bus.refresh();
    },
    'water': (el) => {
      const input = document.querySelector('[name=waterGlasses]');
      const cur = Number(input.value) || 0;
      input.value = el.dataset.dir === 'plus' ? Math.min(30, cur + 1) : Math.max(0, cur - 1);
      paintDrops(Number(input.value));
    },
  });
  return `<div class="page-h"><div><h1>Ημερολόγιο</h1><p class="muted">Τι φάγατε και πόσα ποτήρια νερό. Το βλέπει ο διαιτολόγος στον φάκελό σας.</p></div></div>
  <form class="card" data-submit="diary-save">
    <label class="lbl">Ημέρα</label><input name="date" type="date" value="${esc(date)}" required>
    <label class="lbl">Γεύματα (ελεύθερο κείμενο)</label><textarea name="mealsText" rows="6" placeholder="Πρωινό: …">${esc(todayRow.mealsText || '')}</textarea>
    <label class="lbl">Ποτήρια νερού</label>
    <div class="water"><button type="button" class="sm" data-act="water" data-dir="minus">−</button><input name="waterGlasses" type="number" min="0" max="30" value="${todayRow.waterGlasses || 0}" style="max-width:80px"><button type="button" class="sm" data-act="water" data-dir="plus">+</button><span id="drops">${dropsHtml(todayRow.waterGlasses || 0)}</span></div>
    <p><button class="primary" type="submit">Αποθήκευση ημέρας</button></p>
  </form>
  <div class="card"><h2>Προηγούμενες ημέρες</h2>${rows.filter(r => r.mealsText || r.waterGlasses).map(r => `<div class="list-row"><div><b>${esc(elDate(r.date))}</b><div class="muted">${esc(r.mealsText || '')}</div></div><span class="pill">${r.waterGlasses || 0} ποτ.</span></div>`).join('') || '<p class="muted">Ακόμη κενό.</p>'}  </div>`;
}
function dropsHtml(n) {
  return Array.from({ length: 8 }, (_, i) => `<i class="drop ${i < n ? 'on' : ''}"></i>`).join('');
}
function paintDrops(n) {
  const host = document.getElementById('drops');
  if (host) host.innerHTML = dropsHtml(n);
}

async function messages() {
  const list = await api('/api/portal/messages');
  setHandlers({
    'msg-send': async (data, form) => {
      if (!data.text) return;
      await api('/api/portal/messages', { method: 'POST', body: data });
      form.reset();
      bus.refresh();
    },
  });
  return `<div class="page-h"><div><h1>Μηνύματα</h1><p class="muted">Σύντομο νήμα με ${esc(state.me.dietitianName || 'τον διαιτολόγο')}.</p></div></div>
  <div class="card">${list.map(m => `<div class="msg ${m.authorRole === 'client' ? 'mine' : ''}"><div class="meta">${esc(m.authorName)} · ${esc(elDate(m.createdAt.slice(0, 10)))}</div>${esc(m.text)}</div>`).join('') || '<p class="muted">Δεν υπάρχουν μηνύματα.</p>'}
    <form data-submit="msg-send"><textarea name="text" rows="3" placeholder="Το μήνυμά σας" required></textarea><p><button class="primary" type="submit">Αποστολή</button></p></form>
  </div>`;
}

