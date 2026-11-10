import { h, alertBox, clear } from "../ui.js";
import { state } from "../state.js";
import { submitReceipt, submitAvailability } from "../api.js";
import { getPending, setPending, clearPending, hasHeader, setHeader, clearHeader } from "../history.js";
import { go } from "../nav.js";

export function render(root) {
  const r = state.receipt;
  const rec = state.receiving;
  const avail = submitAvailability();
  const pending = getPending(r.poNumber, r.packSlipNumber);

  const isFull = rec.mode === "full";
  const confirm = h("input", { type: "checkbox", id: "confirm" });
  const pendingConfirm = h("input", { type: "checkbox", id: "pending-confirm" });
  const submitBtn = h("button", { class: "btn btn-primary btn-block btn-lg", type: "button", onclick: submit }, "Submit receipt");
  const backBtn = h("button", { class: "btn btn-secondary btn-block", type: "button", onclick: () => go("lines") }, "Back to items");

  function sync() {
    const ready = avail.ok && confirm.checked && (!pending || pendingConfirm.checked) && !rec.submitting;
    submitBtn.disabled = !ready;
    backBtn.disabled = rec.submitting;
    confirm.disabled = rec.submitting;
    submitBtn.textContent = rec.submitting ? "Submitting… do not close this page" : "Submit receipt";
  }
  confirm.addEventListener("change", sync);
  pendingConfirm.addEventListener("change", sync);

  async function submit() {
    if (rec.submitting || submitBtn.disabled) return; // blocks double taps
    rec.submitting = true;
    sync();
    // Recorded BEFORE the call so an interrupted request is never silently repeated.
    setPending(r.poNumber, r.packSlipNumber, { username: state.session.username });
    try {
      const res = await submitReceipt({
        poNum: r.poNumber, packSlip: r.packSlipNumber, vendorNum: r.vendorNum, purPoint: r.purPoint,
        mode: rec.mode, lines: state.selectedLines,
      });
      clearPending(r.poNumber, r.packSlipNumber);
      clearHeader(r.poNumber, r.packSlipNumber);
      rec.result = { status: "success", ...res };
    } catch (err) {
      if (err.kind === "auth") { rec.submitting = false; clearPending(r.poNumber, r.packSlipNumber); return; }
      if (err.kind === "disabled" || err.kind === "config") {
        clearPending(r.poNumber, r.packSlipNumber);
        rec.result = { status: "failed", message: err.message, problems: null };
      } else if (err.outcomeUnknown) {
        rec.result = { status: "unknown", message: err.message };
      } else {
        clearPending(r.poNumber, r.packSlipNumber);
        rec.result = { status: "failed", message: err.message, problems: err.problems };
      }
    }
    rec.submitting = false;
    go("result");
  }

  const items = isFull
    ? h("p", { class: "strong" }, "All open PO lines (quantities set by Epicor)")
    : h("ul", { class: "list" }, state.selectedLines.map((l) => h("li", { class: "list-row" },
        h("div", { class: "grow" },
          h("div", { class: "strong code" }, l.part_num),
          h("div", { class: "muted small" }, [
            l.po_line ? `PO line ${l.po_line}` : "PO line not set",
            l.po_rel ? `, release ${l.po_rel}` : "",
            l.pack_line ? `, pack line ${l.pack_line}` : "",
          ].join("")),
          l.verified ? null : h("span", { class: "badge badge-unknown" }, "Unverified")),
        h("div", { class: "qty" }, String(l.qty)))));

  const gate = h("div", { class: "stack" });
  if (!avail.ok) {
    gate.append(alertBox("warn",
      h("div", { class: "strong" }, "Submission is disabled"),
      h("ul", { class: "plain" }, avail.reasons.map((x) => h("li", {}, x))),
      h("p", { class: "small" }, "It stays off until the backend can load PO lines safely and commit after review. See BACKEND_REQUIRED.md.")));
  }
  if (window.APP_CONFIG.FEATURES.CREATE_HEADER_STEP && hasHeader(r.poNumber, r.packSlipNumber)) {
    gate.append(alertBox("info", "A receipt header for this pack slip was already created from this device. It will be reused, not created again."));
  }
  if (pending) {
    gate.append(alertBox("error",
      h("div", { class: "strong" }, "A previous submission for this PO and pack slip may have gone through"),
      h("p", { class: "small" }, "Check the receipt in Epicor first. Submitting again could receive the goods twice."),
      h("label", { class: "check" }, pendingConfirm, h("span", {}, "I checked Epicor and this pack slip was not received."))));
  }

  root.append(
    h("h1", { class: "page-title" }, "Review and confirm"),
    h("div", { class: "card" },
      h("dl", { class: "kv" },
        h("dt", {}, "PO"), h("dd", {}, r.poNumber),
        h("dt", {}, "Pack slip"), h("dd", {}, r.packSlipNumber),
        h("dt", {}, "Supplier"), h("dd", {}, r.vendorNum),
        h("dt", {}, "Purchase point"), h("dd", {}, r.purPoint || "(none)"),
        h("dt", {}, "Receipt date"), h("dd", {}, r.receiptDate),
        h("dt", {}, "Mode"), h("dd", {}, isFull ? "Full PO" : "Partial"))),
    h("div", { class: "card" }, h("h2", { class: "card-title" }, "Items"), items),
    gate,
    h("div", { class: "card stack" },
      h("label", { class: "check" }, confirm, h("span", {}, "These items and quantities match the goods I counted.")),
      submitBtn, backBtn));
  sync();
  return () => {};
}
