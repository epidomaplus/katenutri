import { r1 } from './text.js';

export const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
export const DEFAULT_MEALS = ['Πρωινό', 'Ενδιάμεσο', 'Μεσημεριανό', 'Απογευματινό', 'Βραδινό'];

export const GROUPS = [
  { id: 'starch', label: 'Άμυλο / ψωμί', short: 'Άμυλο', hint: '15 g υδατανθράκων' },
  { id: 'fruit', label: 'Φρούτο', short: 'Φρούτο', hint: '15 g υδατανθράκων' },
  { id: 'milk', label: 'Γάλα', short: 'Γάλα', hint: '12 g υδατανθράκων' },
  { id: 'vegetable', label: 'Λαχανικά', short: 'Λαχανικά', hint: '5 g υδατανθράκων' },
  { id: 'meat_lean', label: 'Κρέας άπαχο', short: 'Κρ. άπαχο', hint: '7 g πρωτεΐνης, ≤3 g λίπους' },
  { id: 'meat_medium', label: 'Κρέας μέτριο', short: 'Κρ. μέτριο', hint: '7 g πρωτεΐνης, 3–7 g λίπους' },
  { id: 'meat_fat', label: 'Κρέας παχύ', short: 'Κρ. παχύ', hint: '7 g πρωτεΐνης, >7 g λίπους' },
  { id: 'fat', label: 'Λίπος', short: 'Λίπος', hint: '5 g λίπους' },
  { id: 'free', label: 'Ελεύθερα', short: 'Ελεύθερα', hint: 'Δεν μετρούν ως μερίδα' },
];

export const GROUP_IDS = GROUPS.map(g => g.id);
export const TARGET_IDS = [...GROUP_IDS.filter(id => id !== 'free'), 'carb'];

export function groupById(id) { return GROUPS.find(g => g.id === id) || null; }
export function groupLabel(id) { return groupById(id)?.label || '—'; }
export function groupShort(id) { return groupById(id)?.short || '—'; }

export const NUT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium', 'calcium', 'iron', 'vitC', 'vitD'];

export const MICRO_REF = [
  { key: 'fiber', label: 'Φυτικές ίνες', unit: 'g', ref: 25 },
  { key: 'sodium', label: 'Νάτριο', unit: 'mg', ref: 2000, watchHigh: true },
  { key: 'calcium', label: 'Ασβέστιο', unit: 'mg', ref: 800 },
  { key: 'iron', label: 'Σίδηρος', unit: 'mg', ref: 14 },
  { key: 'vitC', label: 'Βιταμίνη C', unit: 'mg', ref: 80 },
  { key: 'vitD', label: 'Βιταμίνη D', unit: 'μg', ref: 15 },
];

export const ACTIVITIES = [
  { id: '1.2', factor: 1.2, label: 'Καθιστική', detail: 'Λίγη ή καθόλου άσκηση' },
  { id: '1.375', factor: 1.375, label: 'Ήπια', detail: '1–3 φορές την εβδομάδα' },
  { id: '1.55', factor: 1.55, label: 'Μέτρια', detail: '3–5 φορές την εβδομάδα' },
  { id: '1.725', factor: 1.725, label: 'Έντονη', detail: '6–7 φορές την εβδομάδα' },
  { id: '1.9', factor: 1.9, label: 'Πολύ έντονη', detail: 'Καθημερινή έντονη προπόνηση' },
];

export function emptyNut() {
  return Object.fromEntries(NUT_KEYS.map(k => [k, 0]));
}
export function emptyGroups() {
  return Object.fromEntries(GROUP_IDS.map(id => [id, 0]));
}
export function emptyEx() {
  return { carb: 0, groups: emptyGroups() };
}

