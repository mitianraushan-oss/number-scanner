/* Number Scanner — camera OCR that turns numbers on any screen into tap-to-dial links. */

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const rawEl = document.getElementById('rawText');
const startBtn = document.getElementById('startBtn');
const flipBtn = document.getElementById('flipBtn');
const torchBtn = document.getElementById('torchBtn');
const screenBtn = document.getElementById('screenBtn');
const scanBtn = document.getElementById('scanBtn');
const liveBtn = document.getElementById('liveBtn');
const fileInput = document.getElementById('fileInput');
const pickBtn = document.getElementById('pickBtn');
const stageEl = document.querySelector('.stage');
const reticleEl = document.getElementById('reticle');
const dialCodeInput = document.getElementById('dialCode');
const bulkEl = document.getElementById('bulk');
const saveAllBtn = document.getElementById('saveAllBtn');
const clearBtn = document.getElementById('clearBtn');

// Matches the reticle box in styles.css so we only OCR what the user framed.
const CROP = { x: 0.08, y: 0.38, w: 0.84, h: 0.24 };
const LIVE_INTERVAL_MS = 2000;
const DIAL_CODE_KEY = 'number-scanner.dialCode';

let stream = null;
let worker = null;
let busy = false;
let liveTimer = null;
let facing = 'environment';
let sourceMode = null; // 'camera' | 'screen'
let torchOn = false;
const found = new Map(); // normalized number -> display text

function setStatus(text) {
  statusEl.textContent = text;
}

async function getWorker() {
  if (worker) return worker;
  setStatus('loading OCR…');
  worker = await Tesseract.createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789+()-. ',
    preserve_interword_spaces: '1',
  });
  setStatus('ready');
  return worker;
}

function stopStream() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  torchOn = false;
  torchBtn.hidden = true;
  torchBtn.textContent = 'Flash: off';
  torchBtn.classList.remove('on');
}

/** The torch is a camera-track capability — usually back camera on Android only. */
function setupTorch() {
  const track = stream && stream.getVideoTracks()[0];
  if (!track || !track.getCapabilities) return;
  const supported = !!track.getCapabilities().torch;
  torchBtn.hidden = !supported;
}

async function toggleTorch() {
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    torchBtn.textContent = torchOn ? 'Flash: on' : 'Flash: off';
    torchBtn.classList.toggle('on', torchOn);
  } catch {
    torchOn = false;
    setStatus('flash unavailable');
  }
}

function onSourceReady(mode) {
  sourceMode = mode;
  stageEl.classList.add('has-source');
  stageEl.classList.toggle('screen-mode', mode === 'screen');
  reticleEl.hidden = mode === 'screen';
  scanBtn.disabled = false;
  liveBtn.disabled = false;
  flipBtn.disabled = mode !== 'camera';
  getWorker();
}

async function startCamera() {
  try {
    setStatus('opening camera…');
    stopStream();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    startBtn.textContent = 'Camera on';
    startBtn.disabled = true;
    setupTorch();
    onSourceReady('camera');
    setStatus(facing === 'environment' ? 'back camera' : 'front camera');
  } catch (err) {
    setStatus('camera blocked');
    alert(
      'Could not open the camera: ' + err.message +
      '\n\nThe camera only works on https:// or http://localhost. You can still use "Scan a screen", "Pick image", or paste a screenshot.'
    );
  }
}

async function flipCamera() {
  facing = facing === 'environment' ? 'user' : 'environment';
  startBtn.disabled = false;
  await startCamera();
}

/** Screen capture: on a laptop this reads another window directly, no camera needed. */
async function startScreenCapture() {
  try {
    setStatus('choose a window…');
    stopStream();
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 5 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      stopLive();
      stageEl.classList.remove('has-source', 'screen-mode');
      scanBtn.disabled = true;
      liveBtn.disabled = true;
      sourceMode = null;
      setStatus('screen sharing stopped');
    });
    onSourceReady('screen');
    setStatus('screen ready — tap Scan once');
  } catch (err) {
    setStatus(err.name === 'NotAllowedError' ? 'ready' : 'screen capture failed');
  }
}

