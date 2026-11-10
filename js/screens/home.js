import { h, formatDateTime } from "../ui.js";
import { state, resetReceipt } from "../state.js";
import { getHistory } from "../history.js";
import { go } from "../nav.js";

const STATUS_LABEL = { received: "Received", unknown: "Outcome unknown", failed: "Failed" };

export function render(root) {
  const s = state.session;
  const history = getHistory();

  const startBtn = h("button", {
    class: "btn btn-primary btn-block btn-lg",
    type: "button",
    onclick: () => { resetReceipt(); go("capture"); },
  }, "New goods receipt");

  const installSlot = h("div");
  if (window.__installPrompt) {
    installSlot.append(h("button", {
      class: "btn btn-quiet btn-block",
      type: "button",
      onclick: async () => {
        const p = window.__installPrompt;
        window.__installPrompt = null;
        installSlot.replaceChildren();
        try { await p.prompt(); } catch (_) {}
      },
    }, "Install app on this device"));
  }

  const expires = s.expiresAt ? formatDateTime(s.expiresAt) : "";

  root.append(
    h("h1", { class: "page-title" }, `Welcome, ${s.username || "operator"}`),
    h("div", { class: "card stack" }, startBtn, installSlot),
    h("section", { class: "card" },
      h("h2", { class: "card-title" }, "Session"),
      h("p", { class: "muted" },
        expires ? `Signed in until about ${expires}. ` : "Signed in. ",
        "This is checked against the server on each request. If it has expired you will be asked to sign in again.")),
    h("section", { class: "card" },
      h("h2", { class: "card-title" }, "Recent activity"),
      h("p", { class: "muted small" }, "Saved on this device only. It is not a record from Epicor and does not include receipts made elsewhere."),
      history.length === 0
        ? h("p", { class: "empty" }, "No receipts yet. Start a new goods receipt above.")
        : h("ul", { class: "list" }, history.map((e) => h("li", { class: "list-row" },
            h("div", {},
              h("div", { class: "strong" }, `PO ${e.po}`),
              h("div", { class: "muted small" }, `Pack slip ${e.slip}`),
              h("div", { class: "muted small" }, formatDateTime(e.ts))),
            h("span", { class: "badge badge-" + e.status }, STATUS_LABEL[e.status] || e.status))))));
  return () => {};
}
