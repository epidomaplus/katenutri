export const state = { me: null, cfg: { appName: 'KateNutri', allowSignup: true } };
let foodCache = null;

export async function api(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new Error('Δεν υπάρχει σύνδεση με τον διακομιστή.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Σφάλμα ' + res.status));
  return data;
}

export async function loadFoods(force = false) {
  if (!foodCache || force) foodCache = await api('/api/foods');
  return foodCache;
}
export function invalidateFoods() { foodCache = null; }
