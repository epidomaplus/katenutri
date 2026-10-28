import { fmt } from '/shared/text.js';
import { GROUPS, macroSplit } from '/shared/nutrition.js';

export function exBits(ex) {
  return GROUPS.filter(g => g.id !== 'free' && (ex?.groups?.[g.id] || 0) >= 0.05)
    .map(g => ({ ...g, value: ex.groups[g.id] }));
}
export function exText(ex) {
  if (!ex) return '—';
  const bits = exBits(ex).map(b => `${b.short} ${fmt(b.value, 1)}`);
  bits.push(`Υδατ. ${fmt(ex.carb || 0, 1)}`);
  return bits.join(' · ');
}
export function macroBar(nut) {
  const s = macroSplit(nut);
  return `<div class="bar" aria-hidden="true"><i style="width:${s.pp}%"></i><i style="width:${s.cp}%"></i><i style="width:${s.fp}%"></i></div>`;
}
export function pct(n) { return fmt(n, 0) + '%'; }
