import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itemFromFood, itemNut, normalizePlan, portionPhrase, resolvePortion, resolveMissingGrams,
  applyPortionEdit, scalePlanData, sumNut, emptyPlan,
} from '../shared/nutrition.js';
import { foodInput, planData } from '../lib/validate.js';

const egg = { id: 'egg', name: 'Αυγό', category: 'Αυγά', kcal: 155, protein: 13, carbs: 1.1, fat: 11, gramsPerPiece: 60, gramsPerCup: 0 };

test('existing plan lines stay in grams with the same amount', () => {
  const saved = planData({
    days: [{
      note: 'ημέρα',
      meals: [[{ name: 'Μήλο', grams: 150, kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, note: 'κόκκινο' }]],
      mealNotes: ['χωρίς ζάχαρη'],
    }],
  });
  const it = saved.days[0].meals[0][0];
  assert.equal(it.unit, 'g');
  assert.equal(it.quantity, 150);
  assert.equal(it.grams, 150);
  assert.equal(it.kcal, 52);
  assert.equal(it.note, 'κόκκινο');
  assert.equal(saved.days[0].note, 'ημέρα');
  assert.equal(saved.days[0].mealNotes[0], 'χωρίς ζάχαρη');
  assert.equal(saved.days[0].mealNotes.length, saved.mealNames.length);
  assert.equal(saved.days[1].mealNotes.length, saved.mealNames.length);
  assert.equal(sumNut([it]).kcal, 52 * 1.5);
});

test('pieces and cups compute grams from the food, unless typed grams override', () => {
  const auto = resolvePortion({ unit: 'piece', quantity: 2, gramsText: '', food: egg });
  assert.equal(auto.ok, true);
  assert.equal(auto.grams, 120);
  assert.equal(auto.gramsManual, false);
  assert.equal(auto.gramsPerUnit, 60);

  const manual = resolvePortion({ unit: 'piece', quantity: 2, gramsText: '90', food: egg });
  assert.equal(manual.grams, 90);
  assert.equal(manual.gramsManual, true);

  const cup = resolvePortion({ unit: 'cup', quantity: '1,5', gramsText: '', food: { gramsPerCup: 240 } });
  assert.equal(cup.grams, 360);

  const missing = resolvePortion({ unit: 'piece', quantity: 2, gramsText: '', food: { name: 'Άγνωστο' } });
  assert.equal(missing.needsGrams, true);
  assert.equal(resolvePortion({ unit: 'piece', quantity: '', gramsText: '', food: egg }).ok, false);
});

test('a missing per-unit value can be supplied as total grams or saved on the food', () => {
  const both = resolveMissingGrams({ unit: 'piece', quantity: 2, totalGrams: '90', perUnit: '50' });
  assert.equal(both.grams, 90);
  assert.equal(both.gramsManual, true);
  assert.equal(both.savePerUnit, 50);

  const per = resolveMissingGrams({ unit: 'cup', quantity: 1, totalGrams: '', perUnit: '240' });
  assert.equal(per.grams, 240);
  assert.equal(per.gramsManual, false);
  assert.equal(per.savePerUnit, 240);

  const none = resolveMissingGrams({ unit: 'piece', quantity: 2, totalGrams: '', perUnit: '' });
  assert.equal(none.ok, false);
});

test('nutrition always follows grams, and the line reads with its unit', () => {
  const line = itemFromFood(egg, 120, '', { unit: 'piece', quantity: 2, grams: 120, gramsManual: false, gramsPerUnit: 60 });
  assert.equal(line.unit, 'piece');
  assert.equal(line.quantity, 2);
  assert.equal(itemNut(line).kcal, 155 * 1.2);
  assert.equal(portionPhrase(line), '2 τεμάχια (120 g)');
  assert.equal(portionPhrase({ unit: 'cup', quantity: 1, grams: 240 }), '1 φλιτζάνι (240 g)');
  assert.equal(portionPhrase(line, { showGrams: false }), '2 τεμάχια');
  assert.equal(portionPhrase({ grams: 40 }), '40 g');

  const legacy = itemFromFood(egg, 60);
  assert.equal(legacy.unit, 'g');
  assert.equal(legacy.quantity, 60);
  assert.equal(itemNut(legacy).kcal, 155 * 0.6);
});

test('editing quantity keeps the gram rate, and a typed gram amount replaces it', () => {
  const it = itemFromFood(egg, 120, '', { unit: 'piece', quantity: 2, grams: 120, gramsPerUnit: 60 });
  applyPortionEdit(it, { quantity: 3 });
  assert.equal(it.quantity, 3);
  assert.equal(it.grams, 180);
  assert.equal(itemNut(it).kcal, 155 * 1.8);

  applyPortionEdit(it, { grams: 100 });
  assert.equal(it.gramsManual, true);
  assert.equal(it.grams, 100);
  applyPortionEdit(it, { quantity: 2 });
  assert.equal(it.grams, 66.7);

  const back = applyPortionEdit(it, { unit: 'g' });
  assert.equal(back.unit, 'g');
  assert.equal(back.quantity, back.grams);
  const refused = applyPortionEdit({ ...it, unit: 'piece', quantity: 2, grams: 100, gramsPerUnit: 50 }, { grams: '' });
  assert.equal(refused.error.includes('γραμμάρια'), true);
});

test('scaling changes grams and the piece count together', () => {
  const plan = emptyPlan();
  plan.days[0].meals[0].push(itemFromFood(egg, 120, '', { unit: 'piece', quantity: 2, grams: 120, gramsPerUnit: 60 }));
  plan.days[0].meals[0].push(itemFromFood(egg, 40));
  const scaled = scalePlanData(plan, sumNut(plan.days[0].meals[0]).kcal * 2);
  const piece = scaled.days[0].meals[0][0];
  const grams = scaled.days[0].meals[0][1];
  assert.equal(piece.unit, 'piece');
  assert.equal(piece.grams, 240);
  assert.equal(piece.quantity, 4);
  assert.equal(grams.unit, 'g');
  assert.equal(grams.grams, 80);
  assert.equal(grams.quantity, 80);
});

test('meal notes survive normalisation and food fields are optional', () => {
  const plan = normalizePlan({
    mealNames: ['Πρωινό'],
    days: [{ mealNotes: ['  με λεμόνι\nκαι ρίγανη  '], meals: [[]] }],
  });
  assert.equal(plan.days[0].mealNotes[0], 'με λεμόνι\nκαι ρίγανη');
  assert.equal(plan.mealNames.length, 1);

  const food = foodInput({
    name: 'Αυγό', group: 'meat_medium', kcal: 155, protein: 13, carbs: 1, fat: 11,
    gramsPerPiece: '60', gramsPerCup: '',
  });
  assert.equal(food.value.gramsPerPiece, 60);
  assert.equal(food.value.gramsPerCup, null);
  assert.match(foodInput({
    name: 'Αυγό', group: 'meat_medium', kcal: 155, protein: 13, carbs: 1, fat: 11, gramsPerPiece: -5,
  }).error, /τεμάχιο/);
});
