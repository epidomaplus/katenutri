import { api, state } from './api.js';
import { bus, esc, setHandlers, toast } from './util.js';

function authHandlers(mode) {
  const su = mode === 'signup';
  return {
    'auth-switch': () => {
      bus.handlers = authHandlers(su ? 'login' : 'signup');
      document.getElementById('app').innerHTML = authHtml(su ? 'login' : 'signup');
    },
    'auth-send': async (data) => {
      const err = document.getElementById('authErr');
      try {
        state.me = await api(su ? '/api/signup' : '/api/login', { method: 'POST', body: data });
        location.hash = '/';
        bus.refresh();
      } catch (e) { if (err) err.textContent = e.message; }
    },
  };
}
function authHtml(mode) {
  const su = mode === 'signup';
  const allow = state.cfg.allowSignup !== false;
  return `<div class="auth-wrap"><section class="auth-hero"><div>
    <img src="/icon.svg" width="48" height="48" alt="">
    <h1>${esc(state.cfg.appName || 'KateNutri')}</h1>
    <p>Πελάτες, μετρήσεις, ενεργειακές ανάγκες και εβδομαδιαία διαιτολόγια με μακροθρεπτικά και ισοδύναμα.</p>
    <ul>
      <li>Φύλλο παρακολούθησης και γραφήματα βάρους</li>
      <li>Ισοδύναμα μέσα στο πλάνο, στην ανάλυση και στην εκτύπωση</li>
      <li>Συνταγές, λίστα αγορών, ραντεβού και πύλη πελάτη</li>
    </ul>
    <p>Εργαλείο γραφείου. Οι τιμές είναι εκπαιδευτικές προσεγγίσεις και δεν αποτελούν ιατρική συμβουλή.</p>
  </div></section><section class="auth-panel"><div class="auth-card card"><h2>${su ? 'Νέος λογαριασμός' : 'Σύνδεση'}</h2>
    <form data-submit="auth-send">${su ? '<label class="lbl">Ονοματεπώνυμο</label><input name="name" autocomplete="name"><label class="lbl">Όνομα γραφείου</label><input name="practiceName">' : ''}
      <label class="lbl">Email</label><input name="email" type="email" required autocomplete="username">
      <label class="lbl">Κωδικός${su ? ' (τουλάχιστον 8 χαρακτήρες)' : ''}</label><input name="password" type="password" required autocomplete="${su ? 'new-password' : 'current-password'}">
      <p class="err" id="authErr"></p>
      <button class="primary" style="width:100%" type="submit">${su ? 'Δημιουργία λογαριασμού' : 'Σύνδεση'}</button>
    </form>
    ${allow ? `<p class="muted" style="text-align:center"><button type="button" class="ghost" data-act="auth-switch">${su ? 'Έχω ήδη λογαριασμό' : 'Νέος λογαριασμός'}</button></p>` : ''}
    <p class="muted" style="text-align:center"><a href="#/join">Έχω κωδικό πρόσκλησης πελάτη</a></p>
  </div></section></div>`;
}

export function authPage() {
  setHandlers(authHandlers('login'));
  return authHtml('login');
}

export function joinPage(token = '') {
  const handlers = {
    'join-send': async (data) => {
      const err = document.getElementById('joinErr');
      try {
        state.me = await api('/api/join', { method: 'POST', body: { ...data, token: token || data.token || '' } });
        location.hash = '/portal';
        bus.refresh();
      } catch (e) { if (err) err.textContent = e.message; }
    },
  };
  setHandlers(handlers);
  return `<div class="auth-panel" style="min-height:100vh"><div class="auth-card card"><h2>Πρόσβαση πελάτη</h2>
    <p class="muted">Βάλτε τον κωδικό που σας έδωσε ο διαιτολόγος ή ανοίξτε τον σύνδεσμο πρόσκλησης. Δεν στέλνουμε email αυτόματα.</p>
    <form data-submit="join-send">
      ${token ? `<input type="hidden" name="token" value="${esc(token)}"><p class="banner info">Ο σύνδεσμος πρόσκλησης αναγνωρίστηκε.</p>` : '<label class="lbl">Κωδικός πρόσκλησης</label><input name="code" required autocomplete="off">'}
      <label class="lbl">Ονοματεπώνυμο</label><input name="name" autocomplete="name">
      <label class="lbl">Email</label><input name="email" type="email" required autocomplete="username">
      <label class="lbl">Νέος κωδικός (τουλάχιστον 8)</label><input name="password" type="password" required minlength="8" autocomplete="new-password">
      <p class="err" id="joinErr"></p>
      <button class="primary" type="submit">Δημιουργία πρόσβασης</button>
      <a class="btn" href="#/">Σύνδεση διαιτολόγου</a>
    </form></div></div>`;
}

