import { state, api } from './api.js';
import { bus, esc, icon, errorBox, setHandlers, takeHandlers } from './util.js';
import { authPage, joinPage, accountPage } from './auth.js';
import { dashboardPage, todosPage, libraryPage } from './home.js';
import { clientsPage, clientFile } from './clients.js';
import { plansPage, planEditor } from './plan.js';
import { foodsPage, recipesPage, recipeEditor } from './catalog.js';
import { calendarPage } from './calendar.js';
import { portalPage } from './portal.js';
import { toolsPage } from './tools.js';

const NAV = [
  ['/', 'Αρχική', 'home'],
  ['/clients', 'Πελάτες', 'users'],
  ['/plans', 'Διαιτολόγια', 'plan'],
  ['/foods', 'Τρόφιμα', 'food'],
  ['/recipes', 'Συνταγές', 'recipe'],
  ['/calendar', 'Ραντεβού', 'cal'],
  ['/todos', 'Εργασίες', 'todo'],
  ['/tools', 'Εργαλεία', 'tools'],
  ['/library', 'Βιβλιοθήκη', 'book'],
];

function pathNow() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  return path.startsWith('/') ? path : '/' + path;
}
function navKey(path) {
  if (path.startsWith('/client')) return '/clients';
  if (path.startsWith('/plan')) return '/plans';
  if (path.startsWith('/recipe')) return '/recipes';
  if (path.startsWith('/food')) return '/foods';
  if (path.startsWith('/portal')) return '/portal';
  return path === '/' ? '/' : '/' + path.split('/')[1];
}

function shell(path, content) {
  const key = navKey(path);
  const me = state.me;
  return `<div class="scrim" data-act="scrim"></div><div class="app"><aside class="side">
    <a class="brand" href="#/"><img src="/icon.svg" width="36" height="36" alt=""><div><b>${esc(state.cfg.appName || 'KateNutri')}</b><span>Διαιτολογικό γραφείο</span></div></a>
    <nav class="nav">${NAV.map(([href, label, ic]) => `<a href="#${href}" ${key === href ? 'class="on" aria-current="page"' : ''}>${icon(ic)}${label}</a>`).join('')}</nav>
    <div class="side-foot"><div class="who"><b>${esc(me?.name || 'Λογαριασμός')}</b><span class="muted">${esc(me?.email || '')}</span></div>
      <div class="foot-row"><a class="btn sm" href="#/account">Λογαριασμός</a><button type="button" class="sm" data-act="theme" title="Εναλλαγή θέματος">Θέμα</button></div>
      <button type="button" data-act="logout">Έξοδος</button></div>
  </aside><div class="maincol"><header class="top"><button type="button" class="hamb sm" data-act="nav-toggle" aria-label="Μενού">Μενού</button><strong>${esc(state.cfg.appName || 'KateNutri')}</strong></header>
    <div class="content" id="content">${content}</div></div></div>`;
}

function portalShell(content) {
  const tabs = [['/portal', 'Πλάνο'], ['/portal/diary', 'Ημερολόγιο'], ['/portal/messages', 'Μηνύματα']];
  const path = pathNow();
  return `<div class="content" style="max-width:900px;margin:0 auto"><header class="page-h"><div><a class="brand" href="#/portal" style="padding:0"><img src="/icon.svg" width="32" height="32" alt=""><div><b>${esc(state.cfg.appName)}</b><span>Πύλη πελάτη · ${esc(state.me?.dietitianName || '')}</span></div></a></div>
    <div class="actions"><button type="button" class="sm" data-act="theme">Θέμα</button><button type="button" data-act="logout">Έξοδος</button></div></header>
    <div class="tabs">${tabs.map(([href, label]) => `<a class="btn ${path === href ? 'on' : ''}" href="#${href}">${label}</a>`).join('')}</div>
    <div id="content">${content}</div></div>`;
}

