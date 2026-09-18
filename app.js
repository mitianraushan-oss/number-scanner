/* Number Scanner — camera OCR that turns numbers on any screen into tap-to-dial links. */

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const rawEl = document.getElementById('rawText');
const startBtn = document.getElementById('startBtn');
const scanBtn = document.getElementById('scanBtn');
const liveBtn = document.getElementById('liveBtn');
const fileInput = document.getElementById('fileInput');

// Matches the reticle box in styles.css so we only OCR what the user framed.
const CROP = { x: 0.08, y: 0.38, w: 0.84, h: 0.24 };
const LIVE_INTERVAL_MS = 2000;

let stream = null;
let worker = null;
let busy = false;
let liveTimer = null;
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

async function startCamera() {
  try {
    setStatus('opening camera…');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    scanBtn.disabled = false;
    liveBtn.disabled = false;
    startBtn.textContent = 'Camera on';
    startBtn.disabled = true;
    setStatus('camera ready');
    getWorker();
  } catch (err) {
    setStatus('camera blocked');
    alert(
      'Could not open the camera: ' + err.message +
      '\n\nThe camera only works on https:// or http://localhost. You can still use "Pick image".'
    );
  }
}

/** Draws the framed region of the video (upscaled + contrast boosted) onto the canvas. */
function grabFrame() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const sx = Math.round(vw * CROP.x);
  const sy = Math.round(vh * CROP.y);
  const sw = Math.round(vw * CROP.w);
  const sh = Math.round(vh * CROP.h);
  const scale = 2;

  canvas.width = sw * scale;
  canvas.height = sh * scale;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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

function render() {
  listEl.innerHTML = '';
  emptyEl.hidden = found.size > 0;

  for (const [key, display] of [...found.entries()].reverse()) {
    const li = document.createElement('li');

    const span = document.createElement('span');
    span.className = 'num';
    span.textContent = display;

    // tel: hands the number to the native dialer with the keypad pre-filled.
    const call = document.createElement('a');
    call.className = 'call';
    call.href = 'tel:' + key;
    call.textContent = 'Dial';

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

    const del = document.createElement('button');
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remove ' + display);
    del.addEventListener('click', () => {
      found.delete(key);
      render();
    });

    li.append(span, call, copy, del);
    listEl.appendChild(li);
  }
}

function toggleLive() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
    liveBtn.textContent = 'Auto scan: off';
    liveBtn.classList.remove('on');
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

scanBtn.addEventListener('click', () => {
  const frame = grabFrame();
  if (frame) recognize(frame);
});

liveBtn.addEventListener('click', toggleLive);

document.querySelector('.file').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) recognize(file);
  fileInput.value = '';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