/** Draws the frame: the reticle crop for a camera, the whole picture for a screen. */
function grabFrame() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (sourceMode === 'screen') {
    // Screen pixels are already sharp and high-contrast, so use them untouched.
    canvas.width = vw;
    canvas.height = vh;
    ctx.drawImage(video, 0, 0);
    return canvas;
  }

  const sx = Math.round(vw * CROP.x);
  const sy = Math.round(vh * CROP.y);
  const sw = Math.round(vw * CROP.w);
  const sh = Math.round(vh * CROP.h);
  const scale = 2;

  canvas.width = sw * scale;
  canvas.height = sh * scale;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  boostContrast(ctx, canvas.width, canvas.height);
  return canvas;
}

/** Grayscale + hard threshold: small screen digits read far better after this. */
function boostContrast(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const mean = sum / (d.length / 4);
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > mean * 0.92 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

async function recognize(source) {
  if (busy) return;
  busy = true;
  scanBtn.disabled = true;
  setStatus('scanning…');
  try {
    const w = await getWorker();
    const { data } = await w.recognize(source);
    rawEl.textContent = (data.text || '').trim() || '(nothing recognized)';
    const numbers = extractNumbers(data.text || '');
    if (numbers.length) {
      addNumbers(numbers);
      setStatus(`found ${numbers.length}`);
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      setStatus('no number found');
    }
  } catch (err) {
    setStatus('scan failed');
    console.error(err);
  } finally {
    busy = false;
    scanBtn.disabled = !stream;
  }
}

/** Fixes O->0 and l/I->1 only inside mostly-numeric tokens, so real words survive. */
function normalizeOcrDigits(text) {
  return text.replace(/\S+/g, (token) => {
    const digitCount = (token.match(/\d/g) || []).length;
    if (digitCount < token.length / 2) return token;
    return token.replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
  });
}

/** Pulls plausible phone numbers out of raw OCR text. */
function extractNumbers(text) {
  // Split on newlines and wide gaps first, otherwise one greedy match swallows two numbers.
  const segments = normalizeOcrDigits(text).split(/\r?\n|\s{2,}/);
  const out = [];
  const seen = new Set();

  for (const segment of segments) {
    const matches = segment.match(/[+(]?\d[\d ().-]{4,18}\d/g) || [];
    for (const raw of matches) {
      const display = raw.trim().replace(/[\s().-]+$/, '');
      const digits = display.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) continue;
      const key = (display.startsWith('+') ? '+' : '') + digits;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, display });
    }
  }
  return out;
}

function addNumbers(numbers) {
  let added = false;
  for (const n of numbers) {
    if (found.has(n.key)) continue;
    found.set(n.key, n.display);
    added = true;
  }
  if (added) render();
}

function dialCode() {
  return dialCodeInput.value.replace(/\D/g, '') || '91';
}

/** WhatsApp links need a full international number with no '+', zeros or separators. */
function toWhatsAppNumber(key) {
  const digits = key.replace(/\D/g, '');
  if (key.startsWith('+')) return digits;
  const local = digits.replace(/^0+/, '');
  // Anything longer than a local subscriber number already carries a country code.
  return local.length > 10 ? local : dialCode() + local;
}

