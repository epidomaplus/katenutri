import { api } from './api.js';
import { bus, esc, setHandlers, emptyState, toast, statusLabel } from './util.js';
import { euro, elDate, elDateTime, localStamp, todayISO } from '/shared/text.js';
import { EXCHANGE_DISCLAIMER } from '/shared/nutrition.js';

export async function dashboardPage() {
  const data = await api('/api/dashboard?now=' + encodeURIComponent(localStamp()));
  const s = data.monthStats;
  setHandlers({
    'dash-todo': async (formData) => {
      if (!formData.title) return;
      await api('/api/todos', { method: 'POST', body: formData });
      toast('Η εργασία προστέθηκε');
      bus.refresh();
    },
  });
  return `<div class="page-h"><div><h1>Σήμερα</h1><p class="muted">${esc(elDate(todayISO()))}</p></div><div class="actions"><a class="btn primary" href="#/clients">Νέος πελάτης</a><a class="btn" href="#/plans">Διαιτολόγιο</a></div></div>
  <div class="grid-stats">
    <div class="card stat"><span>Πελάτες</span><b>${data.clientCount}</b></div>
    <div class="card stat"><span>Διαιτολόγια</span><b>${data.planCount}</b></div>
    <div class="card stat"><span>Ραντεβού σήμερα</span><b>${data.todayAppointments.length}</b></div>
    <div class="card stat"><span>Εισπράξεις μήνα</span><b>${esc(euro(s.revenueDone))}</b></div>
  </div>
  <div class="grid-2">
    <div class="card"><h2>Ραντεβού σήμερα</h2>
      ${data.todayAppointments.length ? data.todayAppointments.map(a => `<div class="list-row"><div><b>${esc(a.clientName)}</b><div class="muted">${esc(a.start.slice(11, 16))} · ${esc(statusLabel(a.status))} · ${esc(euro(a.cost))}</div></div></div>`).join('') : '<p class="muted">Κανένα ραντεβού σήμερα.</p>'}
      <p><a href="#/calendar">Ημερολόγιο μήνα</a></p>
    </div>
    <div class="card"><h2>Επόμενα ραντεβού</h2>
      ${data.upcoming.length ? data.upcoming.map(a => `<div class="list-row"><div><b>${esc(a.clientName)}</b><div class="muted">${esc(elDateTime(a.start))}</div></div></div>`).join('') : '<p class="muted">Δεν υπάρχουν προγραμματισμένα.</p>'}
    </div>
  </div>
  <div class="grid-2">
    <div class="card"><h2>Ανοιχτές εργασίες</h2>
      ${data.todos.length ? data.todos.map(t => `<div class="list-row"><div>${esc(t.title)}</div><span class="muted">${t.due ? esc(elDate(t.due)) : ''}</span></div>`).join('') : '<p class="muted">Καμία ανοιχτή εργασία.</p>'}
      <form data-submit="dash-todo" class="actions" style="margin-top:8px"><input name="title" placeholder="Νέα εργασία"><button class="primary" type="submit">Προσθήκη</button></form>
    </div>
    <div class="card"><h2>Μήνας ${esc(s.month)}</h2>
      <p>Ολοκληρωμένα: <b>${s.done}</b> · Προγραμματισμένα: <b>${s.scheduled}</b> · Ακυρώσεις: <b>${s.cancelled}</b></p>
      <p class="muted">Αναμενόμενα από προγραμματισμένα: ${esc(euro(s.revenueScheduled))}. Οι εισπράξεις μετρούν μόνο όσα σημειώθηκαν ως ολοκληρωμένα.</p>
      <p class="muted">${data.recipeCount} συνταγές στο αρχείο.</p>
    </div>
  </div>
  <p class="disclaimer">${esc(EXCHANGE_DISCLAIMER)}</p>`;
}

export async function todosPage() {
  const list = await api('/api/todos');
  const today = todayISO();
  setHandlers({
    'todo-add': async (data) => {
      await api('/api/todos', { method: 'POST', body: data });
      bus.refresh();
    },
    'todo-toggle': async (el) => {
      await api('/api/todos/' + el.dataset.id, { method: 'PUT', body: { done: el.dataset.done !== '1' } });
      bus.refresh();
    },
    'todo-del': async (el) => {
      if (!confirm('Διαγραφή εργασίας;')) return;
      await api('/api/todos/' + el.dataset.id, { method: 'DELETE' });
      bus.refresh();
    },
  });
  return `<div class="page-h"><div><h1>Εργασίες</h1><p class="muted">Προσωπική λίστα του λογαριασμού σας, με προθεσμία.</p></div></div>
  <form class="card grid-3" data-submit="todo-add" style="align-items:end">
    <div><label class="lbl">Τίτλος</label><input name="title" required></div>
    <div><label class="lbl">Προθεσμία</label><input name="due" type="date"></div>
    <div><button class="primary" type="submit">Προσθήκη</button></div>
  </form>
  <div class="card">${list.length ? list.map(t => `<div class="list-row"><label class="checkline"><input type="checkbox" data-act="todo-toggle" data-id="${esc(t.id)}" data-done="${t.done ? '1' : '0'}" ${t.done ? 'checked' : ''}><span ${t.due && !t.done && t.due < today ? 'class="over"' : ''}>${esc(t.title)}</span></label><span class="muted">${t.due ? esc(elDate(t.due)) : 'χωρίς προθεσμία'} <button type="button" class="sm danger" data-act="todo-del" data-id="${esc(t.id)}">Διαγραφή</button></span></div>`).join('') : emptyState('Καμία εργασία', 'Ό,τι θέλετε να θυμάστε για το γραφείο μπαίνει εδώ.', '', '')}</div>`;
}

