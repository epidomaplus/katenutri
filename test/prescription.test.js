import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gramsFromPercent, percentFromGrams, gramsFromPercents, formatMacro,
  applyPrescriptionEdit, describePrescription, canonicalizePrescription, emptyMacroTargets,
} from '../shared/prescription.js';
import { emptyPlan } from '../shared/nutrition.js';
import { planData } from '../lib/validate.js';

test('1800 kcal at 30/40/30 is 135 g protein, 180 g carbs, 60 g fat', () => {
  const g = gramsFromPercents(1800, { protein: 30, carbs: 40, fat: 30 });
  assert.equal(g.protein, 135);
  assert.equal(g.carbs, 180);
  assert.equal(g.fat, 60);
  assert.equal(formatMacro(g.protein), '135');
  assert.equal(formatMacro(g.carbs), '180');
  assert.equal(formatMacro(g.fat), '60');
});

test('grams convert back to the same percentages', () => {
  assert.equal(percentFromGrams(1800, 135, 'protein'), 30);
  assert.equal(percentFromGrams(1800, 180, 'carbs'), 40);
  assert.equal(percentFromGrams(1800, 60, 'fat'), 30);
});

test('changing kcal keeps the split and recomputes grams', () => {
  const data = emptyPlan();
  applyPrescriptionEdit(data, 'kcal', '1800');
  applyPrescriptionEdit(data, 'proteinPct', '30');
  applyPrescriptionEdit(data, 'carbsPct', '40');
  applyPrescriptionEdit(data, 'fatPct', '30');
  assert.equal(data.macroTargets.protein, '135');
  assert.equal(data.macroTargets.carbs, '180');
  assert.equal(data.macroTargets.fat, '60');

  applyPrescriptionEdit(data, 'kcal', '2000');
  assert.equal(data.macroTargets.proteinPct, '30');
  assert.equal(data.macroTargets.carbsPct, '40');
  assert.equal(data.macroTargets.fatPct, '30');
  assert.equal(data.macroTargets.protein, '150');
  assert.equal(data.macroTargets.carbs, '200');
  assert.equal(data.macroTargets.fat, '66.7');
});

test('editing grams updates the percentage', () => {
  const data = emptyPlan();
  applyPrescriptionEdit(data, 'kcal', '1800');
  applyPrescriptionEdit(data, 'protein', '135');
  applyPrescriptionEdit(data, 'carbs', '180');
  applyPrescriptionEdit(data, 'fat', '60');
  assert.equal(data.macroTargets.proteinPct, '30');
  assert.equal(data.macroTargets.carbsPct, '40');
  assert.equal(data.macroTargets.fatPct, '30');
});

test('percentages must sum to about 100', () => {
  const bad = emptyPlan();
  bad.targetKcal = '1800';
  bad.macroTargets = { ...emptyMacroTargets(), proteinPct: '30', carbsPct: '40', fatPct: '20' };
  const rejected = describePrescription(bad);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some(e => e.includes('100%')));

  const good = emptyPlan();
  good.targetKcal = '1800';
  good.macroTargets = { ...emptyMacroTargets(), proteinPct: '30', carbsPct: '40', fatPct: '30' };
  const accepted = describePrescription(good);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.complete, true);
  assert.equal(accepted.sum, 100);

  const rounded = emptyPlan();
  rounded.targetKcal = '1800';
  rounded.macroTargets = { ...emptyMacroTargets(), proteinPct: '33.3', carbsPct: '33.3', fatPct: '33.4' };
  assert.equal(describePrescription(rounded).ok, true);

  const near = emptyPlan();
  near.targetKcal = '1800';
  near.macroTargets = { ...emptyMacroTargets(), proteinPct: '33.3', carbsPct: '33.3', fatPct: '33.3' };
  assert.equal(describePrescription(near).ok, true);
});

test('kcal and grams must be sensible', () => {
  const low = emptyPlan();
  low.targetKcal = '0';
  assert.equal(describePrescription(low).ok, false);
  const high = emptyPlan();
  high.targetKcal = '20000';
  assert.equal(describePrescription(high).ok, false);
  const grams = emptyPlan();
  grams.targetKcal = '1800';
  grams.macroTargets = { ...emptyMacroTargets(), protein: '-5' };
  assert.equal(describePrescription(grams).ok, false);
  const empty = describePrescription(emptyPlan());
  assert.equal(empty.ok, true);
  assert.equal(empty.empty, true);
});

test('planData stores the example prescription as grams', () => {
  const saved = planData({
    targetKcal: '1800',
    macroTargets: { proteinPct: '30', carbsPct: '40', fatPct: '30' },
  });
  assert.equal(saved.targetKcal, '1800');
  assert.equal(saved.macroTargets.proteinPct, '30');
  assert.equal(saved.macroTargets.carbsPct, '40');
  assert.equal(saved.macroTargets.fatPct, '30');
  assert.equal(saved.macroTargets.protein, '135');
  assert.equal(saved.macroTargets.carbs, '180');
  assert.equal(saved.macroTargets.fat, '60');
});

test('legacy gram targets gain percentages without inventing a 100% split', () => {
  const data = emptyPlan();
  data.targetKcal = '1700';
  data.macroTargets.protein = '105';
  data.macroTargets.carbs = '170';
  data.macroTargets.fat = '57';
  canonicalizePrescription(data);
  assert.equal(data.macroTargets.proteinPct, '24.7');
  assert.equal(data.macroTargets.carbsPct, '40');
  assert.equal(data.macroTargets.fatPct, '30.2');
  assert.equal(describePrescription(data).complete, false);
});
