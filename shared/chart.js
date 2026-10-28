import { esc, fmt } from './text.js';

export function lineChart(points, { color = '#B8960B', unit = '', title = '' } = {}) {
  const clean = (points || []).filter(p => Number.isFinite(Number(p.value)));
  if (clean.length < 2) {
    return `<p class="muted chart-empty">${esc(title)}: χρειάζονται τουλάχιστον δύο τιμές για γράφημα.</p>`;
  }
  const w = 640, h = 210, padL = 46, padR = 12, padT = 16, padB = 32;
  const ys = clean.map(p => Number(p.value));
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min || 1;
  const xOf = i => padL + (clean.length === 1 ? 0 : (i * (w - padL - padR)) / (clean.length - 1));
  const yOf = v => padT + (1 - (v - min) / span) * (h - padT - padB);
  const coords = clean.map((p, i) => [xOf(i), yOf(Number(p.value))]);
  const d = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  const grid = [0, 0.5, 1].map(t => {
    const val = min + span * (1 - t);
    const y = padT + t * (h - padT - padB);
    return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="axis">${fmt(val, 1)}</text>`;
  }).join('');
  const dots = coords.map((c, i) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.6" fill="${color}"><title>${esc(clean[i].label)}: ${fmt(clean[i].value, 1)} ${esc(unit)}</title></circle>`).join('');
  const labels = clean.map((p, i) => {
    if (clean.length > 8 && i % 2 && i !== clean.length - 1) return '';
    return `<text x="${coords[i][0].toFixed(1)}" y="${h - 8}" text-anchor="middle" class="axis">${esc(p.label)}</text>`;
  }).join('');
  return `<figure class="chart-card"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="${esc(title)}">
    ${grid}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>${dots}${labels}
  </svg></figure>`;
}
