# Epicor Goods Receiving (PWA)

Mobile-first, installable web app for receiving goods against Epicor purchase orders.
Vanilla HTML, CSS and JavaScript (ES modules). **No build step, no package.json.**
It talks only to your n8n webhooks. Epicor and OCR credentials never reach the browser.

> **Status:** everything up to the review screen works. The final **Submit receipt** button is
> **disabled on purpose** until the backend gaps in [`BACKEND_REQUIRED.md`](BACKEND_REQUIRED.md) are fixed.

## Screens

Login, Home, Delivery order photo, Check details (PO verification), Items (scan and quantities),
Review and confirm, Result.

## Files

```
index.html            entry page
config.js             the only file you edit per deployment
styles.css
manifest.webmanifest  PWA manifest (icons included)
sw.js                 app-shell cache; never touches POST requests
icons/
js/
  main.js             router, layout, session expiry handling
  api.js              all n8n calls, error normalisation, adapters
  state.js            central state; session in sessionStorage
  scanner.js          reusable barcode scanner (html5-qrcode 2.3.8)
  image.js            shrinks photos before upload
  history.js          device-only history and double-submit guard
  ui.js, nav.js
  screens/            one file per screen
```

## Configure

Edit `config.js`:

| Setting | Meaning |
|---|---|
| `N8N_BASE_URL` | Your n8n origin, for example `https://n8n.example.com` |
| `WEBHOOK_PREFIX` | `/webhook` (production, workflows **active**) or `/webhook-test` |
| `*_PATH` | `/login`, `/document`, `/confirm-fields`, `/create-receipt`, `/get-lines` |
| `PO_LINES_PATH`, `SUBMIT_PATH` | `null` until the backend provides them |
| `FEATURES.SUBMIT_ENABLED` | Master switch for the Submit button |

## Run locally

```
cd epicor-goods-receiving
python3 -m http.server 8080
```

Open `http://localhost:8080`. `localhost` counts as secure, so camera access works.
Testing on a phone needs HTTPS (see below).

## Deploy

1. Host the folder on any static HTTPS host (Netlify, Cloudflare Pages, S3 + CloudFront, Nginx).
2. Set `N8N_BASE_URL` and `WEBHOOK_PREFIX` in `config.js`.
3. **Activate** all five n8n workflows.
4. In each n8n Webhook node, open Options and set **Allowed Origins** to your frontend's origin
   (for example `https://receiving.example.com`). Check that the browser's `OPTIONS` preflight succeeds.
5. Open the site on a real phone, sign in, and use "Add to Home Screen".
6. Test the camera on the phone (permission prompt, rear camera).

The barcode library loads from `unpkg.com` (pinned to 2.3.8). For fully offline use, download
`html5-qrcode.min.js`, put it in the project, and change the `<script>` tag in `index.html` and
`QR_LIB` in `sw.js`.

## How the safety rules are enforced

- `/get-lines` is never called to preview lines. It can receive and commit the whole PO.
- `receive_all` is always sent explicitly. Full-PO receiving is off unless `ALLOW_FULL_RECEIPT` is set.
- The Submit button needs: feature switch on, `SUBMIT_PATH` set, quantities confirmed, and no request in flight.
- A "pending" marker is written to the device **before** each submit. If the request times out or the
  connection drops, the app reports "Outcome unknown", will not retry on its own, and asks the
  operator to confirm in Epicor before it allows another attempt for that PO and pack slip.
- Success is shown only when the server replies `ok: true`. The item list shown comes from the server's reply.
- The service worker ignores every non-GET request, so receipts are never queued or replayed offline.
- A 401 from any call clears the session and returns to Login.
- No password or Basic auth value is stored. Only the session ID, expiry and username are in `sessionStorage`.

## What works today and what is gated

| Area | State |
|---|---|
| Login, session, sign out | Working |
| Photo capture, OCR upload, editable fields, missing-field warnings | Working |
| PO verification | Needs backend item U1 (success response). Fails closed with a clear message. |
| PO line list, matching against PO | Needs a read-only endpoint (U6). Otherwise parts are added as "Unverified". |
| Barcode scanning, manual entry, quantities, duplicate handling | Working |
| Submit | Disabled until `SUBMIT_ENABLED` and `SUBMIT_PATH` are set |
| History | Device-only, labelled as such |

## Acceptance checklist

See the 18 criteria in the original brief. Criteria 6, 7, 11, 12 and 13 depend on the backend
items above and cannot be signed off until those are fixed and tested on a Pilot company.