export async function libraryPage() {
  setHandlers({});
  return `<div class="page-h"><div><h1>Βιβλιοθήκη</h1><p class="muted">Σύντομος οδηγός για ό,τι υπολογίζει η εφαρμογή. Δεν είναι συλλογή κλινικών κατευθυντήριων οδηγιών.</p></div></div>
  <div class="card"><h2>Ισοδύναμα</h2>
    <p>Τα ισοδύναμα («ανταλλαγές») ομαδοποιούν τρόφιμα ώστε μια μερίδα μιας ομάδας να αντικαθίσταται από μια μερίδα της ίδιας ομάδας, με παρόμοια θρεπτική απόδοση. Εδώ η κατάταξη είναι <b>εκπαιδευτική προσέγγιση</b>, όχι πρωτόκολλο νοσοκομείου ή εταιρείας.</p>
    <ul>
      <li><b>Ισοδύναμο υδατανθράκων:</b> γραμμάρια υδατανθράκων ÷ 15. Αθροίζει άμυλο, φρούτο, γάλα, λαχανικά και ό,τι άλλο έχει υδατάνθρακα.</li>
      <li><b>Άμυλο / ψωμί και φρούτο:</b> 1 μερίδα ≈ 15 g υδατανθράκων.</li>
      <li><b>Γάλα:</b> 1 μερίδα ≈ 12 g υδατανθράκων (κλασική λίστα). Γι’ αυτό ένα ποτήρι γάλα μπορεί να είναι 1,0 γάλα και ~0,8 ισοδύναμα υδατανθράκων.</li>
      <li><b>Λαχανικά:</b> 1 μερίδα ≈ 5 g υδατανθράκων.</li>
      <li><b>Κρέας:</b> 1 μερίδα ≈ 7 g πρωτεΐνης. Άπαχο έως 3 g λίπους στη μερίδα, μέτριο 3–7 g, παχύ πάνω από 7 g. Το τυρί και το αυγό μπαίνουν εδώ.</li>
      <li><b>Λίπος:</b> 1 μερίδα ≈ 5 g λίπους.</li>
      <li><b>Ελεύθερα:</b> δεν μετρούν ως μερίδα λίστας. Οι θερμίδες τους φαίνονται κανονικά στα μακροθρεπτικά.</li>
      <li><b>Όσπρια:</b> κάθε ισοδύναμο αμύλου μετρά και ως 1 άπαχο κρέας, εκτός από χούμους και αρακά.</li>
    </ul>
    <p>${esc(EXCHANGE_DISCLAIMER)}</p>
  </div>
  <div class="card"><h2>Ενεργειακές ανάγκες</h2>
    <p>Ο βασικός μεταβολισμός εκτιμάται με Mifflin–St Jeor και με την αναθεωρημένη Harris–Benedict (Roza &amp; Shizgal, 1984). Το TDEE είναι το BMR επί τον συντελεστή δραστηριότητας. Είναι εκτίμηση για σχεδιασμό, όχι μέτρηση.</p>
    <p>Οι εξισώσεις δημοσιεύτηκαν για τις κατηγορίες γυναίκα / άνδρας. Αν το φύλο δεν δηλώνεται, διαλέγετε ποια εκτίμηση θα χρησιμοποιήσετε.</p>
  </div>
  <div class="card"><h2>Μικροθρεπτικά και εργαστήριο</h2>
    <p>Νάτριο, φυτικές ίνες, ασβέστιο, σίδηρος, βιταμίνη C και D στα τρόφιμα είναι κατά προσέγγιση, συχνά από τάξη μεγέθους δημόσιων πινάκων. Η σύγκριση με ένα ενδεικτικό μέγεθος ενηλίκων είναι μόνο για ανάγνωση.</p>
    <p>Οι τιμές αίματος στο φύλλο παρακολούθησης καταγράφονται όπως τις περνάτε. Η εφαρμογή δεν τις χαρακτηρίζει υψηλές ή χαμηλές.</p>
  </div>
  <div class="card"><h2>Εργαλεία εκτίμησης</h2>
    <p>Στα <a href="#/tools">Εργαλεία</a> υπάρχουν BMI ενηλίκων, παιδιατρικά όρια Cole, Cockcroft–Gault, δείκτης TyG και στόχος φυτικών ινών. Όλα δηλώνονται ως εκτιμήσεις επαγγελματία, όχι ως διάγνωση.</p>
  </div>
  <div class="card"><h2>Τι δεν περιλαμβάνεται</h2>
    <p>Δεν υπάρχει αγορά κοινότητας, πρόσθετο συνομιλίας τεχνητής νοημοσύνης, εφαρμογή καταστήματος iOS/Android, ούτε βιβλιοθήκη άρθρων κατευθυντήριων οδηγιών. Η φωτογραφία γεύματος στην πύλη πελάτη δεν υποστηρίζεται σε αυτή την έκδοση.</p>
    <p class="muted">Δημόσιες πηγές σύνθεσης τροφίμων για όποιον θέλει να διασταυρώσει μια τιμή: USDA FoodData Central, EuroFIR, σελίδα υγιεινής διατροφής του ΠΟΥ.</p>
  </div>`;
}
