import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FOODS } from '../foods.js';
import { itemFromFood, itemEx, scalePlanData, shoppingList, normalizePlan } from '../shared/nutrition.js';
import { adultBmi, pediatricBmi, cockcroftGault, tygIndex, fiberTargets } from '../shared/tools.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-smoke-'));
const port = 43991;
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'),
  env: { ...process.env, PORT: String(port), DATA_DIR: dir, SESSION_SECRET: 'smoke', ALLOW_SIGNUP: 'true', SEED_DEMO: 'false', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', d => { log += d; });
child.stderr.on('data', d => { log += d; });

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function waitHealthy() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(base + '/healthz');
      if (r.ok) return r.json();
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server did not start\n' + log);
}

let cookie = '';
async function api(url, opts = {}) {
  const res = await fetch(base + url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) { const m = set.match(/sid=[^;]+/); if (m) cookie = m[0]; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(url + ' ' + res.status + ' ' + JSON.stringify(data));
  return data;
}

try {
  const bmi = adultBmi(70, 175);
  assert(bmi.category === 'Φυσιολογικό εύρος' && Math.abs(bmi.bmi - 22.9) < 0.1, 'adult bmi ' + bmi.bmi);
  assert(adultBmi(95, 170).category.startsWith('Παχυσαρκία'), 'adult obesity');
  const ped = pediatricBmi({ kg: 19.84, cm: 100, years: 10, months: 0, sex: 'male' });
  assert(ped.category.startsWith('Υπέρβαρο'), 'cole ow ' + ped.category + ' cuts ' + ped.cuts?.ow);
  assert(Math.abs(ped.cuts.ow - 19.84) < 0.02, 'cole point');
  const mid = pediatricBmi({ kg: 20.02, cm: 100, years: 10, months: 3, sex: 'male' });
  assert(Math.abs(mid.cuts.ow - 20.02) < 0.03, 'cole interp ' + mid.cuts.ow);
  assert(pediatricBmi({ kg: 12, cm: 80, years: 1, months: 0, sex: 'female' }).limited, 'under 2 limited');
  const cg = cockcroftGault({ age: 50, weightKg: 70, sex: 'male', creatinine: 1, unit: 'mg' });
  assert(Math.abs(cg.crcl - 87.5) < 0.05, 'cg ' + cg.crcl);
  const cgF = cockcroftGault({ age: 50, weightKg: 70, sex: 'female', creatinine: 88.4, unit: 'umol' });
  assert(Math.abs(cgF.crcl - 87.5 * 0.85) < 0.1, 'cg female ' + cgF.crcl);
  const tyg = tygIndex({ triglycerides: 150, glucose: 100 });
  assert(Math.abs(tyg.tyg - Math.log(7500)) < 0.01, 'tyg ' + tyg.tyg);
  const fib = fiberTargets({ age: 40, sex: 'male', kcal: 2000, intake: 20 });
  assert(fib.dri === 38 && fib.perKcal === 28, 'fiber ' + fib.dri + ' ' + fib.perKcal);
  const health = await waitHealthy();
  assert(health.foods >= 200, 'foods ' + health.foods);
  assert(health.storage === (process.env.DATABASE_URL ? 'postgres' : 'json-file'), 'storage');

  const bread = FOODS.find(f => f.name === 'Ψωμί λευκό');
  const breadEx = itemEx(itemFromFood(bread, 30));
  assert(Math.abs(breadEx.carb - 0.98) < 0.05, 'bread carb ' + breadEx.carb);
  assert(breadEx.groups.starch > 0.9 && breadEx.groups.starch < 1.1, 'bread starch');
  const oil = FOODS.find(f => f.name === 'Ελαιόλαδο');
  const oilEx = itemEx(itemFromFood(oil, 10));
  assert(Math.abs(oilEx.groups.fat - 2) < 0.05, 'oil fat exchanges');
  const milk = FOODS.find(f => f.name === 'Γάλα ημιαποβουτυρωμένο 1.5%');
  const milkEx = itemEx(itemFromFood(milk, 250));
  assert(milkEx.groups.milk > 0.9 && milkEx.groups.milk < 1.15, 'milk group');
  assert(milkEx.carb > 0.7 && milkEx.carb < 0.95, 'milk carb ex ' + milkEx.carb);
  const lentils = FOODS.find(f => f.name === 'Φακές (βρασμένες)');
  const lentEx = itemEx(itemFromFood(lentils, 200));
  assert(lentEx.groups.meat_lean > 1, 'lentil secondary meat');
  const hummus = FOODS.find(f => f.name === 'Χούμους');
  assert(!hummus.secondaryGroup, 'hummus should not add meat exchange');

  await api('/api/signup', { method: 'POST', body: { email: 'diet@example.com', password: 'secret-pass', name: 'Διαιτολόγος', practiceName: 'Γραφείο' } });
  const client = await api('/api/clients', { method: 'POST', body: { name: 'Μαρία Τεστ', email: 'maria.client@example.com', sex: 'female', dob: '1990-05-01', heightCm: 165, sessionPrice: 40, tags: ['απώλεια', 'απώλεια'], preferences: { fasting: true }, allergies: 'ξηροί καρποί' } });
  assert(client.tags.length === 1, 'tag dedupe');
  const visit = await api('/api/clients/' + client.id + '/visits', { method: 'POST', body: { date: '2026-10-01', notes: 'πρώτη', anthro: { weightKg: 72, heightCm: 165, bodyFatPct: 30, muscleKg: 26 }, circ: { waist: 80, hip: 100 }, skinfolds: { triceps: 16, biceps: 8 } } });
  assert(Math.abs(visit.anthro.bmi - 26.4) < 0.2, 'bmi ' + visit.anthro.bmi);
  await api('/api/clients/' + client.id + '/energy', { method: 'POST', body: { equation: 'mifflin', sexUsed: 'female', activity: '1.375', weightKg: 72, heightCm: 165, age: 36, bmr: 1400, tdee: 1900, kcalTarget: 1700, proteinG: 100, carbsG: 170, fatG: 55 } });

  const oat = FOODS.find(f => f.name === 'Βρώμη (νιφάδες)');
  const data = normalizePlan(null);
  data.targetKcal = '1700';
  data.exchangeTargets.carb = '11';
  data.days[0].meals[0].push(itemFromFood(oat, 40), itemFromFood(milk, 200));
  data.viewMode = 'both';
  const plan = await api('/api/plans', { method: 'POST', body: { title: 'Τεστ', clientId: client.id, visibleToClient: true, data } });
  assert(plan.data.days[0].meals[0].length === 2, 'foods on plan');
  const rx = await api('/api/plans', { method: 'POST', body: { title: 'Εντολή 1800', clientId: client.id, data: { targetKcal: 1800, macroTargets: { proteinPct: 30, carbsPct: 40, fatPct: 30 } } } });
  assert(rx.data.targetKcal === '1800', 'rx kcal ' + rx.data.targetKcal);
  assert(rx.data.macroTargets.protein === '135', 'rx protein ' + rx.data.macroTargets.protein);
  assert(rx.data.macroTargets.carbs === '180', 'rx carbs ' + rx.data.macroTargets.carbs);
  assert(rx.data.macroTargets.fat === '60', 'rx fat ' + rx.data.macroTargets.fat);
  const rxAgain = await api('/api/plans/' + rx.id);
  assert(rxAgain.data.macroTargets.proteinPct === '30' && rxAgain.data.macroTargets.fat === '60', 'rx persisted');
  const scaled = scalePlanData(plan.data, 3400);
  assert(scaled.days[0].meals[0][0].grams > 40, 'scaled grams');
  const shop = shoppingList(plan.data);
  assert(shop.some(g => g.items.some(i => i.name.includes('Βρώμη'))), 'shopping');

  const recipe = await api('/api/recipes', { method: 'POST', body: { name: 'Μπολ', servings: 1, ingredients: [{ foodId: oat.id, grams: 40 }, { foodId: milk.id, grams: 200 }] } });
  assert(recipe.perServing.kcal > 100, 'recipe kcal');
  const appt = await api('/api/appointments', { method: 'POST', body: { clientId: client.id, start: '2026-10-28T10:00', cost: 40, status: 'done' } });
  assert(appt.status === 'done', 'appt');
  const stats = await api('/api/appointments/stats?month=2026-10');
  assert(stats.revenueDone === 40, 'revenue ' + stats.revenueDone);
  await api('/api/todos', { method: 'POST', body: { title: 'Κάλεσε', due: '2026-10-28' } });
  const invite = await api('/api/clients/' + client.id + '/invite', { method: 'POST' });
  assert(invite.code && invite.token, 'invite');

  cookie = '';
  const portalUser = await api('/api/join', { method: 'POST', body: { token: invite.token, email: 'maria.client@example.com', password: 'client-pass', name: 'Μαρία' } });
  assert(portalUser.role === 'client', 'role');
  const seen = await api('/api/portal/plans');
  assert(seen.length === 1, 'portal plan');
  const full = await api('/api/portal/plans/' + seen[0].id);
  assert(full.data.days[0].meals[0].length === 2, 'portal detail');
  await api('/api/portal/diary', { method: 'POST', body: { date: '2026-10-28', mealsText: 'βρώμη', waterGlasses: 5 } });
  await api('/api/portal/messages', { method: 'POST', body: { text: 'έτοιμη' } });

  cookie = '';
  await api('/api/login', { method: 'POST', body: { email: 'diet@example.com', password: 'secret-pass' } });
  const diary = await api('/api/clients/' + client.id + '/diary');
  assert(diary[0].waterGlasses === 5, 'diary visible');
  const msgs = await api('/api/clients/' + client.id + '/messages');
  assert(msgs.length === 1, 'message');
  await api('/api/messages-no', { method: 'GET' }).catch(() => {});
  const missing = await fetch(base + '/api/nope', { headers: { Cookie: cookie } });
  assert(missing.status === 404, 'api 404');

  console.log('smoke ok', health.foods, 'foods');
} catch (e) {
  console.error('SMOKE FAIL', e);
  console.error(log);
  process.exitCode = 1;
} finally {
  child.kill();
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}
