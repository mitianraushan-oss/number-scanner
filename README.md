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

1. **Start camera** — tap **Flip camera** to switch between the back and front lens.
2. Frame the number inside the dashed green box. In the dark, tap **Flash** to switch on the torch.
3. **Scan once** — or turn on **Auto scan** to read continuously every 2 s.
4. Act on each number with one tap:

| Action | What it does |
| --- | --- |
| **Dial** | Opens the native keypad with the number filled in |
| **Save** | Asks for a name and downloads a `.vcf` — open it to add the contact |
| **WhatsApp** | Opens a WhatsApp chat with that number |
| **Mail** | Opens your mail app with the number in the body |
| **Share** | Native share sheet (WhatsApp, Telegram, Gmail, Notes…) |
| **Copy** | Copies the digits to the clipboard |

   **Save all to contacts** exports every scanned number as one `.vcf` file.
5. No camera? Use **Pick image** to OCR a screenshot or gallery photo.

## Scanning on a laptop

A laptop webcam faces you, not your other windows — so don't use the camera at all. Four ways in:

| Way | How |
| --- | --- |
| **Scan a screen** | Click it, then pick any window, tab or whole screen. The page reads those pixels directly — sharper than any camera. Auto scan keeps re-reading as the window changes. |
| **Paste** | Take a screenshot (`Win+Shift+S`) and press `Ctrl+V` anywhere on the page |
| **Drag & drop** | Drop an image file onto the camera area |
| **Pick image** | Normal file picker |

**Scan a screen** ignores the green reticle and reads the whole capture, so several numbers can be picked up at once. The button hides itself on browsers without `getDisplayMedia` (most mobile browsers) — use the camera there.

## Country code

The **+** box next to "Detected numbers" (default `91`) is used for WhatsApp links when a
scanned number has no country code of its own. It is remembered between visits.
`080-4567-8901` becomes `wa.me/918045678901`; a number already starting with `+` is left alone.

## Notes

- `tel:` pre-fills the dialer; it never places a call by itself. That is an OS rule on both Android and iOS — no browser or app can auto-dial without you pressing the call button.
- The **Flash** button only appears when the active camera actually reports a torch. That means Android Chrome with the back camera; iOS Safari and front cameras do not expose it, so the button stays hidden.
- Saving a contact goes through a `.vcf` download rather than writing to your address book directly — browsers have no API for that. Tapping the downloaded file imports it.
- OCR runs entirely in the browser (Tesseract.js). Nothing is uploaded anywhere.
- **Handwriting is hit and miss.** Tesseract is trained on printed text. Clearly separated, upright digits on plain paper often work; joined, slanted or scruffy writing usually will not. Printed numbers are far more reliable.
- The image is adaptively thresholded before OCR, so shadows and uneven lighting on paper no longer wreck the read.
- Digits `0/O` and `1/l/I` are commonly confused by OCR, so they are auto-corrected to digits. Check the number before calling.
- Accepted numbers are 7–15 digits, optional leading `+`, with spaces/dashes/brackets tolerated.

## Tuning

| What | Where |
| --- | --- |
| Scan box size/position | `CROP` in [app.js](app.js) — must match `.reticle` in [styles.css](styles.css) |
| Auto-scan speed | `LIVE_INTERVAL_MS` in [app.js](app.js) |
| Number length rules | `extractNumbers()` in [app.js](app.js) |
| Thresholding strength | `T` and `radius` in `boostContrast()` in [app.js](app.js) |
| WhatsApp number format | `toWhatsAppNumber()` in [app.js](app.js) |
