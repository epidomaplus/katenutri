export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ς/g, 'σ');
}

export function r0(n) { return Math.round(Number(n) || 0); }
export function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
export function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export function fmt(n, digits = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('el-GR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function gramsLabel(g) {
  const n = Number(g) || 0;
  if (n >= 1000) return fmt(n / 1000, 2) + ' kg';
  return fmt(Math.round(n), 0) + ' g';
}

export function euro(n) {
  const x = Number(n) || 0;
  return x.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
}

export function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function localStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function elDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('el-GR');
}

export function elDateTime(stamp) {
  if (!stamp) return '';
  const [date, time] = String(stamp).split('T');
  return `${elDate(date)}${time ? ' · ' + time.slice(0, 5) : ''}`;
}
