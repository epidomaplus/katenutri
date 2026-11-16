import { norm } from './text.js';
import { BRAND_PHRASES, BRAND_TOKENS, WORDS, FUNCTION_WORDS, ENGLISH_BLOCK } from './greeklish-data.js';

const GREEK_CHAR = /[\u0370-\u03FF\u1F00-\u1FFF]/;

function latinKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.’'`´]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripGreekAccent(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ');
}

const DIGRAPHS = [
  ['th', 'θ'], ['ch', 'χ'], ['ps', 'ψ'], ['ks', 'ξ'],
  ['gk', 'γκ'], ['gg', 'γγ'],
  ['mp', 'μπ'], ['nt', 'ντ'], ['tz', 'τζ'], ['ts', 'τσ'],
  ['ou', 'ου'], ['ei', 'ει'], ['ai', 'αι'], ['oi', 'οι'], ['au', 'αυ'], ['eu', 'ευ'],
  ['oy', 'οι'], ['ay', 'αι'], ['ey', 'ει'],
];
const SINGLE = {
  a: 'α', b: 'β', c: 'κ', d: 'δ', e: 'ε', f: 'φ', g: 'γ', h: 'χ', i: 'ι', j: 'τζ',
  k: 'κ', l: 'λ', m: 'μ', n: 'ν', o: 'ο', p: 'π', q: 'κ', r: 'ρ', s: 'σ', t: 'τ',
  u: 'υ', v: 'β', w: 'ω', x: 'ξ', y: 'ι', z: 'ζ',
};

/** Greeklish → άτονα ελληνικά. Κενό αν η λέξη δεν είναι μόνο λατινικά. */
export function phoneticUnaccented(token) {
  const s = latinKey(token);
  if (!/^[a-z]+$/.test(s)) return '';
  let i = 0;
  let out = '';
  while (i < s.length) {
    let hit = '';
    for (const [lat, gr] of DIGRAPHS) {
      if (s.startsWith(lat, i)) { hit = gr; i += lat.length; break; }
    }
    if (!hit) {
      const ch = SINGLE[s[i]];
      if (!ch) return '';
      hit = ch;
      i += 1;
    }
    out += hit;
  }
  if (out.endsWith('σ')) out = out.slice(0, -1) + 'ς';
  return out;
}

const BY_UNACCENTED = new Map();
for (const [key, value] of Object.entries({ ...WORDS, ...BRAND_TOKENS })) {
  const plain = stripGreekAccent(value).replace(/ς/g, 'σ');
  const end = plain.endsWith('σ') ? plain.slice(0, -1) + 'ς' : plain;
  if (!BY_UNACCENTED.has(end)) BY_UNACCENTED.set(end, value);
  // και χωρίς τελικό σίγμα, για ταίριασμα
  if (!BY_UNACCENTED.has(plain)) BY_UNACCENTED.set(plain, value);
  if (!BY_UNACCENTED.has(stripGreekAccent(value))) BY_UNACCENTED.set(stripGreekAccent(value), value);
}

function lookupExplicit(word) {
  const key = latinKey(word);
  if (!key) return '';
  if (BRAND_TOKENS[key]) return BRAND_TOKENS[key];
  if (WORDS[key]) return WORDS[key];
  return '';
}

function lookupHeuristic(word) {
  const key = latinKey(word);
  if (key.length < 4) return '';
  if (ENGLISH_BLOCK.has(key)) return '';
  if (!/^[a-z]+$/.test(key)) return '';
  const ph = phoneticUnaccented(key);
  if (!ph) return '';
  const plain = ph.replace(/ς/g, 'σ');
  return BY_UNACCENTED.get(ph) || BY_UNACCENTED.get(plain) || '';
}

function mapWord(word) {
  if (!word || GREEK_CHAR.test(word)) return '';
  return lookupExplicit(word) || lookupHeuristic(word);
}

const PHRASE_RES = Object.keys(BRAND_PHRASES)
  .sort((a, b) => b.length - a.length)
  .map(key => {
    const body = key.split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    return [new RegExp('(^|[^A-Za-z])(' + body + ')(?=$|[^A-Za-z])', 'gi'), BRAND_PHRASES[key]];
  });

function applyPhrases(text) {
  let out = text;
  let changed = false;
  for (const [re, value] of PHRASE_RES) {
    out = out.replace(re, (m, pre) => {
      changed = true;
      return pre + value;
    });
  }
  return { text: out, changed };
}

/**
 * Μετατρέπει καθαρό Greeklish σε τονισμένα ελληνικά.
 * Αγγλικά, ξένες μάρκες και άγνωστες λέξεις μένουν ως έχουν.
 */
export function toGreekMarket(input) {
  const original = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return { text: '', changed: false };
  const phraseKey = latinKey(original);
  if (BRAND_PHRASES[phraseKey]) {
    const text = BRAND_PHRASES[phraseKey];
    return { text, changed: text !== original };
  }
  const phrased = applyPhrases(original);
  const parts = phrased.text.split(/(\s+)/);
  let changed = phrased.changed;
  const mapped = parts.map(part => {
    if (!part || /^\s+$/.test(part)) return part;
    const m = part.match(/^([^A-Za-z\u0370-\u03FF\u1F00-\u1FFF]*)([A-Za-z\u0370-\u03FF\u1F00-\u1FFF][A-Za-z\u0370-\u03FF\u1F00-\u1FFF.'’-]*)(.*)$/);
    if (!m) return part;
    const [, pre, word, post] = m;
    const core = word.replace(/[.'’-]+$/g, '');
    const tail = word.slice(core.length);
    const next = mapWord(core);
    if (!next) return part;
    changed = true;
    return pre + next + tail + post;
  });
  // Μικρές λέξεις (με, και, του…) μόνο ανάμεσα σε ελληνικά.
  const tokens = mapped.join('').split(/(\s+)/);
  const words = tokens.filter(t => t && !/^\s+$/.test(t));
  const greekAt = words.map(w => GREEK_CHAR.test(w));
  let wi = 0;
  const adjusted = tokens.map(part => {
    if (!part || /^\s+$/.test(part)) return part;
    const idx = wi++;
    const m = part.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
    if (!m) return part;
    const fn = FUNCTION_WORDS[m[2].toLowerCase()];
    if (!fn) return part;
    const prev = idx > 0 && greekAt[idx - 1];
    const nextG = idx + 1 < greekAt.length && greekAt[idx + 1];
    if (!prev && !nextG) return part;
    changed = true;
    return m[1] + fn + m[3];
  });
  const text = adjusted.join('').replace(/\s+/g, ' ').trim();
  return { text, changed: changed && text !== original };
}

export function canonicalBrand(raw) {
  const parts = String(raw || '').split(/[,;/|]/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  let changed = false;
  for (const part of parts) {
    const conv = toGreekMarket(part);
    if (conv.changed) changed = true;
    const text = conv.text;
    const k = norm(text);
    if (!text || seen.has(k)) continue;
    seen.add(k);
    out.push(text);
    break; // η πρώτη μάρκα είναι αυτή που δείχνουμε και με την οποία ενώνουμε διπλότυπα
  }
  return { text: out[0] || '', changed };
}

export function hasGreek(s) {
  return GREEK_CHAR.test(String(s || ''));
}
