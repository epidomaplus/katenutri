// Εισαγωγή Open Food Facts. Τρέχει ΜΟΝΟ από το POST /api/catalog/off-import.
// Δεν καλείται στην εκκίνηση του διακομιστή.
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createGunzip } from 'zlib';
import { fileURLToPath } from 'url';
import { mapOffProduct, mapSeedRow, offProductUrl, offSearchUrl, offTextQueries, OFF_USER_AGENT, tokenScore } from '../shared/products.js';
import { countProducts, readOffState, upsertProducts, writeOffState } from './catalog-store.js';

const SEED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'off-greece.jsonl.gz');
let running = null;
let nextAt = 0;

export function offJobActive() { return !!running; }
export function liveOffEnabled() { return process.env.OFF_SEARCH !== '0'; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pace() {
  const wait = Math.max(0, nextAt - Date.now());
  nextAt = Date.now() + wait + 1100;
  if (wait) await sleep(wait);
}

export async function offFetch(url) {
  let last = 'Το Open Food Facts δεν απάντησε.';
  for (let attempt = 0; attempt < 4; attempt++) {
    await pace();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status === 503 || res.status === 401 || res.status === 500) {
        last = 'OFF ' + res.status;
        const ra = Number(res.headers.get('retry-after'));
        if (ra > 0) nextAt = Math.max(nextAt, Date.now() + ra * 1000);
        continue;
      }
      const text = await res.text();
      if (!res.ok || text.startsWith('<')) throw new Error('OFF ' + res.status);
      return JSON.parse(text);
    } catch (err) {
      last = err.message || last;
    }
  }
  throw new Error(last);
}

function storable(p) {
  const { namesConverted, brandsConverted, before, after, ...rest } = p;
  return rest;
}

async function* seedLines() {
  if (!fs.existsSync(SEED)) throw new Error('Λείπει το αρχείο της εγκεκριμένης λίστας (seed/off-greece.jsonl.gz).');
  const rl = readline.createInterface({
    input: fs.createReadStream(SEED).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) yield line;
  } finally {
    rl.close();
  }
}

async function run(state) {
  let lineNo = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    await upsertProducts(batch.map(storable), { protectEdits: true });
    state.imported += batch.length;
    batch = [];
  };
  try {
    for await (const line of seedLines()) {
      lineNo += 1;
      if (lineNo <= (state.line || 0)) continue;
      if (!line.trim()) continue;
      state.seen += 1;
      let mapped = null;
      try { mapped = mapSeedRow(JSON.parse(line)); } catch { mapped = null; }
      if (!mapped) state.skipped += 1;
      else {
        if (mapped.namesConverted) state.namesConverted += 1;
        if (mapped.brandsConverted) state.brandsConverted += 1;
        if ((mapped.namesConverted || mapped.brandsConverted) && state.examples.length < 24) {
          const key = mapped.before + '→' + mapped.after;
          if (!state.examples.some(e => e.before + '→' + e.after === key)) {
            state.examples.push({ before: mapped.before, after: mapped.after });
          }
        }
        batch.push(mapped);
      }
      if (batch.length >= 150) {
        await flush();
        state.line = lineNo;
        state.status = 'running';
        await writeOffState(state);
      }
    }
    await flush();
    state.line = lineNo;
    state.status = 'done';
    state.error = '';
    state.finishedAt = new Date().toISOString();
    await writeOffState(state);
    console.log(`[off] εισαγωγή ολοκληρώθηκε: ${state.imported} προϊόντα, παραλείφθηκαν ${state.skipped}, ονόματα ${state.namesConverted}, μάρκες ${state.brandsConverted}`);
  } catch (err) {
    try { await flush(); } catch { /* κρατάμε το σφάλμα της εισαγωγής */ }
    state.line = lineNo;
    state.status = 'error';
    state.error = err.message || 'Σφάλμα εισαγωγής';
    await writeOffState(state);
    console.error('[off] εισαγωγή σταμάτησε:', state.error);
  }
}

export async function getOffStatus() {
  const state = await readOffState();
  let catalogCount = 0;
  try { catalogCount = await countProducts(); } catch { /* ο πίνακας μπορεί να μην υπάρχει ακόμη */ }
  let status = state.status || 'idle';
  if (status === 'running' && !running) status = 'paused';
  return { ...state, status, catalogCount, running: !!running };
}

/** Μόνο από το κουμπί / POST. Ποτέ από την εκκίνηση. */
export async function startOffImport({ restart = false } = {}) {
  if (running) {
    const cur = await getOffStatus();
    return { ...cur, alreadyRunning: true };
  }
  const prev = await readOffState();
  const fresh = restart || prev.status === 'done' || prev.status === 'idle';
  const state = {
    ...prev,
    status: 'running',
    error: '',
    startedAt: fresh ? new Date().toISOString() : (prev.startedAt || new Date().toISOString()),
    finishedAt: null,
    line: fresh ? 0 : (prev.line || 0),
    seen: fresh ? 0 : (prev.seen || 0),
    imported: fresh ? 0 : (prev.imported || 0),
    skipped: fresh ? 0 : (prev.skipped || 0),
    namesConverted: fresh ? 0 : (prev.namesConverted || 0),
    brandsConverted: fresh ? 0 : (prev.brandsConverted || 0),
    examples: fresh ? [] : (prev.examples || []),
  };
  await writeOffState(state);
  running = run(state).finally(() => { running = null; });
  return { ...(await getOffStatus()), alreadyRunning: false };
}

export async function searchOffLive(query) {
  if (!liveOffEnabled()) return [];
  const queries = offTextQueries(query);
  const tokens = String(query || '').trim().split(/\s+/).filter(t => t.length >= 2).length;
  for (const q of queries) {
    let data;
    try { data = await offFetch(offSearchUrl({ page: 1, pageSize: 24, q })); }
    catch { continue; }
    const hits = data.hits || data.products || [];
    const mapped = hits.map(mapOffProduct).filter(Boolean).map(storable);
    const ranked = mapped
      .map(p => ({ p, score: tokenScore(p, query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const full = ranked.filter(x => x.score === tokens);
    const pick = (full.length ? full : ranked).slice(0, 20);
    if (pick.length) return pick.map(x => x.p);
  }
  return [];
}

export async function fetchOffBarcode(code) {
  if (!liveOffEnabled()) return null;
  const data = await offFetch(offProductUrl(code));
  const mapped = mapOffProduct(data?.product || null);
  return mapped ? storable(mapped) : null;
}
