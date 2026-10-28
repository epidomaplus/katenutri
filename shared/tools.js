// Εκτιμήσεις για επαγγελματία. Όχι διάγνωση.
// Παιδιατρικά όρια: Cole et al., BMJ 2000;320:1240 (υπέρβαρο/παχυσαρκία, BMI 25 και 30 στα 18)
// και Cole et al., BMJ 2007;335:194 (λιπότητα, BMI 16, 17 και 18.5 στα 18). Γραμμική παρεμβολή ανάμεσα στα εξάμηνα.

import { r1 } from './text.js';

export const TOOL_DISCLAIMER = 'Εργαλείο επαγγελματία. Οι τιμές είναι εκτιμήσεις για τον σχεδιασμό, όχι διάγνωση.';

const OW = [
  [2, 18.41, 18.02, 20.09, 19.81], [2.5, 18.13, 17.76, 19.80, 19.55],
  [3, 17.89, 17.56, 19.57, 19.36], [3.5, 17.69, 17.40, 19.39, 19.23],
  [4, 17.55, 17.28, 19.29, 19.15], [4.5, 17.47, 17.19, 19.26, 19.12],
  [5, 17.42, 17.15, 19.30, 19.17], [5.5, 17.45, 17.20, 19.47, 19.34],
  [6, 17.55, 17.34, 19.78, 19.65], [6.5, 17.71, 17.53, 20.23, 20.08],
  [7, 17.92, 17.75, 20.63, 20.51], [7.5, 18.16, 18.03, 21.09, 21.01],
  [8, 18.44, 18.35, 21.60, 21.57], [8.5, 18.76, 18.69, 22.17, 22.18],
  [9, 19.10, 19.07, 22.77, 22.81], [9.5, 19.46, 19.45, 23.39, 23.46],
  [10, 19.84, 19.86, 24.00, 24.11], [10.5, 20.20, 20.29, 24.57, 24.77],
  [11, 20.55, 20.74, 25.10, 25.42], [11.5, 20.89, 21.20, 25.58, 26.05],
  [12, 21.22, 21.68, 26.02, 26.67], [12.5, 21.56, 22.14, 26.43, 27.24],
  [13, 21.91, 22.58, 26.84, 27.76], [13.5, 22.27, 22.98, 27.25, 28.20],
  [14, 22.62, 23.34, 27.63, 28.57], [14.5, 22.96, 23.66, 27.98, 28.87],
  [15, 23.29, 23.94, 28.30, 29.11], [15.5, 23.60, 24.17, 28.60, 29.29],
  [16, 23.90, 24.37, 28.88, 29.43], [16.5, 24.19, 24.54, 29.14, 29.56],
  [17, 24.46, 24.70, 29.41, 29.69], [17.5, 24.73, 24.85, 29.70, 29.84],
  [18, 25, 25, 30, 30],
];

