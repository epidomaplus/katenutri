import { GROUP_IDS, NUT_KEYS, TARGET_IDS, normalizePlan } from '../shared/nutrition.js';

export function str(v, max = 200) {
  return String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n/g, ' ').trim().slice(0, max);
}
export function text(v, max = 4000) {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}
export function optNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function flag(v) {
  return v === true || v === 'true' || v === 'on' || v === 1 || v === '1';
}
export function reqEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e.slice(0, 120);
}
export function optEmail(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return reqEmail(s);
}
export function httpUrl(v) {
  const s = String(v || '').trim().slice(0, 500);
  if (!s) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return null;
  return s;
}
export function tagsOf(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  const out = [];
  const seen = new Set();
  for (const t of arr) {
    const s = str(t, 30);
    if (!s) continue;
    const k = s.toLocaleLowerCase('el');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 24) break;
  }
  return out;
}

export function clientInput(b = {}) {
  const email = optEmail(b.email);
  if (email === null) return { error: 'Μη έγκυρο email.' };
  const name = str(b.name, 120);
  if (!name) return { error: 'Το όνομα είναι υποχρεωτικό.' };
  const sex = ['female', 'male', 'other', ''].includes(b.sex) ? b.sex : '';
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(b.dob || '') ? b.dob : '';
  let ageYears = optNum(b.ageYears);
  if (ageYears !== null && (ageYears < 0 || ageYears > 120)) ageYears = null;
  const heightCm = optNum(b.heightCm);
  if (heightCm !== null && (heightCm < 40 || heightCm > 250)) return { error: 'Μη έγκυρο ύψος.' };
  let sessionPrice = optNum(b.sessionPrice);
  if (sessionPrice === null || sessionPrice < 0) sessionPrice = 0;
  const p = b.preferences || {};
  return {
    value: {
      name, email, phone: str(b.phone, 40), sex, dob, ageYears, heightCm,
      tags: tagsOf(b.tags),
      goalNotes: text(b.goalNotes, 1500),
      allergies: text(b.allergies, 800),
      preferences: {
        vegan: flag(p.vegan), fasting: flag(p.fasting), keto: flag(p.keto), carbLoading: flag(p.carbLoading),
      },
      sessionPrice: Math.round(sessionPrice * 100) / 100,
    },
  };
}

function numMap(src, keys) {
  const o = {};
  for (const k of keys) {
    const n = optNum(src?.[k]);
    o[k] = n === null ? null : n;
  }
  return o;
}

export function visitInput(b = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '';
  if (!date) return { error: 'Χρειάζεται ημερομηνία επίσκεψης.' };
  return {
    value: {
      date,
      notes: text(b.notes, 4000),
      anthro: numMap(b.anthro, ['weightKg', 'heightCm', 'bmi', 'bodyFatPct', 'muscleKg', 'hydrationPct', 'bmrKcal']),
      skinfolds: numMap(b.skinfolds, ['triceps', 'biceps', 'subscapular', 'suprailiac', 'thigh', 'calf']),
      circ: numMap(b.circ, ['waist', 'hip', 'arm', 'thigh', 'calf', 'chest', 'neck']),
      vitamins: numMap(b.vitamins, ['vitD', 'b12', 'folate', 'iron', 'ferritin']),
      blood: numMap(b.blood, ['hb', 'ht', 'wbc', 'plt']),
      biochem: numMap(b.biochem, ['glucose', 'chol', 'hdl', 'ldl', 'tg', 'tsh']),
      hormones: numMap(b.hormones, ['insulin', 'cortisol', 'testosterone', 'estradiol', 'progesterone', 'prolactin', 'fsh', 'lh']),
    },
  };
}

function targetBag(src, keys) {
  const o = {};
  for (const k of keys) {
    const n = optNum(src?.[k]);
    o[k] = n === null || n < 0 ? '' : String(Math.round(n * 10) / 10);
  }
  return o;
}

export function sanitizeItem(it) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
  const name = str(it.name, 140);
  if (!name) return null;
  const o = {
    foodId: str(it.foodId, 40),
    name,
    category: str(it.category, 60) || 'Άλλα',
    grams: Math.max(0, Math.round((Number(it.grams) || 0) * 10) / 10),
    note: str(it.note, 160),
  };
  for (const k of NUT_KEYS) o[k] = Math.max(0, Number(it[k]) || 0);
  o.group = GROUP_IDS.includes(it.group) ? it.group : '';
  o.exchangeGrams = Math.max(0, Number(it.exchangeGrams) || 0);
  o.secondaryGroup = GROUP_IDS.includes(it.secondaryGroup) ? it.secondaryGroup : '';
  o.secondaryPerExchange = Math.max(0, Number(it.secondaryPerExchange) || 0);
  if (it.isRecipe) {
    o.isRecipe = true;
    o.recipeId = str(it.recipeId, 40);
    o.servingGrams = Math.max(0, Number(it.servingGrams) || 0);
    o.exPer100 = { carb: Math.max(0, Number(it.exPer100?.carb) || 0) };
    for (const id of GROUP_IDS) o.exPer100[id] = Math.max(0, Number(it.exPer100?.[id]) || 0);
    o.ingredients = Array.isArray(it.ingredients) ? it.ingredients.slice(0, 40).map(i => ({
      foodId: str(i?.foodId, 40),
      name: str(i?.name, 140),
      category: str(i?.category, 60),
      grams: Math.max(0, Number(i?.grams) || 0),
    })).filter(i => i.name) : [];
  }
  return o;
}

export function planData(data) {
  const base = normalizePlan(data);
  base.days.forEach(d => {
    d.meals = d.meals.map(m => m.map(sanitizeItem).filter(Boolean));
  });
  base.macroTargets = targetBag(base.macroTargets, ['protein', 'carbs', 'fat']);
  base.exchangeTargets = targetBag(base.exchangeTargets, TARGET_IDS);
  if (base.targetKcal !== '' && base.targetKcal != null) {
    const n = optNum(base.targetKcal);
    base.targetKcal = n === null || n < 0 ? '' : String(Math.round(n));
  }
  return base;
}

export function foodInput(b = {}) {
  const name = str(b.name, 100);
  if (!name) return { error: 'Χρειάζεται όνομα τροφίμου.' };
  const group = GROUP_IDS.includes(b.group) ? b.group : '';
  if (!group) return { error: 'Διαλέξτε ομάδα ισοδυνάμου.' };
  const num = (k) => Math.max(0, Number(b[k]) || 0);
  return {
    value: {
      name, group, category: str(b.category, 40) || 'Δικά μου',
      kcal: num('kcal'), protein: num('protein'), carbs: num('carbs'), fat: num('fat'),
      fiber: num('fiber'), sodium: num('sodium'), calcium: num('calcium'),
      iron: num('iron'), vitC: num('vitC'), vitD: num('vitD'),
      portionGrams: num('portionGrams') || 100,
      portionLabel: str(b.portionLabel, 40),
      vegan: flag(b.vegan), fasting: flag(b.fasting), keto: flag(b.keto),
    },
  };
}
