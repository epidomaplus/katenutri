import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { FOODS, byId as foodById } from './foods.js';
import { db, save, uid, owned, findOwned, DATA_DIR, STORAGE, initStore, persistMiddleware, storageInfo, pingDb, closeStore } from './lib/store.js';
import { hashPw, checkPw, setSession, clearSession, currentUser, publicUser, auth, authDiet, authClient, tooMany, markFail } from './lib/auth.js';
import { clientInput, visitInput, planData, foodInput, str, text, optNum, flag, reqEmail, httpUrl } from './lib/validate.js';
import { applyDerived } from './shared/measures.js';
import { exchangeGramsFor, groupLabel, GROUP_IDS, presentRecipe as recipeMath } from './shared/nutrition.js';
import { norm } from './shared/text.js';
import { BUILTIN_TEMPLATES } from './lib/templates.js';
import { seedDemo } from './lib/demo.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const PORT = process.env.PORT || 3000;
const ALLOW_SIGNUP = (process.env.ALLOW_SIGNUP || 'true') !== 'false';
const APP_NAME = process.env.APP_NAME || 'KateNutri';

const dietitians = () => db.users.filter(u => u.role !== 'client');
const nowIso = () => new Date().toISOString();

function fail(res, code, error) { return res.status(code).json({ error }); }

function presentClient(c, detail = false) {
  if (!c) return null;
  const { portal, ...rest } = c;
  const out = { ...rest, portalActive: !!(portal && portal.code) };
  if (detail && portal) out.portal = { code: portal.code, token: portal.token, createdAt: portal.createdAt };
  out.portalUser = db.users.some(u => u.role === 'client' && u.clientId === c.id);
  return out;
}
function clientSummary(c) {
  const visits = owned(db.visits, c.ownerId).filter(v => v.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const plans = owned(db.plans, c.ownerId).filter(p => p.clientId === c.id);
  const next = owned(db.appointments, c.ownerId)
    .filter(a => a.clientId === c.id && a.status === 'scheduled')
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const base = presentClient(c, false);
  return {
    ...base,
    lastWeight: visits[0]?.anthro?.weightKg ?? null,
    lastVisit: visits[0]?.date ?? null,
    planCount: plans.length,
    nextAppointment: next?.start || null,
  };
}
function planMeta(p) {
  const { data, ...meta } = p;
  return { ...meta, targetKcal: data?.targetKcal || '', viewMode: data?.viewMode || 'both' };
}
function presentRecipe(r) {
  const m = recipeMath(r);
  return {
    ...r,
    totals: m.nut, exchangeTotals: m.ex, totalGrams: m.totalGrams,
    perServing: m.perServingNut, perServingEx: m.perServingEx, servingGrams: m.servingGrams,
  };
}
function monthStats(appts, month) {
  const list = appts.filter(a => String(a.start || '').startsWith(month));
  const count = st => list.filter(a => a.status === st).length;
  const sum = st => list.filter(a => a.status === st).reduce((s, a) => s + (Number(a.cost) || 0), 0);
  return { month, scheduled: count('scheduled'), done: count('done'), cancelled: count('cancelled'), revenueDone: Math.round(sum('done') * 100) / 100, revenueScheduled: Math.round(sum('scheduled') * 100) / 100 };
}
function canReadPlan(user, plan) {
  if (!plan) return false;
  if (user.role !== 'client' && plan.ownerId === user.id) return true;
  return user.role === 'client' && plan.clientId === user.clientId && plan.ownerId === user.dietitianId && !!plan.visibleToClient;
}
function brandingFor(user) {
  if (user.role === 'client') {
    const d = db.users.find(u => u.id === user.dietitianId);
    return { dietitianName: d?.name || '', practiceName: d?.practiceName || '', phone: d?.phone || '', logoUrl: d?.logoUrl || '', printFooter: d?.printFooter || '' };
  }
  return { dietitianName: user.name || '', practiceName: user.practiceName || '', phone: user.phone || '', logoUrl: user.logoUrl || '', printFooter: user.printFooter || '' };
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(persistMiddleware);
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/healthz', async (req, res) => {
  const info = storageInfo();
  let ok = true;
  if (STORAGE === 'json-file') {
    try { fs.accessSync(DATA_DIR, fs.constants.W_OK); } catch { ok = false; }
    info.writable = ok;
  } else {
    ok = info.ready; // a transient save error is retried automatically; see lastError
    if (req.query.deep) {
      try { await pingDb(); info.db = 'ok'; } catch (err) { ok = false; info.db = 'error: ' + err.message; }
    }
  }
  res.status(ok ? 200 : 503).json({
    ok, app: APP_NAME, version: pkg.version, foods: FOODS.length,
    ...info, time: nowIso(),
  });
});
app.get('/api/config', (req, res) => {
  res.json({ appName: APP_NAME, allowSignup: ALLOW_SIGNUP || dietitians().length === 0, version: pkg.version });
});