const THIN = [
  [2, 13.37, 14.12, 15.14, 13.24, 13.90, 14.83], [2.5, 13.22, 13.94, 14.92, 13.10, 13.74, 14.63],
  [3, 13.09, 13.79, 14.74, 12.98, 13.60, 14.47], [3.5, 12.97, 13.64, 14.57, 12.86, 13.47, 14.32],
  [4, 12.86, 13.52, 14.43, 12.73, 13.34, 14.19], [4.5, 12.76, 13.41, 14.31, 12.61, 13.21, 14.06],
  [5, 12.66, 13.31, 14.21, 12.50, 13.09, 13.94], [5.5, 12.58, 13.22, 14.13, 12.40, 12.99, 13.86],
  [6, 12.50, 13.15, 14.07, 12.32, 12.93, 13.82], [6.5, 12.45, 13.10, 14.04, 12.28, 12.90, 13.82],
  [7, 12.42, 13.08, 14.04, 12.26, 12.91, 13.86], [7.5, 12.41, 13.09, 14.08, 12.27, 12.95, 13.93],
  [8, 12.42, 13.11, 14.15, 12.31, 13.00, 14.02], [8.5, 12.45, 13.17, 14.24, 12.37, 13.08, 14.14],
  [9, 12.50, 13.24, 14.35, 12.44, 13.18, 14.28], [9.5, 12.57, 13.34, 14.49, 12.53, 13.29, 14.43],
  [10, 12.66, 13.45, 14.64, 12.64, 13.43, 14.61], [10.5, 12.77, 13.58, 14.80, 12.78, 13.59, 14.81],
  [11, 12.89, 13.72, 14.97, 12.95, 13.79, 15.05], [11.5, 13.03, 13.87, 15.16, 13.15, 14.01, 15.32],
  [12, 13.18, 14.05, 15.35, 13.39, 14.28, 15.62], [12.5, 13.37, 14.25, 15.58, 13.65, 14.56, 15.93],
  [13, 13.59, 14.48, 15.84, 13.92, 14.85, 16.26], [13.5, 13.83, 14.74, 16.12, 14.20, 15.14, 16.57],
  [14, 14.09, 15.01, 16.41, 14.48, 15.43, 16.88], [14.5, 14.35, 15.28, 16.69, 14.75, 15.72, 17.18],
  [15, 14.60, 15.55, 16.98, 15.01, 15.98, 17.45], [15.5, 14.86, 15.82, 17.26, 15.25, 16.22, 17.69],
  [16, 15.12, 16.08, 17.54, 15.46, 16.44, 17.91], [16.5, 15.36, 16.34, 17.80, 15.63, 16.62, 18.09],
  [17, 15.60, 16.58, 18.05, 15.78, 16.77, 18.25], [17.5, 15.81, 16.80, 18.28, 15.90, 16.89, 18.38],
  [18, 16, 17, 18.5, 16, 17, 18.5],
];

function lerp(table, age, col) {
  if (age < table[0][0] || age > table[table.length - 1][0]) return null;
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (age >= a[0] && age <= b[0]) {
      const t = b[0] === a[0] ? 0 : (age - a[0]) / (b[0] - a[0]);
      return a[col] + (b[col] - a[col]) * t;
    }
  }
  return null;
}

export function bmiValue(kg, cm) {
  const h = Number(cm) / 100;
  const w = Number(kg);
  if (!(w > 0) || !(h > 0)) return null;
  return w / (h * h);
}

export function adultBmi(kg, cm) {
  const bmi = bmiValue(kg, cm);
  if (bmi == null) return { error: 'Συμπληρώστε βάρος και ύψος.' };
  let category, tone;
  if (bmi < 18.5) { category = 'Ελλιποβαρής'; tone = 'under'; }
  else if (bmi < 25) { category = 'Φυσιολογικό εύρος'; tone = 'ok'; }
  else if (bmi < 30) { category = 'Υπέρβαρο'; tone = 'warn'; }
  else if (bmi < 35) { category = 'Παχυσαρκία βαθμού I'; tone = 'over'; }
  else if (bmi < 40) { category = 'Παχυσαρκία βαθμού II'; tone = 'over'; }
  else { category = 'Παχυσαρκία βαθμού III'; tone = 'over'; }
  return {
    bmi: r1(bmi),
    category,
    tone,
    bands: ['< 18,5 ελλιποβαρής', '18,5–24,9 φυσιολογικό', '25–29,9 υπέρβαρο', '30–34,9 βαθμός I', '35–39,9 βαθμός II', '≥ 40 βαθμός III'],
    note: 'Κατηγορίες ενηλίκων κατά WHO. Από τα 18 έτη και πάνω.',
  };
}

