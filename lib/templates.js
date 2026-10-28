import { byName } from '../foods.js';
import { DAYS, itemFromFood, dayNut, normalizePlan } from '../shared/nutrition.js';

function food(name, grams, note = '') {
  const f = byName.get(name);
  if (!f) throw new Error('Λείπει τρόφιμο προτύπου: ' + name);
  return itemFromFood(f, grams, note);
}

function day(meals) {
  return { note: '', meals };
}

function week(patterns) {
  return DAYS.map((_, i) => structuredClone(patterns[i % patterns.length]));
}

const medA = day([
  [food('Βρώμη (νιφάδες)', 40), food('Γάλα ημιαποβουτυρωμένο 1.5%', 200), food('Μπανάνα', 80)],
  [food('Μήλο', 150), food('Αμύγδαλα', 15)],
  [food('Στήθος κοτόπουλο (ψητό)', 120), food('Ρύζι καστανό (βρασμένο)', 150), food('Ντομάτα', 100), food('Αγγούρι', 80), food('Ελαιόλαδο', 10)],
  [food('Γιαούρτι στραγγιστό 2%', 200), food('Φράουλες', 100)],
  [food('Τσιπούρα (ψητή)', 150), food('Χόρτα βραστά', 180), food('Ελαιόλαδο', 8), food('Ψωμί ολικής άλεσης', 30)],
]);
const medB = day([
  [food('Γιαούρτι στραγγιστό 2%', 200), food('Μέλι', 10), food('Καρύδια', 15), food('Ψωμί ολικής άλεσης', 30)],
  [food('Ροδάκινο', 150)],
  [food('Φακές (βρασμένες)', 200), food('Ψωμί χωριάτικο', 40), food('Ελαιόλαδο', 10), food('Χωριάτικη σαλάτα (χωρίς φέτα)', 180)],
  [food('Πορτοκάλι', 150), food('Αμύγδαλα', 10)],
  [food('Λαβράκι (ψητό)', 150), food('Πατάτα (βραστή)', 140), food('Μπρόκολο (βραστό)', 150), food('Ελαιόλαδο', 10)],
]);
const medC = day([
  [food('Μούσλι χωρίς ζάχαρη', 45), food('Γάλα ημιαποβουτυρωμένο 1.5%', 200), food('Μήλο', 100)],
  [food('Κεφίρ', 200)],
  [food('Μοσχάρι άπαχο (ψητό)', 120), food('Πλιγούρι (βρασμένο)', 180), food('Μαρούλι', 60), food('Ντομάτα', 80), food('Ελαιόλαδο', 10), food('Φέτα', 20)],
  [food('Γιαούρτι στραγγιστό 0%', 150), food('Καρύδια', 10)],
  [food('Αυγό ολόκληρο', 110, '2 αυγά'), food('Χόρτα βραστά', 200), food('Ψωμί ολικής άλεσης', 40), food('Ελαιόλαδο', 10)],
]);
const fast = day([
  [food('Ψωμί ολικής άλεσης', 50), food('Ταχίνι', 15), food('Μαρμελάδα', 10)],
  [food('Μπανάνα', 100), food('Πορτοκάλι', 120)],
  [food('Φακές (βρασμένες)', 220), food('Ελαιόλαδο', 10), food('Ψωμί χωριάτικο', 30), food('Ντομάτα', 80)],
  [food('Χούμους', 40), food('Καρότο', 80), food('Παξιμάδι κριθαρένιο', 20)],
  [food('Φασολάκια λαδερά', 250), food('Πατάτα (βραστή)', 120), food('Ελιές Καλαμών', 15)],
]);
const hiPro = day([
  [food('Αυγό ολόκληρο', 110, '2 αυγά'), food('Ασπράδι αυγού', 66), food('Ψωμί ολικής άλεσης', 30), food('Γιαούρτι στραγγιστό 0%', 150)],
  [food('Γαλοπούλα φιλέτο αλλαντικό', 40), food('Φρυγανιά ολικής', 20)],
  [food('Στήθος κοτόπουλο (ψητό)', 160), food('Ρύζι καστανό (βρασμένο)', 120), food('Μπρόκολο (βραστό)', 150), food('Ελαιόλαδο', 8)],
  [food('Κότατζ (cottage)', 120), food('Φράουλες', 80)],
  [food('Σολομός (ψητός)', 150), food('Κολοκυθάκια (βραστά)', 200), food('Ελαιόλαδο', 8), food('Ψωμί ολικής άλεσης', 20)],
]);

const MEAL_NAMES = ['Πρωινό', 'Ενδιάμεσο', 'Μεσημεριανό', 'Απογευματινό', 'Βραδινό'];

function planTemplate(id, name, description, patterns) {
  const days = week(patterns).map((d, i) => ({ name: DAYS[i], note: '', meals: d.meals }));
  const data = normalizePlan({ mealNames: MEAL_NAMES.slice(), days, notes: '', viewMode: 'both' });
  const kcals = data.days.map(d => dayNut(d).kcal);
  const approxKcal = Math.round(kcals.reduce((a, b) => a + b, 0) / kcals.length);
  return { id, builtin: true, kind: 'plan', name, description, approxKcal, data };
}

function mealTemplate(id, name, description, items) {
  return { id, builtin: true, kind: 'meal', name, description, data: { items } };
}

export const BUILTIN_TEMPLATES = [
  planTemplate('builtin-med', 'Μεσογειακή εβδομάδα', 'Τρεις ημέρες που εναλλάσσονται: ψάρι, όσπρια, κρέας, γαλακτοκομικά και ελαιόλαδο.', [medA, medB, medC]),
  planTemplate('builtin-fast', 'Νηστίσιμη ημέρα (φυτική)', 'Χωρίς κρέας, ψάρι, αυγό και γαλακτοκομικά. Η ίδια ημέρα και τις επτά — αλλάξτε την κατά περίπτωση.', [fast]),
  planTemplate('builtin-protein', 'Υψηλότερη πρωτεΐνη', 'Περισσότερο κρέας, ψάρι, αυγό και γαλακτοκομικό. Κλιμακώστε προς τον στόχο kcal.', [hiPro]),
  mealTemplate('builtin-meal-oat', 'Πρωινό βρώμης', 'Βρώμη, γάλα και φρούτο.', [food('Βρώμη (νιφάδες)', 40), food('Γάλα ημιαποβουτυρωμένο 1.5%', 200), food('Μπανάνα', 100)]),
  mealTemplate('builtin-meal-chicken', 'Μεσημεριανό κοτόπουλο & ρύζι', 'Στήθος, καστανό ρύζι, σαλάτα, ελαιόλαδο.', [food('Στήθος κοτόπουλο (ψητό)', 130), food('Ρύζι καστανό (βρασμένο)', 150), food('Ντομάτα', 80), food('Αγγούρι', 60), food('Ελαιόλαδο', 10)]),
  mealTemplate('builtin-meal-lentil', 'Νηστίσιμο όσπριο', 'Φακές, ψωμί, ελαιόλαδο.', [food('Φακές (βρασμένες)', 220), food('Ψωμί ολικής άλεσης', 30), food('Ελαιόλαδο', 10)]),
  mealTemplate('builtin-meal-snack', 'Σνακ φρούτο & ξηροί καρποί', 'Φρούτο με μικρή χούφτα αμύγδαλα.', [food('Μήλο', 150), food('Αμύγδαλα', 15)]),
];

export function templateById(id, userTemplates = []) {
  return BUILTIN_TEMPLATES.find(t => t.id === id) || userTemplates.find(t => t.id === id) || null;
}
