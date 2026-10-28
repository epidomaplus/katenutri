import { api } from './api.js';
import { bus, esc, setHandlers, modal, toast, statusLabel } from './util.js';
import { euro, elDateTime, todayISO } from '/shared/text.js';

let cursor = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })();

function monthKey() { return `${cursor.y}-${String(cursor.m).padStart(2, '0')}`; }
function grid(y, m) {
  const first = new Date(y, m - 1, 1);
  const pad = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = Array(pad).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export async function calendarPage() {
  const month = monthKey();
  const [appts, stats, clients] = await Promise.all([
    api(`/api/appointments?from=${month}-01&to=${month}-31`),
    api('/api/appointments/stats?month=' + month),
    api('/api/clients'),
  ]);
  const byDay = {};
  for (const a of appts) {
    const d = Number(a.start.slice(8, 10));
    (byDay[d] ||= []).push(a);
  }
  const today = todayISO();
  setHandlers({
    'cal-prev': () => { cursor.m -= 1; if (cursor.m < 1) { cursor.m = 12; cursor.y--; } bus.refresh(); },
    'cal-next': () => { cursor.m += 1; if (cursor.m > 12) { cursor.m = 1; cursor.y++; } bus.refresh(); },
    'cal-new': (el) => openAppt(clients, el.dataset.start || `${month}-01T09:00`),
    'cal-open': (el) => openAppt(clients, null, appts.find(a => a.id === el.dataset.id)),
  });
  const names = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
  return `<div class="page-h"><div><h1>Ραντεβού</h1><p class="muted">${esc(month)}</p></div><div class="actions"><button type="button" data-act="cal-prev">←</button><button type="button" data-act="cal-next">→</button><button type="button" class="primary" data-act="cal-new">Νέο ραντεβού</button></div></div>
  <div class="grid-stats">
    <div class="card stat"><span>Ολοκληρωμένα</span><b>${stats.done}</b></div>
    <div class="card stat"><span>Εισπράξεις</span><b>${esc(euro(stats.revenueDone))}</b></div>
    <div class="card stat"><span>Αναμενόμενα</span><b>${esc(euro(stats.revenueScheduled))}</b></div>
    <div class="card stat"><span>Ακυρώσεις</span><b>${stats.cancelled}</b></div>
  </div>
  <div class="card"><div class="cal-grid">${names.map(n => `<div class="cal-dow">${n}</div>`).join('')}${grid(cursor.y, cursor.m).map(d => {
    if (!d) return '<div class="cal-cell out"></div>';
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    const items = byDay[d] || [];
    return `<button type="button" class="cal-cell ${iso === today ? 'today' : ''}" data-act="cal-new" data-start="${iso}T09:00"><b>${d}</b>${items.slice(0, 3).map(a => `<span class="dot ${esc(a.status)}">${esc(a.start.slice(11, 16))} ${esc(a.clientName)}</span>`).join('')}</button>`;
  }).join('')}</div></div>
  <div class="card"><h2>Λίστα μήνα</h2>${appts.length ? appts.map(a => `<div class="list-row"><div><b>${esc(a.clientName)}</b><div class="muted">${esc(elDateTime(a.start))} · ${esc(statusLabel(a.status))} · ${a.durationMin}′ · ${esc(euro(a.cost))}${a.notes ? ' · ' + esc(a.notes) : ''}</div></div><button type="button" class="sm" data-act="cal-open" data-id="${esc(a.id)}">Άνοιγμα</button></div>`).join('') : '<p class="muted">Κανένα ραντεβού αυτόν τον μήνα.</p>'}</div>`;
}

function openAppt(clients, start, existing) {
  const a = existing || { start: start || '', durationMin: 45, cost: '', status: 'scheduled', notes: '', clientId: '' };
  const m = modal(`<h2>${existing ? 'Ραντεβού' : 'Νέο ραντεβού'}</h2><form id="af">
    <label class="lbl">Πελάτης</label><select name="clientId" required>${clients.map(c => `<option value="${esc(c.id)}" ${c.id === a.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <div class="grid-2"><div><label class="lbl">Ημερομηνία και ώρα</label><input name="start" type="datetime-local" required value="${esc(a.start || '')}"></div>
    <div><label class="lbl">Διάρκεια (λεπτά)</label><input name="durationMin" type="number" min="10" max="240" value="${esc(a.durationMin || 45)}"></div></div>
    <div class="grid-2"><div><label class="lbl">Κόστος (€)</label><input name="cost" type="number" min="0" step="0.5" value="${a.cost ?? ''}"></div>
    <div><label class="lbl">Κατάσταση</label><select name="status"><option value="scheduled" ${a.status === 'scheduled' ? 'selected' : ''}>Προγραμματισμένο</option><option value="done" ${a.status === 'done' ? 'selected' : ''}>Ολοκληρωμένο</option><option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>Ακυρωμένο</option></select></div></div>
    <label class="lbl">Σημείωση</label><textarea name="notes" rows="2">${esc(a.notes || '')}</textarea>
    <p class="err" id="aerr"></p>
    <div class="actions"><button class="primary" type="submit">Αποθήκευση</button>${existing ? '<button type="button" class="danger" id="adel">Διαγραφή</button>' : ''}<button type="button" id="ax">Άκυρο</button></div>
  </form>`);
  const sel = m.el.querySelector('[name=clientId]');
  const cost = m.el.querySelector('[name=cost]');
  sel.onchange = () => { const c = clients.find(x => x.id === sel.value); if (c && cost.value === '') cost.value = c.sessionPrice; };
  if (!existing && sel.value) { const c = clients.find(x => x.id === sel.value); if (c) cost.value = c.sessionPrice; }
  m.el.querySelector('#ax').onclick = () => m.close();
  if (existing) m.el.querySelector('#adel').onclick = async () => {
    if (!confirm('Διαγραφή ραντεβού;')) return;
    await api('/api/appointments/' + existing.id, { method: 'DELETE' });
    m.close(); bus.refresh();
  };
  m.el.querySelector('#af').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/api/appointments' + (existing ? '/' + existing.id : ''), { method: existing ? 'PUT' : 'POST', body });
      toast('Το ραντεβού αποθηκεύτηκε');
      m.close(); bus.refresh();
    } catch (err) { m.el.querySelector('#aerr').textContent = err.message; }
  };
}