export function exchangeGramsFor(group, per100) {
  const carbs = Number(per100.carbs) || 0;
  const protein = Number(per100.protein) || 0;
  const fat = Number(per100.fat) || 0;
  const grams = (target, density) => density > 0 ? Math.round(target / density) : 0;
  let g = 0;
  if (group === 'starch' || group === 'fruit') g = grams(1500, carbs);
  else if (group === 'milk') g = grams(1200, carbs);
  else if (group === 'vegetable') g = grams(500, carbs);
  else if (group === 'meat_lean' || group === 'meat_medium' || group === 'meat_fat') g = grams(700, protein);
  else if (group === 'fat') g = grams(500, fat);
  else return 0;
  if (!g) return 0;
  return Math.min(600, Math.max(1, g));
}

export function meatGroup(protein, fat) {
  const p = Number(protein) || 0;
  const f = Number(fat) || 0;
  if (p <= 0) return 'meat_medium';
  const fatPerEx = f * (7 / p);
  if (fatPerEx <= 3) return 'meat_lean';
  if (fatPerEx <= 7) return 'meat_medium';
  return 'meat_fat';
}

export function itemNut(it) {
  const k = (Number(it?.grams) || 0) / 100;
  const o = emptyNut();
  for (const key of NUT_KEYS) o[key] = (Number(it?.[key]) || 0) * k;
  return o;
}

export function itemEx(it) {
  const grams = Number(it?.grams) || 0;
  const groups = emptyGroups();
  if (it?.exPer100 && typeof it.exPer100 === 'object') {
    const k = grams / 100;
    for (const id of GROUP_IDS) groups[id] = (Number(it.exPer100[id]) || 0) * k;
    return { carb: (Number(it.exPer100.carb) || 0) * k, groups };
  }
  const carb = ((Number(it?.carbs) || 0) * grams / 100) / 15;
  if (it?.group && it.group !== 'free' && Number(it.exchangeGrams) > 0 && groups[it.group] !== undefined) {
    const n = grams / Number(it.exchangeGrams);
    groups[it.group] += n;
    if (it.secondaryGroup && groups[it.secondaryGroup] !== undefined && Number(it.secondaryPerExchange) > 0) {
      groups[it.secondaryGroup] += n * Number(it.secondaryPerExchange);
    }
  }
  return { carb, groups };
}

export function addNut(a, b) {
  for (const k of NUT_KEYS) a[k] += b[k] || 0;
  return a;
}
export function addEx(a, b) {
  a.carb += b.carb || 0;
  for (const id of GROUP_IDS) a.groups[id] += b.groups?.[id] || 0;
  return a;
}
export function sumNut(items) {
  return (items || []).reduce((a, it) => addNut(a, itemNut(it)), emptyNut());
}
export function sumEx(items) {
  return (items || []).reduce((a, it) => addEx(a, itemEx(it)), emptyEx());
}
export function divNut(nut, n) {
  const d = n || 1;
  const o = emptyNut();
  for (const k of NUT_KEYS) o[k] = nut[k] / d;
  return o;
}
export function divEx(ex, n) {
  const d = n || 1;
  const groups = emptyGroups();
  for (const id of GROUP_IDS) groups[id] = (ex.groups[id] || 0) / d;
  return { carb: ex.carb / d, groups };
}

export function macroSplit(nut) {
  const p = (nut.protein || 0) * 4;
  const c = (nut.carbs || 0) * 4;
  const f = (nut.fat || 0) * 9;
  const all = p + c + f || 1;
  return { p, c, f, all, pp: p / all * 100, cp: c / all * 100, fp: f / all * 100 };
}

export function cleanItems(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(it => it && typeof it === 'object' && it.name);
}

export function emptyExchangeTargets() {
  return Object.fromEntries(TARGET_IDS.map(id => [id, '']));
}

export function emptyPlan() {
  return {
    mealNames: DEFAULT_MEALS.slice(),
    days: DAYS.map(name => ({ name, note: '', meals: DEFAULT_MEALS.map(() => []) })),
    notes: '',
    startDate: '',
    targetKcal: '',
    macroTargets: { protein: '', carbs: '', fat: '' },
    exchangeTargets: emptyExchangeTargets(),
    viewMode: 'both',
  };
}