app.post('/api/signup', (req, res) => {
  if (!ALLOW_SIGNUP && dietitians().length > 0) return fail(res, 403, 'Η εγγραφή νέων λογαριασμών είναι απενεργοποιημένη.');
  const email = reqEmail(req.body.email);
  const password = String(req.body.password || '');
  const name = str(req.body.name, 80);
  if (!email) return fail(res, 400, 'Μη έγκυρο email.');
  if (password.length < 8) return fail(res, 400, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
  if (db.users.some(u => u.email === email)) return fail(res, 409, 'Υπάρχει ήδη λογαριασμός με αυτό το email.');
  const user = {
    id: uid(), email, name: name || email.split('@')[0], role: 'dietitian', passwordHash: hashPw(password),
    practiceName: str(req.body.practiceName, 80), phone: '', logoUrl: '', printFooter: '', createdAt: nowIso(),
  };
  db.users.push(user); save(); setSession(res, user.id);
  res.json(publicUser(user));
});
app.post('/api/login', (req, res) => {
  const ip = req.ip || 'local';
  if (tooMany(ip)) return fail(res, 429, 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε λίγο.');
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.users.find(u => u.email === email);
  if (!user || !checkPw(req.body.password, user.passwordHash)) {
    markFail(ip);
    return fail(res, 401, 'Λάθος email ή κωδικός.');
  }
  setSession(res, user.id);
  res.json(publicUser(user));
});
app.post('/api/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json(publicUser(currentUser(req))));
app.get('/api/branding', auth, (req, res) => res.json(brandingFor(req.user)));

app.post('/api/account', auth, (req, res) => {
  const u = req.user;
  if (!checkPw(req.body.currentPassword, u.passwordHash)) return fail(res, 401, 'Λάθος τρέχων κωδικός.');
  if (req.body.email) {
    const e = reqEmail(req.body.email);
    if (!e) return fail(res, 400, 'Μη έγκυρο email.');
    if (db.users.some(x => x.email === e && x.id !== u.id)) return fail(res, 409, 'Το email χρησιμοποιείται ήδη.');
    u.email = e;
  }
  if (req.body.newPassword) {
    if (String(req.body.newPassword).length < 8) return fail(res, 400, 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
    u.passwordHash = hashPw(req.body.newPassword);
  }
  if (typeof req.body.name === 'string') u.name = str(req.body.name, 80);
  if (u.role !== 'client') {
    if (typeof req.body.practiceName === 'string') u.practiceName = str(req.body.practiceName, 80);
    if (typeof req.body.phone === 'string') u.phone = str(req.body.phone, 40);
    if (typeof req.body.printFooter === 'string') u.printFooter = text(req.body.printFooter, 400);
    if (req.body.logoUrl !== undefined) {
      const url = httpUrl(req.body.logoUrl);
      if (url === null) return fail(res, 400, 'Το λογότυπο πρέπει να είναι σύνδεσμος http ή https.');
      u.logoUrl = url;
    }
  }
  save();
  res.json(publicUser(u));
});

app.post('/api/join', (req, res) => {
  const code = str(req.body.code, 16).toUpperCase();
  const token = str(req.body.token, 80);
  const client = db.clients.find(c => (token && c.portal?.token === token) || (code && c.portal?.code === code));
  if (!client || !client.portal) return fail(res, 404, 'Ο κωδικός πρόσκλησης δεν είναι έγκυρος.');
  if (db.users.some(u => u.role === 'client' && u.clientId === client.id)) return fail(res, 409, 'Υπάρχει ήδη πρόσβαση για αυτόν τον πελάτη. Συνδεθείτε.');
  const email = reqEmail(req.body.email || client.email);
  const password = String(req.body.password || '');
  const name = str(req.body.name, 80) || client.name;
  if (!email) return fail(res, 400, 'Χρειάζεται έγκυρο email.');
  if (client.email && email !== client.email) return fail(res, 400, 'Χρησιμοποιήστε το email που έχει καταχωρίσει ο διαιτολόγος.');
  if (password.length < 8) return fail(res, 400, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
  if (db.users.some(u => u.email === email)) return fail(res, 409, 'Υπάρχει ήδη λογαριασμός με αυτό το email.');
  if (!client.email) client.email = email;
  const user = { id: uid(), email, name, role: 'client', passwordHash: hashPw(password), clientId: client.id, dietitianId: client.ownerId, createdAt: nowIso() };
  db.users.push(user); save(); setSession(res, user.id);
  res.json(publicUser(user));
});

app.get('/api/foods', authDiet, (req, res) => {
  let list = FOODS.concat(db.customFoods.filter(f => f.ownerId === req.user.id));
  const q = norm(req.query.q || '').trim();
  if (q) list = list.filter(f => q.split(/\s+/).every(t => norm(`${f.name} ${f.category} ${groupLabel(f.group)}`).includes(t)));
  if (GROUP_IDS.includes(req.query.group)) list = list.filter(f => f.group === req.query.group);
  if (req.query.vegan === '1') list = list.filter(f => f.vegan);
  if (req.query.fasting === '1') list = list.filter(f => f.fasting);
  if (req.query.keto === '1') list = list.filter(f => f.keto);
  res.json(list);
});
app.post('/api/foods', authDiet, (req, res) => {
  const parsed = foodInput(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  const f = {
    ...parsed.value, id: 'c_' + uid(), ownerId: req.user.id, custom: true,
    exchangeGrams: exchangeGramsFor(parsed.value.group, parsed.value),
    secondaryGroup: '', secondaryPerExchange: 0, exchangeNote: '',
  };
  db.customFoods.push(f); save(); res.json(f);
});
app.delete('/api/foods/:id', authDiet, (req, res) => {
  const i = db.customFoods.findIndex(f => f.id === req.params.id && f.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Δεν βρέθηκε δικό σας τρόφιμο.');
  db.customFoods.splice(i, 1); save(); res.json({ ok: true });
});

app.get('/api/clients', authDiet, (req, res) => {
  let list = owned(db.clients, req.user.id).map(clientSummary);
  const q = norm(req.query.q || '');
  if (q) list = list.filter(c => norm(`${c.name} ${c.email} ${c.phone} ${(c.tags || []).join(' ')}`).includes(q));
  const tag = norm(req.query.tag || '');
  if (tag) list = list.filter(c => (c.tags || []).some(t => norm(t) === tag));
  list.sort((a, b) => a.name.localeCompare(b.name, 'el'));
  res.json(list);
});
app.post('/api/clients', authDiet, (req, res) => {
  const parsed = clientInput(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  const c = { id: uid(), ownerId: req.user.id, ...parsed.value, portal: null, energy: null, createdAt: nowIso(), updatedAt: nowIso() };
  db.clients.push(c); save(); res.json(presentClient(c, true));
});
app.get('/api/clients/:id', authDiet, (req, res) => {
  const c = findOwned(db.clients, req.user.id, req.params.id);
  if (!c) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  res.json(presentClient(c, true));
});
app.put('/api/clients/:id', authDiet, (req, res) => {
  const c = findOwned(db.clients, req.user.id, req.params.id);
  if (!c) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const parsed = clientInput(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  Object.assign(c, parsed.value, { updatedAt: nowIso() });
  save(); res.json(presentClient(c, true));
});
app.delete('/api/clients/:id', authDiet, (req, res) => {
  const i = db.clients.findIndex(c => c.id === req.params.id && c.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const id = db.clients[i].id;
  db.clients.splice(i, 1);
  db.visits = db.visits.filter(v => v.clientId !== id);
  db.appointments = db.appointments.filter(a => a.clientId !== id);
  db.diary = db.diary.filter(d => d.clientId !== id);
  db.messages = db.messages.filter(m => m.clientId !== id);
  db.users = db.users.filter(u => !(u.role === 'client' && u.clientId === id));
  for (const p of db.plans) if (p.clientId === id) p.clientId = '';
  save(); res.json({ ok: true });
});
app.post('/api/clients/:id/invite', authDiet, (req, res) => {
  const c = findOwned(db.clients, req.user.id, req.params.id);
  if (!c) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = [...crypto.randomBytes(8)].map(b => alphabet[b % alphabet.length]).join('');
  c.portal = { code, token: uid() + uid(), createdAt: nowIso() };
  c.updatedAt = nowIso();
  save();
  res.json(presentClient(c, true).portal);
});
app.post('/api/clients/:id/energy', authDiet, (req, res) => {
  const c = findOwned(db.clients, req.user.id, req.params.id);
  if (!c) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const e = req.body || {};
  c.energy = {
    equation: e.equation === 'harris' ? 'harris' : 'mifflin',
    sexUsed: e.sexUsed === 'male' ? 'male' : 'female',
    activity: str(e.activity, 10),
    weightKg: optNum(e.weightKg), heightCm: optNum(e.heightCm), age: optNum(e.age),
    bmr: optNum(e.bmr), tdee: optNum(e.tdee), kcalTarget: optNum(e.kcalTarget),
    proteinPerKg: optNum(e.proteinPerKg), proteinG: optNum(e.proteinG), carbsG: optNum(e.carbsG), fatG: optNum(e.fatG),
    updatedAt: nowIso(),
  };
  c.updatedAt = nowIso(); save();
  res.json(c.energy);
});

app.get('/api/clients/:id/visits', authDiet, (req, res) => {
  if (!findOwned(db.clients, req.user.id, req.params.id)) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const list = owned(db.visits, req.user.id).filter(v => v.clientId === req.params.id).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  res.json(list);
});
app.post('/api/clients/:id/visits', authDiet, (req, res) => {
  if (!findOwned(db.clients, req.user.id, req.params.id)) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const parsed = visitInput(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  const visit = applyDerived({ id: uid(), ownerId: req.user.id, clientId: req.params.id, ...parsed.value, createdAt: nowIso(), updatedAt: nowIso() });
  db.visits.push(visit); save(); res.json(visit);
});
app.put('/api/visits/:id', authDiet, (req, res) => {
  const v = findOwned(db.visits, req.user.id, req.params.id);
  if (!v) return fail(res, 404, 'Η επίσκεψη δεν βρέθηκε.');
  const parsed = visitInput(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  Object.assign(v, applyDerived({ ...v, ...parsed.value, updatedAt: nowIso() }));
  save(); res.json(v);
});
app.delete('/api/visits/:id', authDiet, (req, res) => {
  const i = db.visits.findIndex(v => v.id === req.params.id && v.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Η επίσκεψη δεν βρέθηκε.');
  db.visits.splice(i, 1); save(); res.json({ ok: true });
});

app.get('/api/plans', authDiet, (req, res) => {
  let list = owned(db.plans, req.user.id);
  if (req.query.clientId) list = list.filter(p => p.clientId === req.query.clientId);
  res.json(list.map(planMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});
app.post('/api/plans', authDiet, (req, res) => {
  const clientId = str(req.body.clientId, 40);
  const client = clientId ? findOwned(db.clients, req.user.id, clientId) : null;
  if (clientId && !client) return fail(res, 400, 'Ο πελάτης δεν βρέθηκε.');
  const plan = {
    id: uid(), ownerId: req.user.id, clientId: client?.id || '',
    clientName: str(req.body.clientName, 120) || client?.name || '',
    title: str(req.body.title, 140) || 'Νέο διαιτολόγιο',
    visibleToClient: flag(req.body.visibleToClient),
    data: planData(req.body.data),
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  db.plans.push(plan); save(); res.json(plan);
});
app.get('/api/plans/:id', auth, (req, res) => {
  const plan = db.plans.find(p => p.id === req.params.id);
  if (!canReadPlan(req.user, plan)) return fail(res, 404, 'Το διαιτολόγιο δεν βρέθηκε.');
  res.json(plan);
});
app.put('/api/plans/:id', authDiet, (req, res) => {
  const p = findOwned(db.plans, req.user.id, req.params.id);
  if (!p) return fail(res, 404, 'Το διαιτολόγιο δεν βρέθηκε.');
  if (req.body.title !== undefined) p.title = str(req.body.title, 140) || p.title;
  if (req.body.clientName !== undefined) p.clientName = str(req.body.clientName, 120);
  if (req.body.clientId !== undefined) {
    const clientId = str(req.body.clientId, 40);
    if (clientId && !findOwned(db.clients, req.user.id, clientId)) return fail(res, 400, 'Ο πελάτης δεν βρέθηκε.');
    p.clientId = clientId;
  }
  if (req.body.visibleToClient !== undefined) p.visibleToClient = flag(req.body.visibleToClient);
  if (req.body.data !== undefined) p.data = planData(req.body.data);
  p.updatedAt = nowIso(); save(); res.json(p);
});
app.delete('/api/plans/:id', authDiet, (req, res) => {
  const i = db.plans.findIndex(p => p.id === req.params.id && p.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Το διαιτολόγιο δεν βρέθηκε.');
  db.plans.splice(i, 1); save(); res.json({ ok: true });
});

app.get('/api/templates', authDiet, (req, res) => {
  const mine = owned(db.templates, req.user.id).map(t => ({ ...t, builtin: false }));
  const kind = req.query.kind;
  const all = BUILTIN_TEMPLATES.concat(mine).filter(t => !kind || t.kind === kind);
  res.json(all);
});
app.post('/api/templates', authDiet, (req, res) => {
  const kind = req.body.kind === 'meal' ? 'meal' : 'plan';
  const name = str(req.body.name, 120);
  if (!name) return fail(res, 400, 'Χρειάζεται όνομα προτύπου.');
  let data;
  if (kind === 'meal') {
    const items = Array.isArray(req.body.data?.items) ? req.body.data.items.slice(0, 40) : [];
    data = { items };
  } else data = planData(req.body.data);
  const t = { id: uid(), ownerId: req.user.id, kind, name, description: str(req.body.description, 240), data, createdAt: nowIso() };
  db.templates.push(t); save(); res.json({ ...t, builtin: false });
});
app.delete('/api/templates/:id', authDiet, (req, res) => {
  const i = db.templates.findIndex(t => t.id === req.params.id && t.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Το πρότυπο δεν βρέθηκε.');
  db.templates.splice(i, 1); save(); res.json({ ok: true });
});

function recipeInput(b, userId) {
  const name = str(b.name, 140);
  if (!name) return { error: 'Χρειάζεται όνομα συνταγής.' };
  let servings = Math.round(Number(b.servings) || 1);
  if (servings < 1 || servings > 50) servings = 1;
  const ingredients = (Array.isArray(b.ingredients) ? b.ingredients : []).slice(0, 40).map(i => {
    const food = foodById.get(i.foodId) || db.customFoods.find(f => f.id === i.foodId && f.ownerId === userId);
    const grams = Math.max(0, Number(i.grams) || 0);
    if (food) {
      const item = {
        foodId: food.id, name: food.name, category: food.category, grams, note: '',
        kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
        fiber: food.fiber || 0, sodium: food.sodium || 0, calcium: food.calcium || 0,
        iron: food.iron || 0, vitC: food.vitC || 0, vitD: food.vitD || 0,
        group: food.group, exchangeGrams: food.exchangeGrams || 0,
        secondaryGroup: food.secondaryGroup || '', secondaryPerExchange: food.secondaryPerExchange || 0,
      };
      return item;
    }
    return null;
  }).filter(Boolean);
  return { value: { name, servings, notes: text(b.notes, 2000), instructions: text(b.instructions, 4000), ingredients } };
}
app.get('/api/recipes', authDiet, (req, res) => {
  res.json(owned(db.recipes, req.user.id).map(presentRecipe).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});
app.post('/api/recipes', authDiet, (req, res) => {
  const parsed = recipeInput(req.body, req.user.id);
  if (parsed.error) return fail(res, 400, parsed.error);
  const r = { id: uid(), ownerId: req.user.id, ...parsed.value, createdAt: nowIso(), updatedAt: nowIso() };
  db.recipes.push(r); save(); res.json(presentRecipe(r));
});
app.get('/api/recipes/:id', authDiet, (req, res) => {
  const r = findOwned(db.recipes, req.user.id, req.params.id);
  if (!r) return fail(res, 404, 'Η συνταγή δεν βρέθηκε.');
  res.json(presentRecipe(r));
});
app.put('/api/recipes/:id', authDiet, (req, res) => {
  const r = findOwned(db.recipes, req.user.id, req.params.id);
  if (!r) return fail(res, 404, 'Η συνταγή δεν βρέθηκε.');
  const parsed = recipeInput(req.body, req.user.id);
  if (parsed.error) return fail(res, 400, parsed.error);
  Object.assign(r, parsed.value, { updatedAt: nowIso() });
  save(); res.json(presentRecipe(r));
});
app.delete('/api/recipes/:id', authDiet, (req, res) => {
  const i = db.recipes.findIndex(r => r.id === req.params.id && r.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Η συνταγή δεν βρέθηκε.');
  db.recipes.splice(i, 1); save(); res.json({ ok: true });
});

function apptInput(b, userId) {
  const client = findOwned(db.clients, userId, str(b.clientId, 40));
  if (!client) return { error: 'Διαλέξτε πελάτη.' };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.start || '')) return { error: 'Μη έγκυρη ημερομηνία.' };
  const status = ['scheduled', 'done', 'cancelled'].includes(b.status) ? b.status : 'scheduled';
  let cost = optNum(b.cost);
  if (cost === null || cost < 0) cost = client.sessionPrice || 0;
  let durationMin = Math.round(Number(b.durationMin) || 45);
  if (durationMin < 10 || durationMin > 240) durationMin = 45;
  return { value: { clientId: client.id, clientName: client.name, start: b.start, durationMin, cost, status, notes: text(b.notes, 1000) } };
}
app.get('/api/appointments', authDiet, (req, res) => {
  let list = owned(db.appointments, req.user.id);
  if (req.query.clientId) list = list.filter(a => a.clientId === req.query.clientId);
  if (req.query.from) list = list.filter(a => a.start >= req.query.from);
  if (req.query.to) list = list.filter(a => a.start.slice(0, 10) <= req.query.to);
  list.sort((a, b) => a.start.localeCompare(b.start));
  res.json(list);
});
app.get('/api/appointments/stats', authDiet, (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : nowIso().slice(0, 7);
  res.json(monthStats(owned(db.appointments, req.user.id), month));
});
app.post('/api/appointments', authDiet, (req, res) => {
  const parsed = apptInput(req.body, req.user.id);
  if (parsed.error) return fail(res, 400, parsed.error);
  const a = { id: uid(), ownerId: req.user.id, ...parsed.value, createdAt: nowIso() };
  db.appointments.push(a); save(); res.json(a);
});
app.put('/api/appointments/:id', authDiet, (req, res) => {
  const a = findOwned(db.appointments, req.user.id, req.params.id);
  if (!a) return fail(res, 404, 'Το ραντεβού δεν βρέθηκε.');
  const parsed = apptInput({ ...a, ...req.body }, req.user.id);
  if (parsed.error) return fail(res, 400, parsed.error);
  Object.assign(a, parsed.value); save(); res.json(a);
});
app.delete('/api/appointments/:id', authDiet, (req, res) => {
  const i = db.appointments.findIndex(a => a.id === req.params.id && a.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Το ραντεβού δεν βρέθηκε.');
  db.appointments.splice(i, 1); save(); res.json({ ok: true });
});

app.get('/api/todos', authDiet, (req, res) => {
  const list = owned(db.todos, req.user.id).slice().sort((a, b) => Number(a.done) - Number(b.done) || String(a.due || '9999').localeCompare(String(b.due || '9999')));
  res.json(list);
});
app.post('/api/todos', authDiet, (req, res) => {
  const title = str(req.body.title, 160);
  if (!title) return fail(res, 400, 'Γράψτε την εργασία.');
  const due = /^\d{4}-\d{2}-\d{2}$/.test(req.body.due || '') ? req.body.due : '';
  const t = { id: uid(), ownerId: req.user.id, title, due, done: false, notes: text(req.body.notes, 1000), createdAt: nowIso() };
  db.todos.push(t); save(); res.json(t);
});
app.put('/api/todos/:id', authDiet, (req, res) => {
  const t = findOwned(db.todos, req.user.id, req.params.id);
  if (!t) return fail(res, 404, 'Η εργασία δεν βρέθηκε.');
  if (req.body.title !== undefined) t.title = str(req.body.title, 160) || t.title;
  if (req.body.due !== undefined) t.due = /^\d{4}-\d{2}-\d{2}$/.test(req.body.due || '') ? req.body.due : '';
  if (req.body.done !== undefined) t.done = flag(req.body.done);
  if (req.body.notes !== undefined) t.notes = text(req.body.notes, 1000);
  save(); res.json(t);
});
app.delete('/api/todos/:id', authDiet, (req, res) => {
  const i = db.todos.findIndex(t => t.id === req.params.id && t.ownerId === req.user.id);
  if (i < 0) return fail(res, 404, 'Η εργασία δεν βρέθηκε.');
  db.todos.splice(i, 1); save(); res.json({ ok: true });
});

app.get('/api/dashboard', authDiet, (req, res) => {
  const now = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(req.query.now || '') ? req.query.now : nowIso().slice(0, 16);
  const today = now.slice(0, 10);
  const month = today.slice(0, 7);
  const appts = owned(db.appointments, req.user.id);
  res.json({
    clientCount: owned(db.clients, req.user.id).length,
    planCount: owned(db.plans, req.user.id).length,
    recipeCount: owned(db.recipes, req.user.id).length,
    todayAppointments: appts.filter(a => a.start.startsWith(today)).sort((a, b) => a.start.localeCompare(b.start)),
    upcoming: appts.filter(a => a.status === 'scheduled' && a.start >= now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6),
    todos: owned(db.todos, req.user.id).filter(t => !t.done).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'))).slice(0, 6),
    monthStats: monthStats(appts, month),
  });
});

app.get('/api/clients/:id/diary', authDiet, (req, res) => {
  if (!findOwned(db.clients, req.user.id, req.params.id)) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const list = owned(db.diary, req.user.id).filter(d => d.clientId === req.params.id).sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});
app.get('/api/clients/:id/messages', authDiet, (req, res) => {
  if (!findOwned(db.clients, req.user.id, req.params.id)) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const list = db.messages.filter(m => m.ownerId === req.user.id && m.clientId === req.params.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(list);
});
app.post('/api/clients/:id/messages', authDiet, (req, res) => {
  const c = findOwned(db.clients, req.user.id, req.params.id);
  if (!c) return fail(res, 404, 'Ο πελάτης δεν βρέθηκε.');
  const textBody = text(req.body.text, 2000);
  if (!textBody) return fail(res, 400, 'Γράψτε ένα μήνυμα.');
  const m = { id: uid(), ownerId: req.user.id, clientId: c.id, authorRole: 'dietitian', authorName: req.user.name || 'Διαιτολόγος', text: textBody, createdAt: nowIso() };
  db.messages.push(m); save(); res.json(m);
});

app.get('/api/portal/plans', authClient, (req, res) => {
  const list = db.plans.filter(p => p.ownerId === req.user.dietitianId && p.clientId === req.user.clientId && p.visibleToClient);
  res.json(list.map(planMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});
app.get('/api/portal/plans/:id', authClient, (req, res) => {
  const plan = db.plans.find(p => p.id === req.params.id);
  if (!canReadPlan(req.user, plan)) return fail(res, 404, 'Το διαιτολόγιο δεν είναι διαθέσιμο.');
  res.json(plan);
});
app.get('/api/portal/diary', authClient, (req, res) => {
  const list = db.diary.filter(d => d.clientId === req.user.clientId).sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});
app.post('/api/portal/diary', authClient, (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : '';
  if (!date) return fail(res, 400, 'Χρειάζεται ημερομηνία.');
  let glasses = Math.round(Number(req.body.waterGlasses) || 0);
  if (glasses < 0) glasses = 0;
  if (glasses > 30) glasses = 30;
  let row = db.diary.find(d => d.clientId === req.user.clientId && d.date === date);
  if (!row) {
    row = { id: uid(), ownerId: req.user.dietitianId, clientId: req.user.clientId, date, mealsText: '', waterGlasses: 0, updatedAt: nowIso() };
    db.diary.push(row);
  }
  row.mealsText = text(req.body.mealsText, 4000);
  row.waterGlasses = glasses;
  row.updatedAt = nowIso();
  save(); res.json(row);
});
app.get('/api/portal/messages', authClient, (req, res) => {
  const list = db.messages.filter(m => m.clientId === req.user.clientId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(list);
});
app.post('/api/portal/messages', authClient, (req, res) => {
  const textBody = text(req.body.text, 2000);
  if (!textBody) return fail(res, 400, 'Γράψτε ένα μήνυμα.');
  const m = { id: uid(), ownerId: req.user.dietitianId, clientId: req.user.clientId, authorRole: 'client', authorName: req.user.name || 'Πελάτης', text: textBody, createdAt: nowIso() };
  db.messages.push(m); save(); res.json(m);
});

app.get('/api/backup', authDiet, (req, res) => {
  const id = req.user.id;
  const payload = {
    app: 'katenutri', version: 1, exportedAt: nowIso(),
    profile: publicUser(req.user),
    clients: owned(db.clients, id),
    visits: owned(db.visits, id),
    plans: owned(db.plans, id),
    recipes: owned(db.recipes, id),
    appointments: owned(db.appointments, id),
    todos: owned(db.todos, id),
    templates: owned(db.templates, id),
    customFoods: owned(db.customFoods, id),
    diary: owned(db.diary, id),
    messages: db.messages.filter(m => m.ownerId === id),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="katenutri-backup.json"');
  res.json(payload);
});
app.post('/api/backup', authDiet, (req, res) => {
  if (!checkPw(req.body.currentPassword, req.user.passwordHash)) return fail(res, 401, 'Λάθος τρέχων κωδικός.');
  const b = req.body.data || req.body;
  const arrays = ['clients', 'visits', 'plans', 'recipes', 'appointments', 'todos', 'templates', 'customFoods', 'diary', 'messages'];
  for (const k of arrays) if (b[k] && !Array.isArray(b[k])) return fail(res, 400, 'Μη έγκυρο αρχείο.');
  for (const k of arrays) if ((b[k] || []).length > 8000) return fail(res, 400, 'Το αρχείο είναι μεγαλύτερο από το όριο εισαγωγής.');
  const id = req.user.id;
  if (b.profile && typeof b.profile === 'object') {
    if (typeof b.profile.name === 'string') req.user.name = str(b.profile.name, 80);
    if (typeof b.profile.practiceName === 'string') req.user.practiceName = str(b.profile.practiceName, 80);
    if (typeof b.profile.phone === 'string') req.user.phone = str(b.profile.phone, 40);
    if (typeof b.profile.printFooter === 'string') req.user.printFooter = text(b.profile.printFooter, 400);
    if (b.profile.logoUrl !== undefined) {
      const url = httpUrl(b.profile.logoUrl);
      if (url !== null) req.user.logoUrl = url;
    }
  }
  const keep = (list) => list.filter(x => x.ownerId !== id);
  const stamp = (list) => (list || []).map(row => ({ ...row, ownerId: id, id: str(row.id, 40) || uid() }));
  db.clients = keep(db.clients).concat(stamp(b.clients));
  db.visits = keep(db.visits).concat(stamp(b.visits));
  db.plans = keep(db.plans).concat(stamp(b.plans));
  db.recipes = keep(db.recipes).concat(stamp(b.recipes));
  db.appointments = keep(db.appointments).concat(stamp(b.appointments));
  db.todos = keep(db.todos).concat(stamp(b.todos));
  db.templates = keep(db.templates).concat(stamp(b.templates));
  db.customFoods = keep(db.customFoods).concat(stamp(b.customFoods));
  db.diary = keep(db.diary).concat(stamp(b.diary));
  db.messages = db.messages.filter(m => m.ownerId !== id).concat(stamp(b.messages));
  const ids = new Set(owned(db.clients, id).map(c => c.id));
  db.users = db.users.filter(u => !(u.role === 'client' && u.dietitianId === id && !ids.has(u.clientId)));
  save();
  res.json({ ok: true, clients: ids.size });
});

app.use('/shared', express.static(path.join(root, 'shared')));
app.use(express.static(path.join(root, 'public')));
app.use((req, res) => {
  if (req.path.startsWith('/api')) return fail(res, 404, 'Δεν βρέθηκε.');
  if (req.method !== 'GET') return fail(res, 404, 'Δεν βρέθηκε.');
  res.sendFile(path.join(root, 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return fail(res, 400, 'Μη έγκυρο JSON.');
  console.error(err);
  res.status(500).json({ error: 'Εσωτερικό σφάλμα.' });
});

try {
  await initStore();
} catch (err) {
  console.error('[db] could not load data, refusing to start:', err.message);
  process.exit(1);
}

if (process.env.SEED_DEMO === 'true') {
  const demo = seedDemo();
  if (demo) {
    await save();
    console.log(`Demo dietitian ${demo.email} / ${demo.password} · client portal ${demo.clientEmail}`);
  }
}

const server = app.listen(PORT, () => console.log(`${APP_NAME} ${pkg.version} on http://localhost:${PORT} · storage=${STORAGE}`));

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    console.log(`${sig}: saving and shutting down`);
    server.close();
    closeStore().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 20000).unref();
  });
}
