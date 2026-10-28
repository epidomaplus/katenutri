import { esc, setHandlers } from './util.js';
import { fmt } from '/shared/text.js';
import { adultBmi, pediatricBmi, cockcroftGault, tygIndex, fiberTargets, TOOL_DISCLAIMER } from '/shared/tools.js';

function num(id) {
  const el = document.getElementById(id);
  if (!el || el.value === '') return '';
  return el.value;
}
function val(id) {
  return document.getElementById(id)?.value;
}
function box(result) {
  if (!result) return '<p class="muted">Συμπληρώστε τα πεδία.</p>';
  if (result.error) return `<p class="${result.limited ? 'muted' : 'err'}">${esc(result.error)}</p><p class="disclaimer">${esc(TOOL_DISCLAIMER)}</p>`;
  return '';
}

function paint() {
  const adult = adultBmi(num('ab-w'), num('ab-h'));
  const adultHost = document.getElementById('ab-out');
  if (adultHost) {
    const err = box(adult.bmi == null ? (num('ab-w') || num('ab-h') ? adult : null) : null);
    adultHost.innerHTML = adult.bmi == null
      ? (err || '<p class="muted">Συμπληρώστε βάρος και ύψος.</p>')
      : `<p class="banner ${adult.tone === 'ok' ? 'info' : ''}"><b>BMI ${fmt(adult.bmi, 1)}</b> · ${esc(adult.category)}</p><p class="muted">${adult.bands.map(esc).join(' · ')}</p><p class="muted">${esc(adult.note)}</p><p class="disclaimer">${esc(TOOL_DISCLAIMER)}</p>`;
  }

  const ped = pediatricBmi({ kg: num('pb-w'), cm: num('pb-h'), years: num('pb-y'), months: num('pb-m') || 0, sex: val('pb-sex') });
  const pedHost = document.getElementById('pb-out');
  if (pedHost) {
    if (!num('pb-w') || !num('pb-h') || num('pb-y') === '') pedHost.innerHTML = '<p class="muted">Συμπληρώστε βάρος, ύψος και ηλικία.</p>';
    else if (ped.error) pedHost.innerHTML = box(ped);
    else pedHost.innerHTML = `<p class="banner ${ped.tone === 'ok' ? 'info' : ''}"><b>BMI ${fmt(ped.bmi, 1)}</b> · ${esc(ped.category)}</p>
      <p class="muted">Ηλικία ${fmt(ped.age, 2)} έτη. Όρια στην ηλικία αυτή: λιπότητα 3 / 2 / 1: ${fmt(ped.cuts.g3, 2)} / ${fmt(ped.cuts.g2, 2)} / ${fmt(ped.cuts.g1, 2)} · υπέρβαρο ${fmt(ped.cuts.ow, 2)} · παχυσαρκία ${fmt(ped.cuts.ob, 2)}.</p>
      <p class="muted">${esc(ped.note)}</p><p class="disclaimer">${esc(TOOL_DISCLAIMER)}</p>`;
  }

  const cg = cockcroftGault({ age: num('cg-a'), weightKg: num('cg-w'), sex: val('cg-sex'), creatinine: num('cg-cr'), unit: val('cg-unit') });
  const cgHost = document.getElementById('cg-out');
  if (cgHost) {
    if (!num('cg-a') || !num('cg-w') || !num('cg-cr')) cgHost.innerHTML = '<p class="muted">Συμπληρώστε ηλικία, βάρος και κρεατινίνη.</p>';
    else if (cg.error) cgHost.innerHTML = box(cg);
    else cgHost.innerHTML = `<p class="banner ${cg.tone === 'ok' ? 'info' : ''}"><b>${fmt(cg.crcl, 1)} mL/min</b> · αριθμητική ζώνη ${esc(cg.band)}</p>
      <p class="muted">Κρεατινίνη που χρησιμοποιήθηκε: ${fmt(cg.scrMg, 2)} mg/dL. ${esc(cg.note)}</p><p class="disclaimer">${esc(TOOL_DISCLAIMER)}</p>`;
  }

  const tyg = tygIndex({ triglycerides: num('tg-t'), glucose: num('tg-g'), tgUnit: val('tg-tu'), gluUnit: val('tg-gu') });
  const tgHost = document.getElementById('tg-out');
  if (tgHost) {
    if (!num('tg-t') || !num('tg-g')) tgHost.innerHTML = '<p class="muted">Συμπληρώστε τριγλυκερίδια και γλυκόζη νηστείας.</p>';
    else if (tyg.error) tgHost.innerHTML = box(tyg);
    else tgHost.innerHTML = `<p class="banner ${tyg.tone === 'ok' ? 'info' : ''}"><b>TyG ${fmt(tyg.tyg, 2)}</b></p><p>${esc(tyg.hint)}</p>
      <p class="muted">Σε mg/dL: τριγλυκερίδια ${fmt(tyg.tgMg, 0)}, γλυκόζη ${fmt(tyg.gluMg, 0)}. ${esc(tyg.note)}</p><p class="disclaimer">${esc(TOOL_DISCLAIMER)}</p>`;
  }

  const fiber = fiberTargets({ age: num('fb-a'), sex: val('fb-sex'), kcal: num('fb-k'), intake: num('fb-i') });
  const fbHost = document.getElementById('fb-out');
  if (fbHost) {
    if (num('fb-a') === '') fbHost.innerHTML = '<p class="muted">Συμπληρώστε ηλικία. Οι θερμίδες και η τρέχουσα πρόσληψη είναι προαιρετικές.</p>';
    else if (fiber.error) fbHost.innerHTML = box(fiber);
    else {
      const driLine = fiber.dri == null
        ? 'Χωρίς επιλογή φύλου δεν κλειδώνει ένα γραμμάριο DRI από τα 9 έτη και πάνω (διαφέρει σε αγόρια/άνδρες και κορίτσια/γυναίκες).'
        : `Επαρκής πρόσληψη (DRI) για ${fiber.driLabel}: <b>${fiber.dri} g/ημέρα</b>.`;
      const kcalLine = fiber.perKcal == null ? 'Χωρίς θερμίδες δεν υπολογίζεται ο κανόνας ADA 14 g/1.000 kcal.' : `Κανόνας ADA: <b>${fmt(fiber.perKcal, 1)} g/ημέρα</b> (14 g ανά 1.000 kcal).`;
      const gap = [];
      if (fiber.gapDri != null) gap.push(`Διαφορά από τον στόχο DRI: ${fiber.gapDri > 0 ? '+' : ''}${fmt(fiber.gapDri, 1)} g`);
      if (fiber.gapKcal != null) gap.push(`Διαφορά από τον κανόνα ADA: ${fiber.gapKcal > 0 ? '+' : ''}${fmt(fiber.gapKcal, 1)} g`);
      fbHost.innerHTML = `<p class="banner info">${driLine}</p><p>${kcalLine}</p>${gap.length ? `<p>${gap.map(esc).join(' · ')}</p>` : ''}<p class="muted">${esc(fiber.note)}</p><p class="disclaimer">${esc(TOOL_DISCLAIMER)}</p>`;
    }
  }
}

