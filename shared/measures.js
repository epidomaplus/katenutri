import { r1 } from './text.js';
import { bmi as bmiCalc } from './nutrition.js';

export const SKINFOLD_KEYS = ['triceps', 'biceps', 'subscapular', 'suprailiac', 'thigh', 'calf'];

export const VISIT_FIELDS = {
  anthro: ['weightKg', 'heightCm', 'bmi', 'bodyFatPct', 'muscleKg', 'hydrationPct', 'bmrKcal'],
  skinfolds: SKINFOLD_KEYS,
  circ: ['waist', 'hip', 'arm', 'thigh', 'calf', 'chest', 'neck'],
  vitamins: ['vitD', 'b12', 'folate', 'iron', 'ferritin'],
  blood: ['hb', 'ht', 'wbc', 'plt'],
  biochem: ['glucose', 'chol', 'hdl', 'ldl', 'tg', 'tsh'],
  hormones: ['insulin', 'cortisol', 'testosterone', 'estradiol', 'progesterone', 'prolactin', 'fsh', 'lh'],
};

export const MEASURE_FORM = [
  {
    id: 'anthro', title: 'Σωματομετρικές',
    note: 'Η μέση και το ισχίο καταχωρούνται μία φορά στις μεζούρες και φαίνονται και στο φύλλο σωματομετρικών.',
    fields: [
      { key: 'weightKg', label: 'Βάρος', unit: 'kg', step: '0.1' },
      { key: 'heightCm', label: 'Ύψος', unit: 'cm', step: '0.1' },
      { key: 'bodyFatPct', label: 'Σωματικό λίπος', unit: '%', step: '0.1' },
      { key: 'muscleKg', label: 'Μυϊκή μάζα', unit: 'kg', step: '0.1' },
      { key: 'hydrationPct', label: 'Υγρά σώματος', unit: '%', step: '0.1' },
      { key: 'bmrKcal', label: 'BMR (καταγραφή)', unit: 'kcal', step: '1' },
    ],
  },
  {
    id: 'skinfolds', title: 'Δερματοπτυχές',
    note: 'Σε χιλιοστά. Το άθροισμα υπολογίζεται από όσες πτυχές έχουν τιμή.',
    fields: [
      { key: 'triceps', label: 'Τρικέφαλος', unit: 'mm', step: '0.1' },
      { key: 'biceps', label: 'Δικέφαλος', unit: 'mm', step: '0.1' },
      { key: 'subscapular', label: 'Υποπλάτια', unit: 'mm', step: '0.1' },
      { key: 'suprailiac', label: 'Υπερλαγόνια', unit: 'mm', step: '0.1' },
      { key: 'thigh', label: 'Μηρός', unit: 'mm', step: '0.1' },
      { key: 'calf', label: 'Γάμπα', unit: 'mm', step: '0.1' },
    ],
  },
  {
    id: 'circ', title: 'Μεζούρες',
    note: 'Περιφέρειες σε εκατοστά.',
    fields: [
      { key: 'waist', label: 'Μέση', unit: 'cm', step: '0.1' },
      { key: 'hip', label: 'Ισχίο', unit: 'cm', step: '0.1' },
      { key: 'arm', label: 'Βραχίονας', unit: 'cm', step: '0.1' },
      { key: 'thigh', label: 'Μηρός', unit: 'cm', step: '0.1' },
      { key: 'calf', label: 'Γάμπα', unit: 'cm', step: '0.1' },
      { key: 'chest', label: 'Στήθος', unit: 'cm', step: '0.1' },
      { key: 'neck', label: 'Λαιμός', unit: 'cm', step: '0.1' },
    ],
  },
  {
    id: 'vitamins', title: 'Βιταμίνες',
    note: 'Καταγραφή εργαστηρίου — χωρίς αυτόματη ερμηνεία.',
    fields: [
      { key: 'vitD', label: '25-OH βιταμίνη D', unit: 'ng/mL', step: '0.1' },
      { key: 'b12', label: 'Βιταμίνη B12', unit: 'pg/mL', step: '1' },
      { key: 'folate', label: 'Φυλλικό οξύ', unit: 'ng/mL', step: '0.1' },
      { key: 'iron', label: 'Σίδηρος ορού', unit: 'μg/dL', step: '1' },
      { key: 'ferritin', label: 'Φερριτίνη', unit: 'ng/mL', step: '0.1' },
    ],
  },
  {
    id: 'blood', title: 'Γενική αίματος',
    note: 'Ενδεικτικά πεδία γενικής αίματος.',
    fields: [
      { key: 'hb', label: 'Αιμοσφαιρίνη (Hb)', unit: 'g/dL', step: '0.1' },
      { key: 'ht', label: 'Αιματοκρίτης (Ht)', unit: '%', step: '0.1' },
      { key: 'wbc', label: 'Λευκά αιμοσφαίρια', unit: '×10³/μL', step: '0.1' },
      { key: 'plt', label: 'Αιμοπετάλια', unit: '×10³/μL', step: '1' },
    ],
  },
  {
    id: 'biochem', title: 'Βιοχημικές',
    note: 'Γλυκόζη, λιπίδια, TSH — τιμές όπως στο παραπεμπτικό.',
    fields: [
      { key: 'glucose', label: 'Γλυκόζη νηστείας', unit: 'mg/dL', step: '1' },
      { key: 'chol', label: 'Ολική χοληστερόλη', unit: 'mg/dL', step: '1' },
      { key: 'hdl', label: 'HDL', unit: 'mg/dL', step: '1' },
      { key: 'ldl', label: 'LDL', unit: 'mg/dL', step: '1' },
      { key: 'tg', label: 'Τριγλυκερίδια', unit: 'mg/dL', step: '1' },
      { key: 'tsh', label: 'TSH', unit: 'μIU/mL', step: '0.01' },
    ],
  },
  {
    id: 'hormones', title: 'Ορμονολογικές',
    note: 'Συχνά ζητούμενα. Συμπληρώστε μόνο ό,τι υπάρχει στο αποτέλεσμα.',
    fields: [
      { key: 'insulin', label: 'Ινσουλίνη', unit: 'μIU/mL', step: '0.1' },
      { key: 'cortisol', label: 'Κορτιζόλη', unit: 'μg/dL', step: '0.1' },
      { key: 'testosterone', label: 'Τεστοστερόνη', unit: 'ng/dL', step: '0.1' },
      { key: 'estradiol', label: 'Οιστραδιόλη', unit: 'pg/mL', step: '0.1' },
      { key: 'progesterone', label: 'Προγεστερόνη', unit: 'ng/mL', step: '0.01' },
      { key: 'prolactin', label: 'Προλακτίνη', unit: 'ng/mL', step: '0.1' },
      { key: 'fsh', label: 'FSH', unit: 'mIU/mL', step: '0.1' },
      { key: 'lh', label: 'LH', unit: 'mIU/mL', step: '0.1' },
    ],
  },
];