export function pediatricBmi({ kg, cm, years, months = 0, sex }) {
  const age = Number(years) + (Number(months) || 0) / 12;
  const bmi = bmiValue(kg, cm);
  if (bmi == null) return { error: 'Συμπληρώστε βάρος και ύψος.' };
  if (!(age >= 2 && age <= 18)) return { error: 'Οι πίνακες Cole εδώ καλύπτουν 2 έως 18 έτη. Κάτω από 2 έτη δεν υπολογίζεται. Από τα 18 και πάνω χρησιμοποιήστε τις κατηγορίες ενηλίκων.', limited: true };
  if (sex !== 'male' && sex !== 'female') return { error: 'Για τα όρια Cole χρειάζεται φύλο (αγόρι ή κορίτσι).' };
  const male = sex === 'male';
  const cuts = {
    g3: lerp(THIN, age, male ? 1 : 4),
    g2: lerp(THIN, age, male ? 2 : 5),
    g1: lerp(THIN, age, male ? 3 : 6),
    ow: lerp(OW, age, male ? 1 : 2),
    ob: lerp(OW, age, male ? 3 : 4),
  };
  let category, tone;
  if (bmi < cuts.g3) { category = 'Λιπότητα βαθμού 3 (αντίστοιχο ενηλίκου BMI 16)'; tone = 'over'; }
  else if (bmi < cuts.g2) { category = 'Λιπότητα βαθμού 2 (αντίστοιχο BMI 17)'; tone = 'warn'; }
  else if (bmi < cuts.g1) { category = 'Λιπότητα βαθμού 1 (αντίστοιχο BMI 18,5)'; tone = 'warn'; }
  else if (bmi < cuts.ow) { category = 'Κάτω από το όριο υπέρβαρου'; tone = 'ok'; }
  else if (bmi < cuts.ob) { category = 'Υπέρβαρο (αντίστοιχο ενηλίκου BMI 25)'; tone = 'warn'; }
  else { category = 'Παχυσαρκία (αντίστοιχο ενηλίκου BMI 30)'; tone = 'over'; }
  const round = n => Math.round(n * 100) / 100;
  return {
    bmi: r1(bmi),
    age: Math.round(age * 100) / 100,
    category,
    tone,
    cuts: { g3: round(cuts.g3), g2: round(cuts.g2), g1: round(cuts.g1), ow: round(cuts.ow), ob: round(cuts.ob) },
    note: 'Διεθνή όρια Cole/IOTF, με γραμμική παρεμβολή ανάμεσα στα εξάμηνα. Δεν είναι ελληνικές καμπύλες αύξησης ούτε διαγράμματα WHO.',
  };
}

export function cockcroftGault({ age, weightKg, sex, creatinine, unit = 'mg' }) {
  const a = Number(age);
  const w = Number(weightKg);
  let scr = Number(creatinine);
  if (!(a > 0) || !(w > 0) || !(scr > 0)) return { error: 'Συμπληρώστε ηλικία, βάρος και κρεατινίνη.' };
  if (sex !== 'male' && sex !== 'female') return { error: 'Ο τύπος έχει ξεχωριστό συντελεστή για γυναίκα και άνδρα.' };
  if (a < 18) return { error: 'Ο Cockcroft–Gault δεν προορίζεται για παιδιά.', limited: true };
  if (unit === 'umol') scr = scr / 88.4;
  const sexFactor = sex === 'female' ? 0.85 : 1;
  const crcl = ((140 - a) * w * sexFactor) / (72 * scr);
  let tone = 'ok';
  let band = '≥ 90 mL/min';
  if (crcl < 15) { band = '< 15 mL/min'; tone = 'over'; }
  else if (crcl < 30) { band = '15–29 mL/min'; tone = 'over'; }
  else if (crcl < 45) { band = '30–44 mL/min'; tone = 'warn'; }
  else if (crcl < 60) { band = '45–59 mL/min'; tone = 'warn'; }
  else if (crcl < 90) { band = '60–89 mL/min'; tone = 'warn'; }
  return {
    crcl: r1(crcl),
    scrMg: Math.round(scr * 100) / 100,
    band,
    tone,
    note: 'Εκτιμώμενη κάθαρση κρεατινίνης (Cockcroft–Gault), όχι μετρημένος eGFR. Η ζώνη ακολουθεί τα αριθμητικά όρια KDIGO μόνο ως ανάγνωση. Δεν τίθεται διάγνωση νεφρικής νόσου. Δεν διορθώνεται αυτόματα το βάρος σε παχυσαρκία.',
  };
}

