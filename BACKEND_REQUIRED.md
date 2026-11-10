# Backend changes required before receipts can be submitted

The frontend is complete, but the **final submit button is disabled by design**. These are the
confirmed gaps in the n8n workflows. Nothing below is invented behaviour: each item is either
a defect found in the supplied workflows or a contract that does not exist yet.

## Why submission is off

`/get-lines` does not just read lines. It runs `CreateMassReceipts`, `OnChangeDtlPOSelected`,
`ReceiveAll` and `CommitRcvDtl` in one request, and defaults to receiving **every** line when
`receive_all` is omitted. The app therefore cannot show lines for review using that endpoint,
and `/create-receipt` followed by `/get-lines` has an unverified relationship (U5).

## Must fix (blocks the full flow)

| ID | Where | Fix |
|---|---|---|
| U1 | ConfirmFields | Add a success Respond to Webhook node returning at least PONum, VendorNum, PurPoint. Until then the app cannot get supplier info and the Verify step fails closed. |
| U2 | ConfirmFields | The `ExistsRcvHead` node's URL points at `ValidatePONum`. Point it at `ExistsRcvHead`. |
| U4 | CreateReceipts | The success response references a node `AutoSetToLocation` that does not exist. Fix the expression. |
| U5 | CreateReceipts / GetPoLines | Confirm whether `GetNewRcvHeadWithPONum` + `Update` and `CreateMassReceipts` act on the same receipt header. |
| U6 | GetPoLines | Split into (a) a read-only lines lookup and (b) a separate submit. |
| U7 | GetPoLines | `OnChangeDtlPOSelected` is sent `poNum: "0"`. Verify against Epicor. |
| U8 | n/a | Supply the barcode to PartNum mapping (a field or a lookup). Until then scanned codes are treated as part numbers. |
| U9 | GetPoLines | No check that quantity is within the open quantity. Add one server-side. |
| U10, U11 | OCR, Apply Mode | Add error branches that respond with `{success:false,error}` or `{ok:false,message}`. |

## Contract the frontend expects for the two new operations

These are **proposals**. Confirm or change them, then update `js/api.js` to match.

### 1. Read-only PO lines (`PO_LINES_PATH` in `config.js`)

`POST` with `Authorization: Bearer <session>`, query `poNum, packSlip, vendorNum, purPoint`.

```json
{ "ok": true, "lines": [
  { "part_num": "PART001", "po_line": 1, "po_rel": 1, "description": "optional" }
] }
```

The app reads only those fields. It does **not** read or display ordered/open quantities until
verified field names are supplied. It must change no Epicor data.

### 2. Final submit (`SUBMIT_PATH` in `config.js`)

The app already sends the verified `/get-lines` request shape, with `receive_all` always explicit:

```
POST {SUBMIT_PATH}?poNum=..&packSlip=..&vendorNum=..&purPoint=..&receive_all=false
{ "receive_all": false, "lines": [ { "part_num": "PART001", "qty": 5, "po_line": 1 } ] }
```

It treats the response as a success only when `ok === true`, and shows `message` and `lines`
exactly as returned. The backend must respond with `ok: true` only **after** `CommitRcvDtl` succeeds.

## Enabling submission (when the above is done)

1. Set `SUBMIT_PATH` (for example `"/get-lines"`, or your new endpoint) in `config.js`.
2. Set `FEATURES.SUBMIT_ENABLED` to `true`.
3. Optionally set `PO_LINES_PATH`.
4. Test on a Pilot company with real stock before going live.

## Other deployment notes

- U3: `ValidatePONum` is not checked for a meaningful return value. Confirm what Epicor returns for an unknown PO.
- U12: the login webhook uses streaming response mode alongside Respond to Webhook nodes. Confirm the JSON arrives intact.
- U13: capture real request/response samples from Epicor for each call and keep them as fixtures.
- U14: production URLs use `/webhook/...`; test URLs use `/webhook-test/...`. Workflows must be **active** for the former.
- U15: there is no history endpoint. The Home screen's "Recent activity" is stored on the device only.
- Duplicate pack slip detection (`ExistsRcvHead`) only runs in `/create-receipt` today. If `/create-receipt` is not called, duplicates are not checked before commit.
- n8n CORS: set **Allowed Origins** on every webhook node to the frontend's origin, and confirm the browser's preflight (`OPTIONS`) request for the `Authorization` header succeeds.
- Rotate the hardcoded Epicor API key and OCR key inside the workflows into n8n credentials.
