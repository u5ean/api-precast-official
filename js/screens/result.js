import { h, alertBox } from "../ui.js";
import { state, resetReceipt } from "../state.js";
import { addHistory, clearPending } from "../history.js";
import { go } from "../nav.js";

export function render(root) {
  const r = state.receipt;
  const res = state.receiving.result;
  if (!res) { go("home", { replace: true }); return () => {}; }

  // Record once. Failed attempts are not stored: nothing was received.
  if (!res.recorded && (res.status === "success" || res.status === "unknown")) {
    res.recorded = true;
    addHistory({
      po: r.poNumber, slip: r.packSlipNumber, username: state.session.username,
      status: res.status === "success" ? "received" : "unknown",
      items: Array.isArray(res.lines) ? res.lines.length : state.selectedLines.length,
    });
  }

  const summary = h("dl", { class: "kv" },
    h("dt", {}, "PO"), h("dd", {}, r.poNumber),
    h("dt", {}, "Pack slip"), h("dd", {}, r.packSlipNumber));

  const newBtn = h("button", { class: "btn btn-primary btn-block", type: "button", onclick: () => { resetReceipt(); go("capture"); } }, "Start a new receipt");
  const homeBtn = h("button", { class: "btn btn-secondary btn-block", type: "button", onclick: () => { resetReceipt(); go("home"); } }, "Back to home");
  let body;

  if (res.status === "success") {
    // Shown only after the backend confirmed the final commit. Items come from the
    // server's reply, never from what the operator typed.
    const lines = Array.isArray(res.lines) ? res.lines : null;
    body = [
      h("h1", { class: "page-title" }, "Receipt committed"),
      alertBox("ok", res.message),
      h("div", { class: "card" }, summary,
        h("h2", { class: "card-title" }, "Received items"),
        lines && lines.length
          ? h("ul", { class: "list" }, lines.map((l) => h("li", { class: "list-row" },
              h("div", { class: "grow" },
                h("div", { class: "strong code" }, String(l.part_num ?? "")),
                h("div", { class: "muted small" }, l.po_line != null ? `PO line ${l.po_line}` : "")),
              h("div", { class: "qty" }, String(l.qty ?? "")))))
          : h("p", { class: "muted" }, "The server confirmed the receipt but did not list the lines.")),
      newBtn, homeBtn,
    ];
  } else if (res.status === "unknown") {
    body = [
      h("h1", { class: "page-title" }, "Outcome unknown"),
      alertBox("error",
        h("div", { class: "strong" }, "The app could not confirm whether the receipt was committed."),
        h("p", {}, res.message),
        h("p", {}, "Check the receipt in Epicor before doing anything else. Do not submit again until you have confirmed it was not received.")),
      h("div", { class: "card" }, summary),
      homeBtn,
    ];
  } else {
    body = [
      h("h1", { class: "page-title" }, "Receipt not submitted"),
      alertBox("error", h("div", { class: "strong" }, "Nothing was confirmed as received."), h("p", {}, res.message)),
      res.problems && res.problems.length
        ? h("div", { class: "card" }, h("h2", { class: "card-title" }, "Fix these"), h("ul", { class: "plain" }, res.problems.map((p) => h("li", {}, p))))
        : null,
      h("div", { class: "card" }, summary),
      h("button", { class: "btn btn-primary btn-block", type: "button", onclick: () => { state.receiving.result = null; go("final"); } }, "Back to review"),
      homeBtn,
    ];
  }
  root.append(...body);
  return () => {};
}
