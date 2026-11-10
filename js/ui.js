// Tiny DOM helpers. All text goes through text nodes (no innerHTML), so scanned or
// OCR'd values can never inject markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function field({ id, label, value = "", type = "text", hint, ...attrs }) {
  const input = h("input", { id, type, value, class: "input", autocomplete: "off", ...attrs });
  const err = h("div", { class: "field-error", id: id + "-err", role: "alert", hidden: true });
  const hintEl = hint ? h("div", { class: "field-hint", id: id + "-hint" }, hint) : null;
  const el = h("div", { class: "field" }, h("label", { for: id }, label), input, hintEl, err);
  function setError(msg) {
    err.textContent = msg || "";
    err.hidden = !msg;
    el.classList.toggle("has-error", !!msg);
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) input.setAttribute("aria-describedby", id + "-err");
    else input.removeAttribute("aria-describedby");
  }
  return { el, input, setError };
}

export function alertBox(kind, ...content) {
  return h("div", { class: "alert alert-" + kind, role: kind === "error" ? "alert" : "status" }, ...content);
}

export function setBusy(btn, busy, busyLabel) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.classList.add("is-busy");
    if (busyLabel) btn.textContent = busyLabel;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}

let toastTimer = null;
export function toast(message, kind = "info") {
  let t = document.getElementById("toast");
  if (!t) {
    t = h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(t);
  }
  t.textContent = message;
  t.className = "toast show toast-" + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4500);
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