let seq = 0;
async function route() {
  const my = ++seq;
  try { await bus.beforeLeave(); } catch { /* keep going */ }
  if (my !== seq) return;
  bus.beforeLeave = async () => {};
  setHandlers({});
  document.querySelector('.side')?.classList.remove('open');
  const path = pathNow();
  const app = document.getElementById('app');
  try {
    if (!state.me) {
      const html = path.startsWith('/join') ? joinPage(decodeURIComponent(path.split('/')[2] || '')) : authPage();
      if (my !== seq) return;
      bus.handlers = takeHandlers();
      app.innerHTML = html;
      return;
    }
    if (state.me.role === 'client') {
      const tab = path.startsWith('/portal/') ? path.split('/')[2] : 'plan';
      if (!path.startsWith('/portal') && !path.startsWith('/account')) { location.hash = '/portal'; return; }
      const inner = path.startsWith('/account') ? await accountPage() : await portalPage(tab || 'plan');
      if (my !== seq) return;
      bus.handlers = takeHandlers();
      app.innerHTML = path.startsWith('/account') ? `<div class="content" style="max-width:720px;margin:0 auto">${inner}<p><a href="#/portal">← Πύλη</a></p></div>` : portalShell(inner);
      return;
    }
    app.innerHTML = shell(path, '<p class="muted">Φόρτωση…</p>');
    const html = await renderDiet(path);
    if (my !== seq) return;
    bus.handlers = takeHandlers();
    app.innerHTML = shell(path, html);
  } catch (e) {
    if (my !== seq) return;
    const box = errorBox(e.message);
    bus.handlers = { retry: () => route() };
    app.innerHTML = state.me && state.me.role !== 'client' ? shell(path, box) : box;
  }
}

async function renderDiet(path) {
  const client = path.match(/^\/client\/([^/]+)(?:\/([^/]+))?$/);
  if (client) return clientFile(decodeURIComponent(client[1]), client[2] || 'profile');
  const plan = path.match(/^\/plan\/([^/]+)$/);
  if (plan) return planEditor(decodeURIComponent(plan[1]));
  const recipe = path.match(/^\/recipe\/([^/]+)$/);
  if (recipe) return recipeEditor(decodeURIComponent(recipe[1]));
  if (path === '/clients') return clientsPage();
  if (path === '/plans') return plansPage();
  if (path === '/foods') return foodsPage();
  if (path === '/recipes') return recipesPage();
  if (path === '/calendar') return calendarPage();
  if (path === '/todos') return todosPage();
  if (path === '/tools') return toolsPage();
  if (path === '/library') return libraryPage();
  if (path === '/account') return accountPage();
  if (path === '/' ) return dashboardPage();
  return `<div class="card empty"><h2>Δεν βρέθηκε η σελίδα</h2><a class="btn" href="#/">Αρχική</a></div>`;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.theme = next;
}

async function boot() {
  const app = document.getElementById('app');
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !app.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'theme') return toggleTheme();
    if (act === 'nav-toggle') return document.querySelector('.side')?.classList.toggle('open');
    if (act === 'scrim') return document.querySelector('.side')?.classList.remove('open');
    if (act === 'logout') return logout();
    if (act === 'retry') return route();
    bus.handlers[act]?.(el, e);
  });
  app.addEventListener('input', e => {
    const el = e.target.closest('[data-input]');
    if (!el || !app.contains(el)) return;
    bus.handlers[el.dataset.input]?.(el, e);
  });
  app.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (!el || !app.contains(el)) return;
    bus.handlers[el.dataset.change]?.(el, e);
  });
  app.addEventListener('submit', e => {
    const form = e.target.closest('form[data-submit]');
    if (!form || !app.contains(form)) return;
    e.preventDefault();
    bus.handlers[form.dataset.submit]?.(Object.fromEntries(new FormData(form).entries()), form, e);
  });
  state.cfg = await api('/api/config').catch(() => state.cfg);
  state.me = await api('/api/me');
  document.title = (state.cfg.appName || 'KateNutri');
  bus.refresh = route;
  addEventListener('hashchange', () => route());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  route();
}

async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  state.me = null;
  location.hash = '/';
  route();
}

boot();
