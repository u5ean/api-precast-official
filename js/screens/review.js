import { h, field, alertBox, setBusy, clear, todayLocal } from "../ui.js";
import { state } from "../state.js";
import { confirmFields, createReceiptHeader, loadPoLines, poLinesAvailable } from "../api.js";
import { go } from "../nav.js";
import { hasHeader, setHeader } from "../history.js";

const LABEL = { po_number: "PO number", pack_slip_number: "pack slip number" };

export function render(root) {
  const r = state.receipt;
  if (!r.receiptDate) r.receiptDate = todayLocal();

  const po = field({ id: "po", label: "PO number", value: r.poNumber, inputmode: "numeric", autocapitalize: "none", hint: "Digits only." });
  const slip = field({ id: "slip", label: "Pack slip (DO) number", value: r.packSlipNumber, autocapitalize: "characters", spellcheck: "false" });
  const date = field({ id: "date", label: "Receipt date", type: "date", value: r.receiptDate,
    hint: window.APP_CONFIG.FEATURES.CREATE_HEADER_STEP
      ? "Sent when the receipt header is created."
      : "Not sent: the header step is switched off (FEATURES.CREATE_HEADER_STEP)." });

  const warnBox = h("div", { class: "stack" });
  const resultBox = h("div");
  const errorBox = h("div");
  const verifyBtn = h("button", { class: "btn btn-primary btn-block", type: "button", onclick: verify }, "Verify PO");
  const nextBtn = h("button", { class: "btn btn-primary btn-block btn-lg", type: "button", onclick: next }, "Continue to items");
  const stepWrap = h("div", { class: "stack" });

  const missing = new Set(state.document.missingFields || []);
  const warnEls = {};
  for (const key of ["po_number", "pack_slip_number"]) {
    if (!missing.has(key)) continue;
    warnEls[key] = alertBox("warn", state.document.extracted
      ? `The document reader could not find the ${LABEL[key]}. Enter it from the paper.`
      : `Enter the ${LABEL[key]}.`);
    warnBox.append(warnEls[key]);
  }
  function dropWarning(key, input) {
    if (warnEls[key] && input.value.trim()) { warnEls[key].remove(); delete warnEls[key]; }
  }

  function invalidate(keepLines) {
    r.verified = false;
    if (!keepLines) {
      state.poLines = [];
      state.poLinesStatus = "idle";
      state.selectedLines = [];
    }
    syncVerified();
  }

  po.input.addEventListener("input", () => {
    r.poNumber = po.input.value.trim();
    po.setError("");
    clear(errorBox);
    dropWarning("po_number", po.input);
    invalidate(r.poNumber === r.verifiedPo);
  });
  slip.input.addEventListener("input", () => {
    r.packSlipNumber = slip.input.value.trim();
    slip.setError("");
    dropWarning("pack_slip_number", slip.input);
    invalidate(true);
  });
  date.input.addEventListener("change", () => { r.receiptDate = date.input.value; });

  function syncVerified() {
    clear(resultBox);
    if (r.verified) {
      resultBox.append(h("div", { class: "alert alert-ok", role: "status" },
        h("div", { class: "strong" }, "PO verified"),
        h("dl", { class: "kv" },
          h("dt", {}, "Supplier number"), h("dd", {}, r.vendorNum),
          h("dt", {}, "Purchase point"), h("dd", {}, r.purPoint || "(none)")),
        h("p", { class: "small" }, "The duplicate pack slip check is not confirmed at this step (backend item U2). It runs again when the receipt is submitted.")));
    }
    nextBtn.hidden = !r.verified;
    verifyBtn.hidden = r.verified;
  }

  async function verify() {
    po.setError("");
    slip.setError("");
    const poVal = po.input.value.trim();
    const slipVal = slip.input.value.trim();
    let bad = false;
    if (!poVal) { po.setError("Enter the PO number."); bad = true; }
    else if (!/^\d+$/.test(poVal)) { po.setError("The PO number must be digits only."); bad = true; }
    if (!slipVal) { slip.setError("Enter the DO number."); bad = true; }
    if (bad) return;

    clear(resultBox);
    clear(errorBox);
    setBusy(verifyBtn, true, "Verifying…");
    try {
      const info = await confirmFields(poVal, slipVal);
      r.poNumber = poVal;
      r.packSlipNumber = slipVal;
      r.vendorNum = info.vendorNum;
      r.purPoint = info.purPoint;
      r.verifiedPo = poVal;
      r.verified = true;
      state.poLines = [];
      state.poLinesStatus = "idle";
      state.selectedLines = [];
      syncVerified();
    } catch (err) {
      if (err.kind === "auth") return;
      r.verified = false;
      let shown = false;
      if (err.fields) {
        if (err.fields.po_number) { po.setError(err.fields.po_number); shown = true; }
        if (err.fields.pack_slip_number) { slip.setError(err.fields.pack_slip_number); shown = true; }
      }
      if (!shown) {
        const box = alertBox("error", err.message);
        if (err.kind === "contract" || err.kind === "format" || (err.status && err.status >= 500)) {
          box.append(h("p", { class: "small" }, "Likely cause: the /confirm-fields workflow has no success response yet. See BACKEND_REQUIRED.md, item U1."));
        }
        errorBox.append(box);
      }
      syncVerified();
    } finally {
      setBusy(verifyBtn, false);
    }
  }

  async function next() {
    if (!r.verified) return;
    clear(errorBox);
    if (window.APP_CONFIG.FEATURES.CREATE_HEADER_STEP && !hasHeader(r.poNumber, r.packSlipNumber)) {
      setBusy(nextBtn, true, "Creating receipt…");
      try {
        await createReceiptHeader({ poNum: r.poNumber, packSlip: r.packSlipNumber, vendorNum: r.vendorNum, purPoint: r.purPoint, date: r.receiptDate });
        setHeader(r.poNumber, r.packSlipNumber);
      } catch (herr) {
        if (herr.kind !== "auth") {
          const box = alertBox("error", herr.message);
          errorBox.append(box);
        }
        setBusy(nextBtn, false);
        return;
      }
    }

    if (poLinesAvailable()) {
      setBusy(nextBtn, true, "Loading PO lines…");
      state.poLinesStatus = "loading";
      try {
        state.poLines = await loadPoLines({ poNum: r.poNumber, packSlip: r.packSlipNumber, vendorNum: r.vendorNum, purPoint: r.purPoint });
        state.poLinesStatus = "loaded";
        state.poLinesMessage = "";
      } catch (err) {
        if (err.kind === "auth") {
          setBusy(nextBtn, false);
          return;
        }
        state.poLinesStatus = "error";
        state.poLinesMessage = err.message;
      }
    } else {
      state.poLinesStatus = "unavailable";
    }

    setBusy(nextBtn, false);
    go("lines");
  }

  root.append(
    h("h1", { class: "page-title" }, "Check the details"),
    h("div", { class: "card stack" }, warnBox, po.el, slip.el, date.el, errorBox, resultBox, verifyBtn, nextBtn),
    h("button", { class: "btn btn-quiet btn-block", type: "button", onclick: () => go("capture") }, "Back to document photo"));
  syncVerified();
  return () => {};
}