export function emptyVisitBody() {
  const o = { notes: '' };
  for (const [k, keys] of Object.entries(VISIT_FIELDS)) {
    o[k] = Object.fromEntries(keys.map(f => [f, null]));
  }
  return o;
}

export function skinfoldSum(sf) {
  const vals = SKINFOLD_KEYS.map(k => sf?.[k]).filter(v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)));
  if (!vals.length) return null;
  return r1(vals.reduce((s, v) => s + Number(v), 0));
}

export function whr(circ) {
  const w = Number(circ?.waist), h = Number(circ?.hip);
  if (!(w > 0) || !(h > 0)) return null;
  return r1(w / h * 100) / 100;
}

export function applyDerived(visit) {
  const a = visit.anthro || {};
  if (a.weightKg && a.heightCm) a.bmi = r1(bmiCalc(a.weightKg, a.heightCm));
  else a.bmi = null;
  return visit;
}

export function sheetSections(visit) {
  const v = visit || {};
  const a = v.anthro || {};
  const c = v.circ || {};
  const sf = v.skinfolds || {};
  const num = (value, unit) => ({ value, unit });
  const fieldMap = (sectionId) => {
    const sec = MEASURE_FORM.find(s => s.id === sectionId);
    const bag = v[sectionId] || {};
    return sec.fields.map(f => ({ label: f.label, ...num(bag[f.key], f.unit) }));
  };
  return [
    {
      title: 'Σωματομετρικές',
      rows: [
        { label: 'Βάρος', ...num(a.weightKg, 'kg') },
        { label: 'Ύψος', ...num(a.heightCm, 'cm') },
        { label: 'BMI', ...num(a.bmi, 'kg/m²') },
        { label: 'Σωματικό λίπος', ...num(a.bodyFatPct, '%') },
        { label: 'Μυϊκή μάζα', ...num(a.muscleKg, 'kg') },
        { label: 'Υγρά σώματος', ...num(a.hydrationPct, '%') },
        { label: 'Μέση', ...num(c.waist, 'cm') },
        { label: 'Ισχίο', ...num(c.hip, 'cm') },
        { label: 'Λόγος μέσης/ισχίου', ...num(whr(c), '') },
        { label: 'BMR', ...num(a.bmrKcal, 'kcal') },
      ],
    },
    {
      title: 'Δερματοπτυχές',
      rows: [
        ...fieldMap('skinfolds'),
        { label: 'Άθροισμα', ...num(skinfoldSum(sf), 'mm') },
      ],
    },
    { title: 'Μεζούρες', rows: fieldMap('circ') },
    { title: 'Βιταμίνες', rows: fieldMap('vitamins') },
    { title: 'Γενική αίματος', rows: fieldMap('blood') },
    { title: 'Βιοχημικές', rows: fieldMap('biochem') },
    { title: 'Ορμονολογικές', rows: fieldMap('hormones') },
  ];
}
