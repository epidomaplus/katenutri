import { GROUP_IDS, NUT_KEYS, TARGET_IDS, normalizePlan } from '../shared/nutrition.js';
import { canonicalizePrescription, KCAL_MAX, GRAM_MAX } from '../shared/prescription.js';
import { normalizeBarcode, nutrientError, parseNutrient } from '../shared/products.js';

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
  o.sugars = optSub(it.sugars);
  o.saturated = optSub(it.saturated);
  if (o.sugars != null && o.sugars > o.carbs) o.sugars = o.carbs;
  if (o.saturated != null && o.saturated > o.fat) o.saturated = o.fat;
  o.brand = str(it.brand, 80);
  o.barcode = normalizeBarcode(it.barcode);
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
  base.macroTargets = {
    protein: boundedTarget(base.macroTargets.protein, GRAM_MAX),
    carbs: boundedTarget(base.macroTargets.carbs, GRAM_MAX),
    fat: boundedTarget(base.macroTargets.fat, GRAM_MAX),
    proteinPct: boundedTarget(base.macroTargets.proteinPct, 100),
    carbsPct: boundedTarget(base.macroTargets.carbsPct, 100),
    fatPct: boundedTarget(base.macroTargets.fatPct, 100),
  };
  base.exchangeTargets = targetBag(base.exchangeTargets, TARGET_IDS);
  if (base.targetKcal !== '' && base.targetKcal != null) {
    const n = optNum(String(base.targetKcal).replace(',', '.'));
    base.targetKcal = n === null || n < 0 || n > KCAL_MAX ? '' : String(Math.round(n));
  }
  return canonicalizePrescription(base);
}

function optSub(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseNutrient(v);
  if (n == null || n < 0) return null;
  return n;
}

function boundedTarget(v, max) {
  const n = optNum(v == null ? v : String(v).replace(',', '.'));
  if (n === null || n < 0 || n > max) return '';
  return String(Math.round(n * 10) / 10);
}

function readNut(v) {
  if (v === '' || v == null) return 0;
  const n = parseNutrient(v);
  if (n == null || n < 0) return null;
  return n;
}

export function foodInput(b = {}) {
  const name = str(b.name, 140);
  if (!name) return { error: 'Χρειάζεται όνομα τροφίμου.' };
  const group = GROUP_IDS.includes(b.group) ? b.group : '';
  if (!group) return { error: 'Διαλέξτε ομάδα ισοδυνάμου.' };
  const kcal = readNut(b.kcal);
  const protein = readNut(b.protein);
  const carbs = readNut(b.carbs);
  const fat = readNut(b.fat);
  if (kcal == null || protein == null || carbs == null || fat == null) return { error: 'Μη έγκυρη διατροφική τιμή.' };
  const sugars = b.sugars === '' || b.sugars == null ? null : readNut(b.sugars);
  const saturated = b.saturated === '' || b.saturated == null ? null : readNut(b.saturated);
  if (sugars == null && b.sugars !== '' && b.sugars != null) return { error: 'Μη έγκυρη τιμή για τα σάκχαρα.' };
  if (saturated == null && b.saturated !== '' && b.saturated != null) return { error: 'Μη έγκυρη τιμή για τα κορεσμένα.' };
  const bound = nutrientError({ carbs, sugars, fat, saturated });
  if (bound) return { error: bound };
  const micro = (k) => {
    if (b[k] === undefined || b[k] === '') return 0;
    const n = readNut(b[k]);
    return n == null ? 0 : n;
  };
  return {
    value: {
      name, brand: str(b.brand, 80), barcode: normalizeBarcode(b.barcode),
      group, category: str(b.category, 40) || 'Δικά μου',
      kcal, protein, carbs, sugars, fat, saturated,
      fiber: micro('fiber'), sodium: micro('sodium'), calcium: micro('calcium'),
      iron: micro('iron'), vitC: micro('vitC'), vitD: micro('vitD'),
      portionGrams: micro('portionGrams') || 100,
      portionLabel: str(b.portionLabel, 80),
      vegan: flag(b.vegan), fasting: flag(b.fasting), keto: flag(b.keto),
    },
  };
}
