# Number Scanner → Dial

Point your phone camera at any number (on a screen, a card, a poster), it reads the digits with on-device OCR, and gives you a **Dial** button that opens your phone's keypad with the number already filled in.

Works on any modern Android/iOS browser — no app store, no install required.

## Run it

```powershell
cd c:\Users\raushan.kumar\Projects\number-scanner
npx serve . -l 5173
```

Open `http://localhost:5173` on the PC to test with a webcam.

## Use it on your phone

Camera access requires a **secure context** (`https://` or `localhost`). Pick one:

| Option | How |
| --- | --- |
| **Ngrok (fastest)** | `npx serve . -l 5173` then `npx ngrok http 5173` → open the `https://…` URL on the phone |
| **GitHub Pages** | Push this folder to a repo, enable Pages → permanent `https://` link |
| **USB cable** | Chrome desktop → `chrome://inspect` → Port forwarding `5173 → localhost:5173`, then open `http://localhost:5173` on the phone |

Then tap the browser menu → **Add to Home screen** so it behaves like a real app (icon, fullscreen, works offline after first load).

## How to scan

1. **Start camera**
2. Frame the number inside the dashed green box.
3. **Scan once** — or turn on **Auto scan** to read continuously every 2 s.
4. Tap **Dial** to jump to the phone keypad, or **Copy** to paste anywhere.
5. No camera? Use **Pick image** to OCR a screenshot or gallery photo.

## Notes

- `tel:` pre-fills the dialer; it never places a call by itself. That is an OS rule on both Android and iOS — no browser or app can auto-dial without you pressing the call button.
- OCR runs entirely in the browser (Tesseract.js). Nothing is uploaded anywhere.
- Digits `0/O` and `1/l/I` are commonly confused by OCR, so they are auto-corrected to digits. Check the number before calling.
- Accepted numbers are 7–15 digits, optional leading `+`, with spaces/dashes/brackets tolerated.

## Tuning

| What | Where |
| --- | --- |
| Scan box size/position | `CROP` in [app.js](app.js) — must match `.reticle` in [styles.css](styles.css) |
| Auto-scan speed | `LIVE_INTERVAL_MS` in [app.js](app.js) |
| Number length rules | `extractNumbers()` in [app.js](app.js) |
