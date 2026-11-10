import { state, loadSession, clearSession, resetReceipt } from "./state.js";
import { h, clear, toast } from "./ui.js";
import { go } from "./nav.js";
import * as login from "./screens/login.js";
import * as home from "./screens/home.js";
import * as capture from "./screens/capture.js";
import * as review from "./screens/review.js";
import * as lines from "./screens/lines.js";
import * as final from "./screens/final.js";
import * as result from "./screens/result.js";

const routes = { login, home, capture, review, lines, final, result };
const FLOW = [["capture", "Document"], ["review", "Details"], ["lines", "Items"], ["final", "Confirm"]];

loadSession();

const app = document.getElementById("app");
let cleanup = null;
let kickedOut = false;

// Prerequisite checks so deep links and the Back button cannot skip a step.
function guard(name) {
  if (!state.session.sessionId) return name === "login" ? name : "login";
  if (name === "login") return "home";
  if (!routes[name]) return "home";
  if (name === "lines" && !state.receipt.verified) return "review";
  if (name === "final") {
    if (!state.receipt.verified) return "review";
    if (state.receiving.mode === "partial" && state.selectedLines.length === 0 && !state.receiving.result) return "lines";
  }
  if (name === "result" && !state.receiving.result) return "home";
  return name;
}

function currentRoute() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m ? m[1] : null;
}

function shell(name) {
  const signedIn = !!state.session.sessionId;
  const header = h("header", { class: "app-header" },
    h("div", { class: "bar" },
      h("span", { class: "brand" }, "Goods receiving"),
      signedIn ? h("span", { class: "user", title: "Signed in as" }, state.session.username || "") : null));

  const main = h("main", { class: "app-main", id: "main", tabindex: "-1" });

  let steps = null;
  const idx = FLOW.findIndex(([k]) => k === name);
  if (idx >= 0) {
    steps = h("ol", { class: "steps", "aria-label": "Receipt steps" }, FLOW.map(([, label], i) =>
      h("li", { class: i === idx ? "current" : i < idx ? "done" : "", "aria-current": i === idx ? "step" : null }, label)));
  }

  const nav = signedIn
    ? h("nav", { class: "bottom-nav", "aria-label": "Main" },
        h("button", { type: "button", class: name === "home" ? "on" : "", onclick: () => go("home") }, "Home"),
        h("button", { type: "button", class: idx >= 0 ? "on" : "", onclick: () => { if (state.receiving.submitting) return; resetReceipt(); go("capture"); } }, "New receipt"),
        h("button", { type: "button", onclick: signOut }, "Sign out"))
    : null;

  clear(app);
  app.append(...[header, steps, main, nav].filter(Boolean));
  return main;
}

function signOut() {
  if (state.receiving.submitting) { toast("Wait for the submission to finish first.", "error"); return; }
  clearSession(); // no backend logout endpoint exists; the session simply expires server-side
  go("login");
}

function renderRoute() {
  if (cleanup) { try { cleanup(); } catch (_) {} cleanup = null; }
  const wanted = currentRoute();
  const name = guard(wanted || "home");
  if (name !== wanted) { go(name, { replace: true }); return; }
  const main = shell(name);
  const t = document.getElementById("toast");
  if (t) t.classList.remove("show");
  cleanup = routes[name].render(main) || null;
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

window.addEventListener("hashchange", renderRoute);

window.addEventListener("gr:unauthorized", () => {
  if (kickedOut) return;
  kickedOut = true;
  toast("Your session expired. Sign in again.", "error");
  go("login");
  setTimeout(() => { kickedOut = false; }, 500);
});

window.addEventListener("beforeunload", (e) => {
  if (state.receiving.submitting || (state.selectedLines.length && !state.receiving.result)) {
    e.preventDefault();
    e.returnValue = "";
  }
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__installPrompt = e;
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

renderRoute();
