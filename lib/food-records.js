import { FOODS, byId as foodById } from '../foods.js';
import { db, save, uid } from './store.js';
import { foodInput } from './validate.js';
import { exchangeGramsFor } from '../shared/nutrition.js';
import { foodFromCatalogProduct } from '../shared/products.js';

const EDITABLE = ['name', 'brand', 'barcode', 'category', 'group', 'kcal', 'protein', 'carbs', 'sugars', 'fat', 'saturated', 'fiber', 'sodium', 'calcium', 'iron', 'vitC', 'vitD', 'portionGrams', 'portionLabel', 'vegan', 'fasting', 'keto'];

export function shapeFood(food) {
  return {
    ...food,
    brand: food.brand || '',
    barcode: food.barcode || '',
    sugars: food.sugars == null ? null : food.sugars,
    saturated: food.saturated == null ? null : food.saturated,
  };
}

function applyOverride(food, ov) {
  const base = shapeFood(food);
  if (!ov) return base;
  const merged = { ...base };
  for (const k of EDITABLE) if (ov[k] !== undefined) merged[k] = ov[k];
  if (ov.group && ov.group !== base.group) {
    merged.secondaryGroup = '';
    merged.secondaryPerExchange = 0;
  }
  merged.exchangeGrams = exchangeGramsFor(merged.group, merged);
  merged.id = food.id;
  merged.custom = !!food.custom;
  merged.overridden = true;
  return merged;
}

export function listFoodsFor(userId) {
  const overrides = new Map(db.foodOverrides.filter(o => o.ownerId === userId).map(o => [o.foodId, o]));
  const builtins = FOODS.map(f => applyOverride(f, overrides.get(f.id)));
  const custom = db.customFoods.filter(f => f.ownerId === userId).map(shapeFood);
  return builtins.concat(custom);
}

export function resolveFood(userId, foodId) {
  const custom = db.customFoods.find(f => f.id === foodId && f.ownerId === userId);
  if (custom) return shapeFood(custom);
  const base = foodById.get(foodId);
  if (!base) return null;
  const ov = db.foodOverrides.find(o => o.ownerId === userId && o.foodId === foodId);
  return applyOverride(base, ov);
}

function withExchange(value) {
  let group = value.group;
  let exchangeGrams = exchangeGramsFor(group, value);
  if (group !== 'free' && !(exchangeGrams > 0)) {
    group = 'free';
    exchangeGrams = 0;
  }
  return { ...value, group, exchangeGrams };
}

export function createCustomFood(userId, body) {
  const parsed = foodInput(body);
  if (parsed.error) return parsed;
  const value = withExchange(parsed.value);
  const f = {
    ...value,
    id: 'c_' + uid(),
    ownerId: userId,
    custom: true,
    secondaryGroup: '',
    secondaryPerExchange: 0,
    exchangeNote: '',
    updatedAt: new Date().toISOString(),
  };
  db.customFoods.push(f);
  save();
  return { food: f };
}

export function updateFood(userId, foodId, body) {
  const parsed = foodInput(body);
  if (parsed.error) return parsed;
  const value = withExchange(parsed.value);
  const custom = db.customFoods.find(f => f.id === foodId && f.ownerId === userId);
  if (custom) {
    Object.assign(custom, value, { id: custom.id, ownerId: userId, custom: true, updatedAt: new Date().toISOString() });
    save();
    return { food: shapeFood(custom) };
  }
  const base = foodById.get(foodId);
  if (!base) return { error: 'Το τρόφιμο δεν βρέθηκε.' };
  const id = userId + ':' + foodId;
  let ov = db.foodOverrides.find(o => o.id === id);
  const next = { id, ownerId: userId, foodId, ...value, updatedAt: new Date().toISOString() };
  if (ov) Object.assign(ov, next);
  else db.foodOverrides.push(next);
  save();
  return { food: applyOverride(base, next) };
}

export function deleteCustomFood(userId, foodId) {
  const i = db.customFoods.findIndex(f => f.id === foodId && f.ownerId === userId);
  if (i < 0) return { error: 'Δεν βρέθηκε δικό σας τρόφιμο.' };
  db.customFoods.splice(i, 1);
  save();
  return { ok: true };
}

export function clearOverride(userId, foodId) {
  const i = db.foodOverrides.findIndex(o => o.ownerId === userId && o.foodId === foodId);
  if (i < 0) return { error: 'Δεν υπάρχει αλλαγή σε αυτό το τρόφιμο.' };
  db.foodOverrides.splice(i, 1);
  save();
  return { ok: true };
}

export function adoptCatalogProduct(userId, product) {
  const barcode = product.barcode || '';
  if (barcode) {
    const existing = db.customFoods.find(f => f.ownerId === userId && f.barcode === barcode);
    if (existing) return { food: shapeFood(existing), existed: true };
  }
  const parsed = foodInput(foodFromCatalogProduct(product));
  if (parsed.error) return parsed;
  const value = withExchange(parsed.value);
  const f = {
    ...value,
    id: 'c_' + uid(),
    ownerId: userId,
    custom: true,
    catalogId: product.id || '',
    secondaryGroup: '',
    secondaryPerExchange: 0,
    exchangeNote: '',
    updatedAt: new Date().toISOString(),
  };
  db.customFoods.push(f);
  save();
  return { food: f, existed: false };
}