export async function toolsPage() {
  setHandlers({ calc: () => paint() });
  return `<div class="page-h"><div><h1>Εργαλεία</h1><p class="muted">Εκτιμήσεις για το γραφείο. Δεν αντικαθιστούν καμπύλες αύξησης, εργαστηριακή γνωμάτευση ή κλινική κρίση.</p></div></div>
  <div class="banner">${esc(TOOL_DISCLAIMER)}</div>

  <div class="card"><h2>1. BMI ενηλίκων</h2>
    <div class="grid-3"><div><label class="lbl">Βάρος (kg)</label><input id="ab-w" data-input="calc" type="number" min="0" step="0.1"></div>
    <div><label class="lbl">Ύψος (cm)</label><input id="ab-h" data-input="calc" type="number" min="0" step="0.1"></div></div>
    <div id="ab-out"></div></div>

  <div class="card"><h2>2. BMI παιδιών και εφήβων</h2>
    <p class="muted">Όρια Cole, 2–18 ετών, με παρεμβολή. Κάτω από 2 έτη ο υπολογισμός δεν προσφέρεται.</p>
    <div class="grid-3">
      <div><label class="lbl">Βάρος (kg)</label><input id="pb-w" data-input="calc" type="number" min="0" step="0.1"></div>
      <div><label class="lbl">Ύψος (cm)</label><input id="pb-h" data-input="calc" type="number" min="0" step="0.1"></div>
      <div><label class="lbl">Φύλο</label><select id="pb-sex" data-change="calc"><option value="female">Κορίτσι</option><option value="male">Αγόρι</option></select></div>
      <div><label class="lbl">Έτη</label><input id="pb-y" data-input="calc" type="number" min="0" max="18" step="1"></div>
      <div><label class="lbl">Μήνες</label><input id="pb-m" data-input="calc" type="number" min="0" max="11" step="1" value="0"></div>
    </div>
    <div id="pb-out"></div></div>

  <div class="card"><h2>3. Cockcroft–Gault</h2>
    <p class="muted">Κάθαρση κρεατινίνης, όπως χρησιμοποιείται συχνά στην πράξη. Δεν είναι εξίσωση CKD-EPI.</p>
    <div class="grid-3">
      <div><label class="lbl">Ηλικία (έτη)</label><input id="cg-a" data-input="calc" type="number" min="18" step="1"></div>
      <div><label class="lbl">Βάρος (kg)</label><input id="cg-w" data-input="calc" type="number" min="0" step="0.1"></div>
      <div><label class="lbl">Φύλο</label><select id="cg-sex" data-change="calc"><option value="female">Γυναίκα (× 0,85)</option><option value="male">Άνδρας</option></select></div>
      <div><label class="lbl">Κρεατινίνη</label><input id="cg-cr" data-input="calc" type="number" min="0" step="0.01"></div>
      <div><label class="lbl">Μονάδα</label><select id="cg-unit" data-change="calc"><option value="mg">mg/dL</option><option value="umol">μmol/L</option></select></div>
    </div>
    <div id="cg-out"></div></div>

  <div class="card"><h2>4. Δείκτης TyG</h2>
    <p class="muted">Από τριγλυκερίδια και γλυκόζη νηστείας. Ένδειξη κινδύνου αντίστασης στην ινσουλίνη, χωρίς ενιαίο διαγνωστικό όριο.</p>
    <div class="grid-3">
      <div><label class="lbl">Τριγλυκερίδια</label><input id="tg-t" data-input="calc" type="number" min="0" step="0.1"></div>
      <div><label class="lbl">Μονάδα TG</label><select id="tg-tu" data-change="calc"><option value="mg">mg/dL</option><option value="mmol">mmol/L</option></select></div>
      <div><label class="lbl">Γλυκόζη νηστείας</label><input id="tg-g" data-input="calc" type="number" min="0" step="0.1"></div>
      <div><label class="lbl">Μονάδα γλυκόζης</label><select id="tg-gu" data-change="calc"><option value="mg">mg/dL</option><option value="mmol">mmol/L</option></select></div>
    </div>
    <div id="tg-out"></div></div>

  <div class="card"><h2>5. Φυτικές ίνες την ημέρα</h2>
    <p class="muted">Σύγκριση με τον κανόνα ADA (14 g/1.000 kcal) και με την επαρκή πρόσληψη ανά ηλικία και φύλο.</p>
    <div class="grid-3">
      <div><label class="lbl">Ηλικία (έτη)</label><input id="fb-a" data-input="calc" type="number" min="1" step="1"></div>
      <div><label class="lbl">Φύλο</label><select id="fb-sex" data-change="calc"><option value="female">Γυναίκα / κορίτσι</option><option value="male">Άνδρας / αγόρι</option></select></div>
      <div><label class="lbl">Ενέργεια (kcal, προαιρετικά)</label><input id="fb-k" data-input="calc" type="number" min="0" step="10"></div>
      <div><label class="lbl">Τρέχουσα πρόσληψη (g, προαιρετικά)</label><input id="fb-i" data-input="calc" type="number" min="0" step="0.5"></div>
    </div>
    <div id="fb-out"></div></div>`;
}
