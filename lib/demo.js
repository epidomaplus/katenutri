import { db, save, uid } from './store.js';
import { hashPw } from './auth.js';
import { byName } from '../foods.js';
import { itemFromFood } from '../shared/nutrition.js';
import { templateById } from './templates.js';
import { scalePlanData } from '../shared/nutrition.js';

function at(daysAgo, hh = '10', mm = '30') {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function seedDemo() {
  if (db.users.some(u => u.role !== 'client')) return null;
  const email = (process.env.DEMO_EMAIL || 'demo@example.com').toLowerCase();
  const password = process.env.DEMO_PASSWORD || 'demo-pass-1';
  const clientEmail = (process.env.DEMO_CLIENT_EMAIL || 'client@example.com').toLowerCase();
  const now = new Date().toISOString();
  const diet = {
    id: uid(), email, name: 'Ελένη Δημητρίου', role: 'dietitian',
    passwordHash: hashPw(password), practiceName: 'Γραφείο KateNutri',
    phone: '210 000 0000', logoUrl: '', printFooter: 'Εκπαιδευτικό πρόγραμμα γευμάτων. Οι τιμές είναι προσεγγιστικές.',
    createdAt: now,
  };
  const maria = {
    id: uid(), ownerId: diet.id, name: 'Μαρία Παπαδοπούλου', email: clientEmail, phone: '690 000 0001',
    sex: 'female', dob: '1992-04-12', ageYears: null, heightCm: 165,
    tags: ['απώλεια βάρους', 'μεσογειακή'], goalNotes: 'Ήπια μείωση βάρους, σταθερή ενέργεια στη δουλειά.',
    allergies: 'Φιστίκια', preferences: { vegan: false, fasting: false, keto: false, carbLoading: false },
    sessionPrice: 40, createdAt: now, updatedAt: now,
    portal: { code: 'DEMO4MAR', token: 'demo-maria-token', createdAt: now },
    energy: {
      equation: 'mifflin', sexUsed: 'female', activity: '1.375', weightKg: 74.9, heightCm: 165, age: 34,
      bmr: 1460, tdee: 2010, kcalTarget: 1700, proteinPerKg: 1.4, proteinG: 105, carbsG: 170, fatG: 57,
      updatedAt: now,
    },
  };
  const giorgos = {
    id: uid(), ownerId: diet.id, name: 'Γιώργος Νικολάου', email: 'giorgos@example.com', phone: '690 000 0002',
    sex: 'male', dob: '1985-11-02', ageYears: null, heightCm: 178,
    tags: ['μυϊκή μάζα', 'keto'], goalNotes: 'Διατήρηση μυϊκής μάζας σε ήπιο έλλειμμα.',
    allergies: '', preferences: { vegan: false, fasting: false, keto: true, carbLoading: false },
    sessionPrice: 40, createdAt: now, updatedAt: now, portal: null, energy: null,
  };
  const weights = [78.4, 76.6, 75.8, 74.9];
  const fats = [32.4, 31.2, 30.6, 29.8];
  const muscle = [25.8, 26.1, 26.3, 26.5];
  const visits = weights.map((w, i) => ({
    id: uid(), ownerId: diet.id, clientId: maria.id, date: at(70 - i * 18),
    notes: i === 3 ? 'Καλή προσήλωση. Συζητήσαμε βραδινό και νερό.' : 'Τακτική μέτρηση.',
    anthro: { weightKg: w, heightCm: 165, bmi: Math.round(w / (1.65 * 1.65) * 10) / 10, bodyFatPct: fats[i], muscleKg: muscle[i], hydrationPct: 52, bmrKcal: 1460 },
    skinfolds: { triceps: 18 - i, biceps: 10, subscapular: 16 - i, suprailiac: 14, thigh: 28, calf: 12 },
    circ: { waist: 84 - i, hip: 104, arm: 29, thigh: 58, calf: 36, chest: 92, neck: 33 },
    vitamins: { vitD: i === 3 ? 28 : null, b12: i === 3 ? 420 : null, folate: null, iron: null, ferritin: i === 3 ? 38 : null },
    blood: { hb: i === 3 ? 13.2 : null, ht: null, wbc: null, plt: null },
    biochem: { glucose: i === 3 ? 92 : null, chol: null, hdl: null, ldl: null, tg: null, tsh: i === 3 ? 1.8 : null },
    hormones: { insulin: null, cortisol: null, testosterone: null, estradiol: null, progesterone: null, prolactin: null, fsh: null, lh: null },
    createdAt: now, updatedAt: now,
  }));
  const tpl = templateById('builtin-med');
  const data = scalePlanData(tpl.data, 1700);
  data.notes = 'Νερό 6–8 ποτήρια. Φιστίκια: όχι. Το βραδινό μπορεί να μετακινηθεί μία ώρα νωρίτερα.';
  data.macroTargets = { protein: '105', carbs: '170', fat: '57' };
  data.exchangeTargets = { starch: '6', fruit: '3', milk: '2', vegetable: '4', meat_lean: '6', meat_medium: '1', meat_fat: '', fat: '4', carb: '11' };
  data.viewMode = 'both';
  const plan = {
    id: uid(), ownerId: diet.id, clientId: maria.id, clientName: maria.name,
    title: 'Εβδομάδα 1 · 1700 kcal', visibleToClient: true,
    data, createdAt: now, updatedAt: now,
  };
  const yogurt = byName.get('Γιαούρτι στραγγιστό 2%');
  const honey = byName.get('Μέλι');
  const walnuts = byName.get('Καρύδια');
  const recipe = {
    id: uid(), ownerId: diet.id, name: 'Γιαούρτι με μέλι και καρύδια', servings: 1,
    notes: 'Πρωινό ή απογευματινό. Το μέλι μετρά στους υδατάνθρακες.',
    instructions: 'Απλώστε το μέλι και τα καρύδια πάνω στο γιαούρτι.',
    ingredients: [itemFromFood(yogurt, 200), itemFromFood(honey, 10), itemFromFood(walnuts, 15)],
    createdAt: now, updatedAt: now,
  };
  const appt = (start, status, client, notes) => ({
    id: uid(), ownerId: diet.id, clientId: client.id, clientName: client.name,
    start, durationMin: 45, cost: client.sessionPrice, status, notes, createdAt: now,
  });
  const appointments = [
    appt(`${at(0)}T11:00`, 'scheduled', maria, 'Ζύγισμα και ανανέωση πλάνου'),
    appt(`${at(0)}T13:00`, 'scheduled', giorgos, 'Πρώτη συνεδρία'),
    appt(`${at(7)}T11:00`, 'done', maria, 'Ολοκληρώθηκε'),
    appt(`${at(2)}T18:00`, 'cancelled', maria, 'Ακύρωση από την πελάτισσα'),
  ];
  const todos = [
    { id: uid(), ownerId: diet.id, title: 'Να στείλω το πλάνο στη Μαρία', due: at(0), done: false, notes: '', createdAt: now },
    { id: uid(), ownerId: diet.id, title: 'Παραγγελία αναλωσίμων γραφείου', due: at(-5), done: false, notes: '', createdAt: now },
    { id: uid(), ownerId: diet.id, title: 'Κλείσιμο λογιστικών Μαρτίου', due: at(20), done: true, notes: '', createdAt: now },
  ];
  const clientUser = {
    id: uid(), email: clientEmail, name: 'Μαρία Παπαδοπούλου', role: 'client',
    passwordHash: hashPw(password), clientId: maria.id, dietitianId: diet.id, createdAt: now,
  };
  const diary = {
    id: uid(), ownerId: diet.id, clientId: maria.id, date: at(1),
    mealsText: 'Πρωινό: βρώμη με γάλα και μπανάνα.\nΜεσημέρι: κοτόπουλο, ρύζι και σαλάτα.\nΒράδυ: τσιπούρα και χόρτα. Ένα κουλουράκι εκτός πλάνου.',
    waterGlasses: 6, updatedAt: now,
  };
  const messages = [
    { id: uid(), ownerId: diet.id, clientId: maria.id, authorRole: 'client', authorName: maria.name, text: 'Καλησπέρα, το βράδυ πείνασα και έφαγα ένα κουλουράκι. Να το κρατήσω υπόψη;', createdAt: now },
    { id: uid(), ownerId: diet.id, clientId: maria.id, authorRole: 'dietitian', authorName: diet.name, text: 'Κανένα πρόβλημα για μία φορά. Αύριο μείνετε στο πλάνο και κρατήστε το νερό.', createdAt: now },
  ];
  db.users.push(diet, clientUser);
  db.clients.push(maria, giorgos);
  db.visits.push(...visits);
  db.plans.push(plan);
  db.recipes.push(recipe);
  db.appointments.push(...appointments);
  db.todos.push(...todos);
  db.diary.push(diary);
  db.messages.push(...messages);
  save();
  return { email, password, clientEmail };
}