export function normalizePlan(data) {
  const base = emptyPlan();
  if (!data || typeof data !== 'object') return base;
  const mealNames = Array.isArray(data.mealNames) && data.mealNames.length
    ? data.mealNames.slice(0, 12).map(n => String(n || 'Γεύμα').slice(0, 40))
    : base.mealNames.slice();
  const daysIn = Array.isArray(data.days) ? data.days : [];
  const days = DAYS.map((name, i) => {
    const d = daysIn[i] || {};
    const meals = mealNames.map((_, mi) => cleanItems(d.meals?.[mi]).slice(0, 40));
    return { name: String(d.name || name).slice(0, 40), note: String(d.note || '').slice(0, 500), meals };
  });
  const mode = ['macros', 'exchanges', 'both'].includes(data.viewMode) ? data.viewMode : 'both';
  return {
    mealNames,
    days,
    notes: String(data.notes || '').slice(0, 4000),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(data.startDate || '') ? data.startDate : '',
    targetKcal: data.targetKcal === 0 || data.targetKcal ? String(data.targetKcal).slice(0, 8) : '',
    macroTargets: { protein: '', carbs: '', fat: '', ...(data.macroTargets || {}) },
    exchangeTargets: { ...emptyExchangeTargets(), ...(data.exchangeTargets || {}) },
    viewMode: mode,
  };
}

export function dayNut(day) {
  return sumNut((day?.meals || []).flat());
}
export function dayEx(day) {
  return sumEx((day?.meals || []).flat());
}
export function planDaysWithFood(plan) {
  return plan.days.filter(d => dayNut(d).kcal > 0);
}

export function scalePlanData(data, targetKcal) {
  const plan = normalizePlan(data);
  const target = Number(targetKcal);
  if (!target) return plan;
  const positive = plan.days.map(dayNut).map(n => n.kcal).filter(k => k > 0);
  if (!positive.length) return plan;
  const avg = positive.reduce((a, b) => a + b, 0) / positive.length;
  const factor = target / avg;
  if (!Number.isFinite(factor) || factor <= 0) return plan;
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const it of meal) {
        const g = Number(it.grams) || 0;
        if (g > 0) it.grams = Math.max(5, Math.round((g * factor) / 5) * 5);
      }
    }
  }
  plan.targetKcal = String(Math.round(target));
  return plan;
}