export function tygIndex({ triglycerides, glucose, tgUnit = 'mg', gluUnit = 'mg' }) {
  let tg = Number(triglycerides);
  let glu = Number(glucose);
  if (!(tg > 0) || !(glu > 0)) return { error: 'Συμπληρώστε τριγλυκερίδια και γλυκόζη νηστείας.' };
  if (tgUnit === 'mmol') tg = tg * 88.57;
  if (gluUnit === 'mmol') glu = glu * 18.018;
  const tyg = Math.log((tg * glu) / 2);
  let hint, tone;
  if (tyg < 8.5) { hint = 'Χαμηλότερη τιμή σε σχέση με όρια που αναφέρονται συχνά (~8,5 και ~8,8).'; tone = 'ok'; }
  else if (tyg < 8.8) { hint = 'Ενδιάμεση ζώνη. Δεν υπάρχει ενιαίο διαγνωστικό κατώφλι.'; tone = 'warn'; }
  else { hint = 'Σε μέρος της βιβλιογραφίας, TyG ≥ 8,8 έχει συνδεθεί με υψηλότερη πιθανότητα αντίστασης στην ινσουλίνη.'; tone = 'over'; }
  return {
    tyg: Math.round(tyg * 100) / 100,
    tgMg: Math.round(tg),
    gluMg: Math.round(glu),
    hint,
    tone,
    note: 'TyG = ln(τριγλυκερίδια mg/dL × γλυκόζη νηστείας mg/dL / 2). Ένδειξη κινδύνου, όχι διάγνωση αντίστασης στην ινσουλίνη και όχι αντικατάσταση του HOMA-IR.',
  };
}

export function fiberTargets({ age, sex, kcal, intake }) {
  const a = Number(age);
  if (!(a >= 1 && a < 120)) return { error: 'Η εκτίμηση φυτικών ινών εδώ ξεκινά από 1 έτος.', limited: a < 1 };
  let dri = null;
  let driLabel = '';
  const male = sex === 'male';
  const female = sex === 'female';
  if (a < 4) { dri = 19; driLabel = '1–3 ετών'; }
  else if (a < 9) { dri = 25; driLabel = '4–8 ετών'; }
  else if (a < 14) { dri = male ? 31 : female ? 26 : null; driLabel = '9–13 ετών'; }
  else if (a < 19) { dri = male ? 38 : female ? 26 : null; driLabel = '14–18 ετών'; }
  else if (a < 51) { dri = male ? 38 : female ? 25 : null; driLabel = '19–50 ετών'; }
  else { dri = male ? 30 : female ? 21 : null; driLabel = '51+ ετών'; }
  const kcalN = Number(kcal);
  const perKcal = kcalN > 0 ? (14 * kcalN) / 1000 : null;
  const eaten = Number(intake);
  const gapDri = dri != null && eaten >= 0 && intake !== '' && intake != null ? eaten - dri : null;
  const gapKcal = perKcal != null && eaten >= 0 && intake !== '' && intake != null ? eaten - perKcal : null;
  return {
    dri,
    driLabel,
    perKcal: perKcal == null ? null : Math.round(perKcal * 10) / 10,
    gapDri: gapDri == null ? null : Math.round(gapDri * 10) / 10,
    gapKcal: gapKcal == null ? null : Math.round(gapKcal * 10) / 10,
    both: !male && !female,
    note: 'Ο στόχος 14 g ανά 1.000 kcal είναι ο κανόνας που χρησιμοποιεί η ADA. Τα γραμμάρια ανά ηλικία/φύλο είναι τα Adequate Intake (IOM/DRI) που συχνά παρατίθενται δίπλα του. Δεν καλύπτονται κύηση και γαλουχία.',
  };
}
