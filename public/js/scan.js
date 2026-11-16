import { modal, esc } from './util.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load'));
    document.head.appendChild(s);
  });
}

export function openBarcodeScanner() {
  return new Promise(resolve => {
    let settled = false;
    let stream = null;
    let timer = 0;
    let html5 = null;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (html5) html5.stop().catch(() => {}).finally(() => html5.clear().catch(() => {}));
      m.close();
      resolve(code || null);
    };
    const m = modal(`<div class="page-h" style="margin-top:0"><h2 style="margin:0">Σάρωση barcode</h2><button type="button" class="sm" id="scan-x">Κλείσιμο</button></div>
      <p class="muted">Στρέψτε την κάμερα στο barcode. Αν δεν ανοίγει, πληκτρολογήστε τον κωδικό.</p>
      <div class="video-box"><video id="scan-video" playsinline muted autoplay></video><div id="scan-reader"></div></div>
      <p class="err" id="scan-err"></p>
      <label class="lbl">ή πληκτρολογήστε τον κωδικό</label>
      <div class="actions"><input id="scan-manual" inputmode="numeric" autocomplete="off" placeholder="π.χ. 5202535179175"><button type="button" class="primary" id="scan-go">Αναζήτηση</button></div>`);
    const err = m.el.querySelector('#scan-err');
    m.el.querySelector('#scan-x').onclick = () => finish(null);
    const origClose = m.close;
    m.close = () => { if (!settled) { settled = true; clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); } origClose(); };
    m.el.querySelector('#scan-go').onclick = () => {
      const code = m.el.querySelector('#scan-manual').value.replace(/\D/g, '');
      if (code) finish(code);
      else err.textContent = 'Γράψτε τον κωδικό.';
    };
    const video = m.el.querySelector('#scan-video');
    const startNative = async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return false;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      let detector;
      try { detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] }); }
      catch { detector = new BarcodeDetector(); }
      timer = setInterval(async () => {
        if (settled || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) finish(codes[0].rawValue);
        } catch { /* το επόμενο καρέ */ }
      }, 280);
      return true;
    };
    const startFallback = async () => {
      video.style.display = 'none';
      await loadScript('/vendor/html5-qrcode.min.js');
      const Ctor = window.Html5Qrcode;
      if (!Ctor) throw new Error('scanner');
      html5 = new Ctor('scan-reader');
      await html5.start({ facingMode: 'environment' }, { fps: 8, qrbox: { width: 240, height: 140 } }, (text) => finish(text));
    };
    startNative().then(ok => { if (!ok && !settled) return startFallback(); }).catch(async () => {
      try { await startFallback(); }
      catch { if (!settled) err.textContent = 'Η κάμερα δεν είναι διαθέσιμη. Πληκτρολογήστε τον κωδικό.'; }
    });
  });
}
