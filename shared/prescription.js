/** Daily diet prescription: kcal ↔ macro % ↔ grams. */

export const KCAL_PER_GRAM = Object.freeze({ protein: 4, carbs: 4, fat: 9 });
export const MACROS = ['protein', 'carbs', 'fat'];
export const PCT_TOLERANCE = 0.5;
export const KCAL_MIN = 400;
export const KCAL_MAX = 10000;
export const GRAM_MAX = 1500;

const LABELS = { protein: 'πρωτεΐνης', carbs: 'υδατανθράκων', fat: 'λίπους' };

export function emptyMacroTargets() {
  return { protein: '', carbs: '', fat: '', proteinPct: '', carbsPct: '', fatPct: '' };
}

export function formatMacro(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  const r = Math.round((x + Number.EPSILON) * 10) / 10;
  if (Object.is(r, -0)) return '0';
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function parseMacro(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function gramsFromPercent(kcal, percent, macro) {
  const per = KCAL_PER_GRAM[macro];
  const k = Number(kcal);
  const p = Number(percent);
  if (!(per > 0) || !(k > 0) || !Number.isFinite(p)) return null;
  return (k * (p / 100)) / per;
}

export function percentFromGrams(kcal, grams, macro) {
  const per = KCAL_PER_GRAM[macro];
  const k = Number(kcal);
  const g = Number(grams);
  if (!(per > 0) || !(k > 0) || !Number.isFinite(g)) return null;
  return (g * per / k) * 100;
}

export function gramsFromPercents(kcal, percents) {
  return {
    protein: gramsFromPercent(kcal, percents.protein, 'protein'),
    carbs: gramsFromPercent(kcal, percents.carbs, 'carbs'),
    fat: gramsFromPercent(kcal, percents.fat, 'fat'),
  };
}

export function ensureMacroTargets(data) {
  data.macroTargets = { ...emptyMacroTargets(), ...(data.macroTargets || {}) };
  return data.macroTargets;
}

/** Edit one field. % updates grams; grams update %; kcal recomputes grams from the current %. */
export function applyPrescriptionEdit(data, field, raw) {
  const mt = ensureMacroTargets(data);
  const value = String(raw ?? '').trim().replace(',', '.');
  const kcal = () => Number(data.targetKcal);

  if (field === 'kcal') {
    data.targetKcal = value;
    const k = Number(value);
    for (const m of MACROS) {
      if (!(k > 0) || mt[m + 'Pct'] === '' || mt[m + 'Pct'] == null) {
        if (!(k > 0)) mt[m] = '';
        continue;
      }
      mt[m] = formatMacro(gramsFromPercent(k, mt[m + 'Pct'], m));
    }
    return data;
  }

  const isPct = field.endsWith('Pct');
  const macro = isPct ? field.slice(0, -3) : field;
  if (!MACROS.includes(macro)) return data;
  if (isPct) mt[macro + 'Pct'] = value;
  else mt[macro] = value;

  const k = kcal();
  if (value === '') {
    if (isPct) mt[macro] = '';
    else mt[macro + 'Pct'] = '';
    return data;
  }
  if (!(k > 0)) {
    if (isPct) mt[macro] = '';
    else mt[macro + 'Pct'] = '';
    return data;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return data;
  if (isPct) mt[macro] = formatMacro(gramsFromPercent(k, n, macro));
  else mt[macro + 'Pct'] = formatMacro(percentFromGrams(k, n, macro));
  return data;
}

/** After the gram or percent field blurs, store 1 decimal and make grams follow the rounded %. */
export function alignMacroFromPercent(data, macro) {
  const mt = ensureMacroTargets(data);
  if (!MACROS.includes(macro)) return data;
  const pct = mt[macro + 'Pct'];
  if (pct === '' || pct == null) return data;
  const n = Number(pct);
  if (!Number.isFinite(n)) return data;
  mt[macro + 'Pct'] = formatMacro(n);
  const k = Number(data.targetKcal);
  if (k > 0) mt[macro] = formatMacro(gramsFromPercent(k, mt[macro + 'Pct'], macro));
  return data;
}

export function describePrescription(data) {
  const mt = data?.macroTargets || {};
  const kcalRaw = data?.targetKcal ?? '';
  const kcal = parseMacro(kcalRaw);
  const percents = {};
  const grams = {};
  for (const m of MACROS) {
    percents[m] = parseMacro(mt[m + 'Pct']);
    grams[m] = parseMacro(mt[m]);
  }
  const kcalEmpty = kcalRaw === '' || kcalRaw == null;
  const anyPct = MACROS.some(m => percents[m] != null);
  const anyG = MACROS.some(m => grams[m] != null);
  const anyBad = [kcal, ...MACROS.flatMap(m => [percents[m], grams[m]])].some(v => Number.isNaN(v));
  if (kcalEmpty && !anyPct && !anyG && !anyBad) {
    return { ok: true, empty: true, complete: false, errors: [], sum: null, kcal: null, percents: { protein: null, carbs: null, fat: null }, grams: { protein: null, carbs: null, fat: null }, macroKcal: null };
  }

  const errors = [];
  if (!kcalEmpty) {
    if (Number.isNaN(kcal) || kcal <= 0) errors.push('Οι θερμίδες πρέπει να είναι θετικός αριθμός.');
    else if (kcal > KCAL_MAX) errors.push('Οι θερμίδες πρέπει να είναι έως 10.000 kcal.');
    else if (kcal < KCAL_MIN) errors.push('Οι θερμίδες πρέπει να είναι τουλάχιστον 400 kcal.');
  } else if (anyPct || anyG) {
    errors.push('Συμπληρώστε τις ημερήσιες θερμίδες.');
  }

  let pctFilled = 0;
  const pctOk = {};
  for (const m of MACROS) {
    const v = percents[m];
    if (v == null) continue;
    pctFilled++;
    if (Number.isNaN(v) || v < 0 || v > 100) errors.push(`Το ποσοστό ${LABELS[m]} πρέπει να είναι από 0 έως 100.`);
    else pctOk[m] = v;
  }
  let sum = null;
  if (pctFilled === 3 && Object.keys(pctOk).length === 3) {
    sum = pctOk.protein + pctOk.carbs + pctOk.fat;
    if (Math.abs(sum - 100) > PCT_TOLERANCE) errors.push(`Τα ποσοστά πρέπει να αθροίζουν 100% (τώρα ${formatMacro(sum)}%).`);
  }

  const gOk = {};
  for (const m of MACROS) {
    const v = grams[m];
    if (v == null) continue;
    if (Number.isNaN(v) || v < 0) errors.push(`Τα γραμμάρια ${LABELS[m]} πρέπει να είναι μηδέν ή θετικός αριθμός.`);
    else if (v > GRAM_MAX) errors.push(`Τα γραμμάρια ${LABELS[m]} είναι υπερβολικά υψηλά.`);
    else gOk[m] = v;
  }

  const macroKcal = (gOk.protein != null || gOk.carbs != null || gOk.fat != null)
    ? {
      protein: (gOk.protein || 0) * KCAL_PER_GRAM.protein,
      carbs: (gOk.carbs || 0) * KCAL_PER_GRAM.carbs,
      fat: (gOk.fat || 0) * KCAL_PER_GRAM.fat,
    }
    : null;
  if (macroKcal) macroKcal.total = macroKcal.protein + macroKcal.carbs + macroKcal.fat;

  const blank = { protein: null, carbs: null, fat: null };
  return {
    ok: errors.length === 0,
    empty: false,
    complete: pctFilled === 3 && errors.length === 0 && kcal > 0,
    errors,
    sum,
    kcal: Number.isFinite(kcal) ? kcal : null,
    percents: { ...blank, ...pctOk },
    grams: { ...blank, ...gOk },
    macroKcal,
    pctFilled,
  };
}

/** Stricter check for creating a plan: a started split must be complete and sum to 100%. */
export function prescriptionReady(data) {
  const d = describePrescription(data);
  if (d.empty) return d;
  if (!d.ok) return d;
  const mt = data?.macroTargets || {};
  const started = MACROS.some(m => parseMacro(mt[m]) != null || parseMacro(mt[m + 'Pct']) != null);
  if (started && d.pctFilled !== 3) {
    return { ...d, ok: false, complete: false, errors: ['Συμπληρώστε και τα τρία ποσοστά (πρωτεΐνη, υδατάνθρακες, λίπος).'] };
  }
  if (started && d.sum != null && Math.abs(d.sum - 100) > PCT_TOLERANCE) {
    return { ...d, ok: false, complete: false };
  }
  return d;
}

export function hydratePrescription(data) {
  const mt = ensureMacroTargets(data);
  const kcal = Number(data.targetKcal);
  if (!(kcal > 0)) return data;
  const pctAll = MACROS.every(m => mt[m + 'Pct'] !== '' && mt[m + 'Pct'] != null);
  const gAll = MACROS.every(m => mt[m] !== '' && mt[m] != null);
  const pctAny = MACROS.some(m => mt[m + 'Pct'] !== '' && mt[m + 'Pct'] != null);
  if (!pctAny && gAll) {
    for (const m of MACROS) mt[m + 'Pct'] = formatMacro(percentFromGrams(kcal, mt[m], m));
  } else if (pctAll && !gAll) {
    for (const m of MACROS) mt[m] = formatMacro(gramsFromPercent(kcal, mt[m + 'Pct'], m));
  }
  return data;
}

/** When the percent split is valid, grams are derived from kcal and %. Legacy gram-only plans gain %. */
export function canonicalizePrescription(data) {
  const mt = ensureMacroTargets(data);
  const kcal = Number(data.targetKcal);
  const pctAll = MACROS.every(m => mt[m + 'Pct'] !== '' && mt[m + 'Pct'] != null);
  const gAll = MACROS.every(m => mt[m] !== '' && mt[m] != null);
  const pctAny = MACROS.some(m => mt[m + 'Pct'] !== '' && mt[m + 'Pct'] != null);
  if (kcal > 0 && pctAll) {
    const sum = MACROS.reduce((a, m) => a + Number(mt[m + 'Pct']), 0);
    if (Number.isFinite(sum) && Math.abs(sum - 100) <= PCT_TOLERANCE) {
      for (const m of MACROS) mt[m] = formatMacro(gramsFromPercent(kcal, mt[m + 'Pct'], m));
    }
  } else if (kcal > 0 && gAll && !pctAny) {
    for (const m of MACROS) mt[m + 'Pct'] = formatMacro(percentFromGrams(kcal, mt[m], m));
  }
  return data;
}

/** Build stored targets from a percent split. Fat can absorb rounding so the sum stays 100. */
export function targetsFromPercents(kcal, percents) {
  const mt = emptyMacroTargets();
  for (const m of MACROS) {
    mt[m + 'Pct'] = formatMacro(percents[m]);
    const g = gramsFromPercent(kcal, percents[m], m);
    mt[m] = g == null ? '' : formatMacro(g);
  }
  return mt;
}

export function percentsFromEstimate(kcal, grams) {
  if (!(Number(kcal) > 0)) return null;
  const p = percentFromGrams(kcal, grams.protein, 'protein');
  const c = percentFromGrams(kcal, grams.carbs, 'carbs');
  if (p == null || c == null || p < 0 || c < 0 || p > 100 || c > 100) return null;
  const p10 = Math.round(p * 10);
  const c10 = Math.round(c * 10);
  const f10 = 1000 - p10 - c10;
  if (f10 < 0 || p10 < 0 || c10 < 0 || f10 > 1000) return null;
  return { protein: p10 / 10, carbs: c10 / 10, fat: f10 / 10 };
}

export function prescriptionSummary(data) {
  const mt = data?.macroTargets || {};
  const parts = [];
  if (data?.targetKcal) parts.push(`${data.targetKcal} kcal`);
  const rows = [['Π', 'protein'], ['Υ', 'carbs'], ['Λ', 'fat']];
  for (const [label, key] of rows) {
    const g = mt[key];
    const p = mt[key + 'Pct'];
    if (g === '' || g == null) continue;
    parts.push(`${label} ${g} g${p !== '' && p != null ? ` (${p}%)` : ''}`);
  }
  return parts.join(' · ');
}