function escapeVCard(value) {
  return String(value).replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function buildVCard(entries) {
  const stamp = new Date().toLocaleString();
  return entries
    .map(([key, display, name]) => {
      const fn = escapeVCard(name || display);
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${fn};;;`,
        `FN:${fn}`,
        `TEL;TYPE=CELL:${escapeVCard(key)}`,
        `NOTE:Scanned with Number Scanner on ${escapeVCard(stamp)}`,
        'END:VCARD',
      ].join('\r\n');
    })
    .join('\r\n');
}

/** Downloads a .vcf — opening it hands the contact to the phone's address book. */
function downloadVCard(filename, entries) {
  const blob = new Blob([buildVCard(entries)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus('contact file saved');
}

async function shareNumber(key, display) {
  const text = `Phone number: ${display}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Phone number', text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(key);
    setStatus('copied — paste to share');
  } catch {
    setStatus('sharing unavailable');
  }
}

function render() {
  listEl.innerHTML = '';
  emptyEl.hidden = found.size > 0;
  bulkEl.hidden = found.size === 0;

  for (const [key, display] of [...found.entries()].reverse()) {
    const li = document.createElement('li');

    const numRow = document.createElement('div');
    numRow.className = 'num-row';

    const span = document.createElement('span');
    span.className = 'num';
    span.textContent = display;

    const del = document.createElement('button');
    del.className = 'remove';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remove ' + display);
    del.addEventListener('click', () => {
      found.delete(key);
      render();
    });

    numRow.append(span, del);

    const actions = document.createElement('div');
    actions.className = 'actions';

    // tel: hands the number to the native dialer with the keypad pre-filled.
    const call = document.createElement('a');
    call.className = 'call';
    call.href = 'tel:' + key;
    call.textContent = 'Dial';

    const save = document.createElement('button');
    save.textContent = 'Save';
    save.addEventListener('click', () => {
      const name = prompt('Save contact as:', display);
      if (name === null) return;
      downloadVCard(`${key.replace(/\D/g, '') || 'contact'}.vcf`, [[key, display, name.trim() || display]]);
    });

    const wa = document.createElement('a');
    wa.className = 'wa';
    wa.href = 'https://wa.me/' + toWhatsAppNumber(key);
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    wa.textContent = 'WhatsApp';

    const mail = document.createElement('a');
    mail.href =
      'mailto:?subject=' +
      encodeURIComponent('Phone number') +
      '&body=' +
      encodeURIComponent(`${display}\n\nTap to call: tel:${key}`);
    mail.textContent = 'Mail';

    const share = document.createElement('button');
    share.textContent = 'Share';
    share.addEventListener('click', () => shareNumber(key, display));

    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(key);
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
      } catch {
        setStatus('copy blocked');
      }
    });

    actions.append(call, save, wa, mail, share, copy);
    li.append(numRow, actions);
    listEl.appendChild(li);
  }
}

function stopLive() {
  if (!liveTimer) return;
  clearInterval(liveTimer);
  liveTimer = null;
  liveBtn.textContent = 'Auto scan: off';
  liveBtn.classList.remove('on');
}

function toggleLive() {
  if (liveTimer) {
    stopLive();
    setStatus('ready');
    return;
  }
  liveTimer = setInterval(() => {
    const frame = grabFrame();
    if (frame) recognize(frame);
  }, LIVE_INTERVAL_MS);
  liveBtn.textContent = 'Auto scan: on';
  liveBtn.classList.add('on');
}

startBtn.addEventListener('click', startCamera);
flipBtn.addEventListener('click', flipCamera);
torchBtn.addEventListener('click', toggleTorch);

if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
  screenBtn.hidden = false;
  screenBtn.addEventListener('click', startScreenCapture);
}

scanBtn.addEventListener('click', () => {
  const frame = grabFrame();
  if (frame) recognize(frame);
});

liveBtn.addEventListener('click', toggleLive);

dialCodeInput.value = localStorage.getItem(DIAL_CODE_KEY) || '91';
dialCodeInput.addEventListener('change', () => {
  dialCodeInput.value = dialCode();
  localStorage.setItem(DIAL_CODE_KEY, dialCodeInput.value);
  render();
});

saveAllBtn.addEventListener('click', () => {
  const entries = [...found.entries()].map(([key, display]) => [key, display, display]);
  if (entries.length) downloadVCard('scanned-numbers.vcf', entries);
});

clearBtn.addEventListener('click', () => {
  found.clear();
  render();
});

pickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) recognize(file);
  fileInput.value = '';
});

window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  recognize(item.getAsFile());
});

stageEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  stageEl.classList.add('dragover');
});

stageEl.addEventListener('dragleave', () => stageEl.classList.remove('dragover'));

stageEl.addEventListener('drop', (e) => {
  e.preventDefault();
  stageEl.classList.remove('dragover');
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) recognize(file);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
