import { parseNutritionLabel } from '/shared/products.js';

/** Φόρτωση tesseract μόνο όταν ο χρήστης το ζητήσει. Αν αποτύχει, η φόρμα μένει χειροκίνητη. */
export async function readNutritionLabel(file, onStatus) {
  onStatus?.('Φόρτωση ανάγνωσης ετικέτας…');
  const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
  const worker = await createWorker('ell+eng', 1, {
    logger: (m) => {
      if (m?.status === 'recognizing text') onStatus?.(`Ανάγνωση ${Math.round((m.progress || 0) * 100)}%`);
      else onStatus?.('Ανάγνωση ετικέτας…');
    },
  });
  try {
    const { data } = await worker.recognize(file);
    const text = data?.text || '';
    return { text, values: parseNutritionLabel(text) };
  } finally {
    await worker.terminate().catch(() => {});
  }
}
