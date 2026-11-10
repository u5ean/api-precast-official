# Deployment & backend fix checklist

## Step 1 — Hostinger upload
- [/] index.html sits in public_html next to config.js, sw.js, js/, icons/
- [/] No extra nested folder from unzip
- [/] Site opens over https:// with login screen + blue header
- [/] Force HTTPS enabled in hPanel → Security → SSL
- [/] https://yourdomain.com/config.js returns the file (not 404)

## Step 2 — Point app at n8n
- [/] config.js: N8N_BASE_URL = "https://your-n8n-address" (no /webhook, no trailing slash)
- [/] WEBHOOK_PREFIX stays "/webhook"
- [/] All 5 workflows Active in n8n

## Step 3 — CORS
- [/] Each of the 5 Webhook nodes: Options → Allowed Origins (CORS) = site origin (https, no path, no trailing slash)
- [/] Workflow saved and still active

## Step 4 — Test on computer
- [/] Chrome DevTools Network tab open
- [/] Sign in with real Epicor account → Welcome screen
- [/] No CORS error / 404 / "n8n address not configured"
- [/] Purge Hostinger cache + Ctrl+Shift+R if page looks old
- [/] Capture photo → Read document → PO & pack slip appear

## Step 5 — Fix backend (ConfirmFields first)
- [/] ConfirmFields success Respond to Webhook returns { success:true, po_number, vendor_num, pur_point }
- [/] ExistsRcvHead URL points at ExistsRcvHead (not ValidatePONum)
- [/] Verify PO shows green "PO verified" box with supplier number
- [/] CreateReceipts success response no longer references AutoSetToLocation
- [/] OnChangeDtlPOSelected gets real poNum (not "0")
- [/] Error branches return { success:false, error } / { ok:false, message }
- [ ] get-lines
- [ ] commit-lines
- [ ] update front end correct body for commit-lines
- [ ] correct the OCR and Scan barcode function

## Step 6 — Phone test
- [ ] Open in Chrome (Android) / Safari (iPhone) → Add to Home Screen
- [ ] Scan part barcode asks camera permission, opens rear camera
- [ ] Self-host html5-qrcode.min.js if scanner fails to load
- [ ] Bump sw.js VERSION gr-v1 → gr-v2 after uploads

## Step 7 — Security
- [ ] Move Epicor API key + OCR key into n8n credentials
- [ ] Rotate keys if workflows were shared outside the team



Frontend needs to send

{
  "po_number": "30030038",
  "vendor_num": 948,
  "pur_point": "",
  "pack_slip": "TEST-00002",
  "lines": [
    {
      "part_number": "CHEM/IFL3",
      "po_line": 1,
      "po_release": 1,
      "pack_line": 1,
      "received_quantity": 150
    },
    {
      "part_number": "CHEM/DAFK3",
      "po_line": 2,
      "po_release": 1,
      "pack_line": 2,
      "received_quantity": 250
    }
  ]
}