export async function accountPage() {
  const me = state.me;
  const diet = me.role !== 'client';
  setHandlers({
    'account-save': async (data) => {
      const err = document.getElementById('accErr');
      try {
        state.me = await api('/api/account', { method: 'POST', body: data });
        if (err) { err.className = 'ok'; err.textContent = 'Αποθηκεύτηκε.'; }
        toast('Τα στοιχεία λογαριασμού ενημερώθηκαν');
      } catch (e) { if (err) { err.className = 'err'; err.textContent = e.message; } }
    },
    'backup-dl': async () => {
      const data = await api('/api/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'katenutri-backup.json';
      a.click();
      URL.revokeObjectURL(a.href);
    },
    'backup-in': async (data) => {
      const err = document.getElementById('bakErr');
      const file = document.getElementById('bakFile')?.files?.[0];
      if (!file) { if (err) err.textContent = 'Επιλέξτε αρχείο.'; return; }
      try {
        const parsed = JSON.parse(await file.text());
        const res = await api('/api/backup', { method: 'POST', body: { currentPassword: data.currentPassword, data: parsed } });
        if (err) { err.className = 'ok'; err.textContent = `Εισήχθησαν ${res.clients} πελάτες.`; }
        state.me = await api('/api/me');
      } catch (e) { if (err) { err.className = 'err'; err.textContent = e.message; } }
    },
  });
  return `<div class="page-h"><div><h1>Λογαριασμός</h1><p class="muted">Η αλλαγή email μεταβιβάζει την είσοδο σε άλλον κάτοχο. Ο κωδικός μένει δικός σας μέχρι να τον αλλάξετε.</p></div></div>
  <form class="card" data-submit="account-save">
    <div class="grid-2">
      <div><label class="lbl">Ονοματεπώνυμο</label><input name="name" value="${esc(me.name || '')}"></div>
      <div><label class="lbl">Email</label><input name="email" type="email" value="${esc(me.email || '')}"></div>
      ${diet ? `<div><label class="lbl">Γραφείο</label><input name="practiceName" value="${esc(me.practiceName || '')}"></div>
      <div><label class="lbl">Τηλέφωνο</label><input name="phone" value="${esc(me.phone || '')}"></div>
      <div><label class="lbl">Λογότυπο (URL http/https, προαιρετικό)</label><input name="logoUrl" value="${esc(me.logoUrl || '')}" placeholder="https://"></div>` : ''}
    </div>
    ${diet ? '<label class="lbl">Υποσέλιδο εκτύπωσης</label><textarea name="printFooter" rows="2">' + esc(me.printFooter || '') + '</textarea>' : ''}
    <label class="lbl">Νέος κωδικός (προαιρετικά)</label><input name="newPassword" type="password" autocomplete="new-password">
    <label class="lbl">Τρέχων κωδικός</label><input name="currentPassword" type="password" required autocomplete="current-password">
    <p class="err" id="accErr"></p>
    <button class="primary" type="submit">Αποθήκευση</button>
  </form>
  ${diet ? `<div class="card"><h2>Αντίγραφο δεδομένων</h2><p class="muted">Στο δωρεάν Render ο δίσκος μπορεί να σβηστεί σε redeploy. Κατεβάστε αντίγραφο και κρατήστε το εκτός διακομιστή.</p>
    <p><button type="button" class="primary" data-act="backup-dl">Λήψη JSON</button></p>
    <form data-submit="backup-in"><label class="lbl">Εισαγωγή (αντικαθιστά τα δικά σας δεδομένα)</label><input id="bakFile" type="file" accept="application/json">
      <label class="lbl">Τρέχων κωδικός</label><input name="currentPassword" type="password" required>
      <p class="err" id="bakErr"></p><button type="submit">Εισαγωγή</button></form>
    <p class="muted">Οι λογαριασμοί πελατών που δεν αντιστοιχούν πια σε πελάτη αφαιρούνται. Οι υπόλοιποι πελάτες κρατούν την πρόσβασή τους.</p></div>` : ''}`;
}