export function shoppingList(data) {
  const plan = normalizePlan(data);
  const map = new Map();
  const add = (key, name, category, grams) => {
    if (!(grams > 0)) return;
    const cur = map.get(key) || { name, category: category || 'Άλλα', grams: 0 };
    cur.grams += grams;
    map.set(key, cur);
  };
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const it of meal) {
        const g = Number(it.grams) || 0;
        if (it.isRecipe && Array.isArray(it.ingredients) && Number(it.servingGrams) > 0) {
          const f = g / Number(it.servingGrams);
          for (const ing of it.ingredients) {
            add('i:' + (ing.foodId || ing.name), ing.name, ing.category, (Number(ing.grams) || 0) * f);
          }
        } else if (g > 0) {
          add('f:' + (it.foodId || it.name), it.name, it.category, g);
        }
      }
    }
  }
  const items = [...map.values()].sort((a, b) => a.category.localeCompare(b.category, 'el') || a.name.localeCompare(b.name, 'el'));
  const groups = [];
  for (const it of items) {
    let g = groups.find(x => x.category === it.category);
    if (!g) { g = { category: it.category, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return groups;
}

export function itemFromFood(food, grams, note = '') {
  const g = Math.max(0, Number(grams) || 0);
  return {
    foodId: food.id,
    name: food.name,
    category: food.category,
    grams: g,
    note: String(note || ''),
    kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
    fiber: food.fiber || 0, sodium: food.sodium || 0, calcium: food.calcium || 0,
    iron: food.iron || 0, vitC: food.vitC || 0, vitD: food.vitD || 0,
    group: food.group,
    exchangeGrams: food.exchangeGrams || 0,
    secondaryGroup: food.secondaryGroup || '',
    secondaryPerExchange: food.secondaryPerExchange || 0,
  };
}

export function presentRecipe(recipe) {
  const ingredients = recipe?.ingredients || [];
  const nut = sumNut(ingredients);
  const ex = sumEx(ingredients);
  const totalGrams = ingredients.reduce((s, i) => s + (Number(i.grams) || 0), 0);
  const servings = Math.max(1, Number(recipe?.servings) || 1);
  return {
    nut, ex, totalGrams, servings,
    perServingNut: divNut(nut, servings),
    perServingEx: divEx(ex, servings),
    servingGrams: totalGrams / servings,
  };
}

export function itemFromRecipe(recipe, servingsToAdd = 1) {
  const p = presentRecipe(recipe);
  const one = p.servingGrams > 0 ? p.servingGrams : 0;
  const add = Math.max(0.25, Number(servingsToAdd) || 1);
  const grams = one ? Math.max(1, Math.round(one * add)) : 0;
  const per100 = p.totalGrams > 0 ? 100 / p.totalGrams : 0;
  const nut100 = emptyNut();
  for (const k of NUT_KEYS) nut100[k] = p.nut[k] * per100;
  const exPer100 = { carb: p.ex.carb * per100 };
  for (const id of GROUP_IDS) exPer100[id] = p.ex.groups[id] * per100;
  const note = Math.abs(add - 1) < 0.01 ? '1 μερίδα' : `${String(r1(add)).replace('.', ',')} μερίδες`;
  return {
    isRecipe: true,
    recipeId: recipe.id,
    name: recipe.name,
    category: 'Συνταγές',
    grams,
    servingGrams: one || grams || 1,
    note,
    ...nut100,
    group: '',
    exchangeGrams: 0,
    secondaryGroup: '',
    secondaryPerExchange: 0,
    exPer100,
    ingredients: (recipe.ingredients || []).map(i => ({
      foodId: i.foodId, name: i.name, category: i.category,
      grams: (Number(i.grams) || 0) / p.servings,
    })),
  };
}

export function portionCarbEx(food) {
  return ((Number(food.carbs) || 0) * (Number(food.portionGrams) || 0) / 100) / 15;
}
export function portionGroupEx(food) {
  if (!food.exchangeGrams) return 0;
  return (Number(food.portionGrams) || 0) / Number(food.exchangeGrams);
}

export function bmi(kg, cm) {
  const h = Number(cm) / 100;
  const w = Number(kg);
  if (!(w > 0) || !(h > 0)) return null;
  return w / (h * h);
}

export function ageFromDob(dob, now = new Date()) {
  if (!dob) return null;
  const [y, m, d] = String(dob).split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = now.getFullYear() - y;
  const md = now.getMonth() + 1;
  if (md < m || (md === m && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function bmrMifflin({ sex, kg, cm, age }) {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return null;
}
export function bmrHarris({ sex, kg, cm, age }) {
  if (sex === 'male') return 88.362 + 13.397 * kg + 4.799 * cm - 5.677 * age;
  if (sex === 'female') return 447.593 + 9.247 * kg + 3.098 * cm - 4.330 * age;
  return null;
}

export function shiftDate(iso, days) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const EXCHANGE_DISCLAIMER = 'Τα ισοδύναμα είναι εκπαιδευτική προσέγγιση (1 ισοδύναμο υδατανθράκων ≈ 15 g CHO· άμυλο/φρούτο 15 g· γάλα 12 g· λαχανικά 5 g· κρέας 7 g πρωτεΐνης· λίπος 5 g). Δεν αποτελούν ιατρικό πρωτόκολλο ούτε οδηγία θεραπείας.';
