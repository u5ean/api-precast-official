import { h, field, alertBox, clear, toast, setBusy } from "../ui.js";
import { state } from "../state.js";
import { loadPoLines, poLinesAvailable } from "../api.js";
import { createScanner } from "../scanner.js";
import { go } from "../nav.js";

const norm = (s) => String(s ?? "").trim().toUpperCase();
const cfg = () => window.APP_CONFIG;

export function render(root) {
  const r = state.receipt;
  const rec = state.receiving;
  let scanner = null;
  let chosen = null; // PO line picked by the operator when a part is on several lines
  let destroyed = false;

  /* ------------------------------ PO line status ------------------------------ */
  const statusBox = h("div");
  const linesList = h("div");

  async function fetchLines() {
    if (!poLinesAvailable()) {
      state.poLinesStatus = "unavailable";
      drawStatus();
      return;
    }
    state.poLinesStatus = "loading";
    drawStatus();
    try {
      state.poLines = await loadPoLines({ poNum: r.poNumber, packSlip: r.packSlipNumber, vendorNum: r.vendorNum, purPoint: r.purPoint });
      state.poLinesStatus = "loaded";
      state.poLinesMessage = "";
    } catch (err) {
      if (err.kind === "auth") return;
      state.poLinesStatus = "error";
      state.poLinesMessage = err.message;
    }
    if (!destroyed) { drawStatus(); drawEntryMode(); }
  }

  function drawStatus() {
    clear(statusBox);
    const st = state.poLinesStatus;
    if (st === "unavailable") {
      statusBox.append(alertBox("warn",
        h("div", { class: "strong" }, "PO lines cannot be loaded yet"),
        h("p", { class: "small" }, "The backend has no read-only line lookup (item U6), and the existing endpoint would receive the whole PO. Parts you add here are marked unverified. The server checks them when the receipt is submitted.")));
    } else if (st === "loading") {
      statusBox.append(alertBox("info", "Loading PO lines…"));
    } else if (st === "error") {
      statusBox.append(alertBox("error", state.poLinesMessage || "PO lines could not be loaded."),
        h("button", { class: "btn btn-secondary", type: "button", onclick: fetchLines }, "Retry loading lines"));
    } else if (st === "loaded") {
      drawLoadedLines();
    }
  }

  function drawLoadedLines() {
    const search = field({ id: "search", label: "Find a part on this PO", autocapitalize: "characters", spellcheck: "false" });
    const results = h("ul", { class: "list" });
    function drawResults() {
      clear(results);
      const q = norm(search.input.value);
      const rows = state.poLines.filter((l) => !q || norm(l.part_num).includes(q) || norm(l.description).includes(q)).slice(0, 50);
      if (!rows.length) results.append(h("li", { class: "empty" }, "No PO line matches."));
      for (const l of rows) {
        results.append(h("li", {},
          h("button", { class: "list-row list-button", type: "button", onclick: () => pickLine(l) },
            h("div", {},
              h("div", { class: "strong code" }, l.part_num),
              l.description ? h("div", { class: "muted small" }, l.description) : null),
            h("div", { class: "muted small" }, `Line ${l.po_line}${l.po_rel ? `, release ${l.po_rel}` : ""}`))));
      }
    }
    search.input.addEventListener("input", drawResults);
    drawResults();
    statusBox.append(h("details", { class: "card details" },
      h("summary", {}, `PO ${r.poNumber} has ${state.poLines.length} line${state.poLines.length === 1 ? "" : "s"}`),
      search.el, results));
  }

  /* ------------------------------- Add an item ------------------------------- */
  const matchBox = h("div");
  const part = field({ id: "part", label: "Part number", autocapitalize: "characters", spellcheck: "false" });
  const poLine = field({ id: "poline", label: "PO line (optional)", inputmode: "numeric", hint: "Only needed if the part is on more than one PO line." });
  const qty = field({ id: "qty", label: "Quantity received", inputmode: "decimal" });
  const scanBtn = h("button", { class: "btn btn-secondary btn-block", type: "button", onclick: toggleScan }, "Scan part barcode");
  const addBtn = h("button", { class: "btn btn-primary btn-block", type: "button", onclick: addItem }, "Add to receipt");
  let scanModal = null;

  function setLocked(l) {
    chosen = l || null;
    const locked = !!l;
    part.input.readOnly = locked;
    part.input.value = locked ? l.part_num : part.input.value;
    poLine.input.readOnly = locked;
    if (locked) poLine.input.value = String(l.po_line);
    if (!locked) poLine.input.value = "";
  }

  function clearSelection() {
    setLocked(null);
    part.input.value = "";
    poLine.input.value = "";
    part.setError("");
    poLine.setError("");
    clear(matchBox);
    part.input.focus();
  }

  function drawEntryMode() {
    const loaded = state.poLinesStatus === "loaded";
    poLine.el.hidden = loaded && !chosen;
    poLine.input.readOnly = !!chosen;
    const label = poLine.el.querySelector("label");
    if (label) label.textContent = (loaded || chosen) ? "PO line" : "PO line (optional)";
  }

  part.input.addEventListener("input", () => {
    if (part.input.readOnly) return;
    chosen = null;
    part.setError("");
    clear(matchBox);
  });

  function pickLine(l) {
    setLocked(l);
    drawEntryMode();
    part.setError("");
    clear(matchBox);
    showMatched(l);
    qty.input.focus();
  }

  function showMatched(l) {
    clear(matchBox);
    matchBox.append(alertBox("ok",
      `Matched PO line ${l.po_line}${l.po_rel ? `, release ${l.po_rel}` : ""}${l.pack_line ? `, pack line ${l.pack_line}` : ""}: `,
      h("span", { class: "code" }, l.part_num), l.description ? ` (${l.description})` : "",
      h("div", { class: "actions" },
        h("button", { class: "btn btn-quiet btn-sm", type: "button", onclick: clearSelection }, "Change part/line"))));
  }

  function resolveEntry() {
    const typed = part.input.value.trim();
    const p = norm(typed);
    if (!p) return { error: "Enter or scan a part number." };

    if (state.poLinesStatus === "loaded") {
      if (!chosen || norm(chosen.part_num) !== p) {
        const matches = state.poLines.filter((l) => norm(l.part_num) === p);
        if (!matches.length) return { error: `${typed} is not on PO ${r.poNumber}. Select a PO line from the list.` };
        if (matches.length === 1) {
          setLocked(matches[0]);
          drawEntryMode();
          showMatched(matches[0]);
          return { part_num: matches[0].part_num, po_line: matches[0].po_line, po_rel: matches[0].po_rel, pack_line: matches[0].pack_line, description: matches[0].description, verified: true };
        }
        return { error: "This part is on several PO lines. Choose the line.", choices: matches };
      }
      return { part_num: chosen.part_num, po_line: chosen.po_line, po_rel: chosen.po_rel, pack_line: chosen.pack_line, description: chosen.description, verified: true };
    }

    let lineNo = null;
    const txt = poLine.input.value.trim();
    if (txt) {
      const n = Number(txt);
      if (!Number.isInteger(n) || n <= 0) return { error: "The PO line must be a whole number above 0.", field: "poline" };
      lineNo = n;
    }
    return { part_num: typed, po_line: lineNo, po_rel: null, pack_line: null, description: "", verified: false };
  }

  function showResolveError(res) {
    clear(matchBox);
    if (res.field === "poline") poLine.setError(res.error);
    else part.setError(res.error);
    if (res.choices) {
      matchBox.append(h("ul", { class: "list" }, res.choices.map((l) => h("li", {},
        h("button", { class: "list-row list-button", type: "button", onclick: () => pickLine(l) },
          h("div", { class: "strong" }, `PO line ${l.po_line}${l.po_rel ? `, release ${l.po_rel}` : ""}`),
          l.description ? h("div", { class: "muted small" }, l.description) : null)))));
    }
  }

  function addItem() {
    part.setError(""); poLine.setError(""); qty.setError("");
    const res = resolveEntry();
    if (res.error) { showResolveError(res); return; }
    const q = Number(qty.input.value.trim().replace(",", "."));
    if (!qty.input.value.trim() || !Number.isFinite(q) || q <= 0) { qty.setError("Enter a quantity above 0."); return; }

    const dupe = state.selectedLines.find((l) => norm(l.part_num) === norm(res.part_num) && (l.po_line ?? null) === (res.po_line ?? null));
    if (dupe) {
      part.setError(`${res.part_num} is already on the list${res.po_line ? ` for line ${res.po_line}` : ""}. Edit its quantity below instead.`);
      return;
    }
    state.selectedLines.push({ id: Date.now() + Math.random(), part_num: res.part_num, po_line: res.po_line, po_rel: res.po_rel, pack_line: res.pack_line, description: res.description, qty: q, verified: res.verified });
    part.input.value = ""; poLine.input.value = ""; qty.input.value = "";
    setLocked(null);
    drawEntryMode();
    clear(matchBox);
    toast(`Added ${res.part_num}`, "ok");
    drawSelected();
    scanBtn.textContent = "Scan next part";
  }

  /* -------------------------------- Scanning -------------------------------- */
  async function toggleScan() {
    if (scanner) { await closeScanner(); return; }
    clear(matchBox);
    const region = h("div", { class: "scanner-mount" });
    const closeBtn = h("button", { class: "btn btn-secondary btn-block", type: "button", onclick: () => closeScanner() }, "Cancel scan");
    scanModal = h("div", { class: "scan-modal", role: "dialog", "aria-label": "Scan part barcode" },
      h("div", { class: "scan-modal-card card stack" },
        h("h2", { class: "card-title" }, "Scan part barcode"),
        region,
        closeBtn));
    document.body.append(scanModal);
    scanner = createScanner(region, { onCode: onScanned });
    scanBtn.textContent = "Cancel scan";
    try {
      await scanner.start();
    } catch (err) {
      await closeScanner();
      matchBox.append(alertBox("error", err.message));
    }
  }

  async function closeScanner() {
    const s = scanner;
    const m = scanModal;
    scanner = null;
    scanModal = null;
    scanBtn.textContent = "Scan part barcode";
    if (s) await s.destroy();
    if (m) m.remove();
  }

  async function onScanned(code) {
    await closeScanner();
    if (destroyed) return;
    setLocked(null);
    part.input.value = code;
    part.setError("");
    clear(matchBox);
    if (state.poLinesStatus === "loaded") {
      const res = resolveEntry();
      if (res.error) showResolveError(res);
      else if (chosen) showMatched(chosen);
    } else {
      matchBox.append(alertBox("info", h("span", { class: "code" }, code), " was scanned. It is used as the part number, so check it is correct. It could not be matched against the PO."));
    }
    qty.input.focus();
  }

  /* ------------------------------- Selected list ------------------------------- */
  const selectedBox = h("div");
  const reviewBtn = h("button", { class: "btn btn-primary btn-block btn-lg", type: "button", onclick: toReview }, "Review receipt");

  function drawSelected() {
    clear(selectedBox);
    const n = state.selectedLines.length;
    reviewBtn.disabled = n === 0;
    reviewBtn.textContent = n ? `Review receipt (${n} item${n === 1 ? "" : "s"})` : "Review receipt";
    selectedBox.append(h("h2", { class: "card-title" }, "Items on this receipt"));
    if (!n) { selectedBox.append(h("p", { class: "empty" }, "Nothing added yet. Scan or type a part, enter the quantity, then add it.")); return; }
    selectedBox.append(h("ul", { class: "list" }, state.selectedLines.map((l) => {
      const q = h("input", { class: "input input-qty", type: "text", inputmode: "decimal", value: String(l.qty), "aria-label": `Quantity for ${l.part_num}` });
      q.addEventListener("change", () => {
        const v = Number(q.value.trim().replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) { toast("Quantity must be above 0.", "error"); q.value = String(l.qty); return; }
        l.qty = v;
      });
      return h("li", { class: "list-row" },
        h("div", { class: "grow" },
          h("div", { class: "strong code" }, l.part_num),
          h("div", { class: "muted small" }, [
            l.po_line ? `PO line ${l.po_line}` : "PO line not set",
            l.po_rel ? `, release ${l.po_rel}` : "",
            l.pack_line ? `, pack line ${l.pack_line}` : "",
          ].join("")),
          l.verified ? null : h("span", { class: "badge badge-unknown" }, "Unverified")),
        q,
        h("button", { class: "btn btn-quiet btn-sm", type: "button", "aria-label": `Remove ${l.part_num}`,
          onclick: () => { state.selectedLines = state.selectedLines.filter((x) => x.id !== l.id); drawSelected(); } }, "Remove"));
    })));
  }

  function toReview() {
    if (rec.mode === "partial" && !state.selectedLines.length) return;
    go("final");
  }

  /* ---------------------------------- Mode ---------------------------------- */
  const addCard = h("div", { class: "card stack" },
    h("h2", { class: "card-title" }, "Add an item"),
    scanBtn, matchBox, part.el, poLine.el, qty.el, addBtn);
  const selectedCard = h("div", { class: "card" }, selectedBox);
  const modeBox = h("div");

  function drawMode() {
    clear(modeBox);
    if (cfg().FEATURES.ALLOW_FULL_RECEIPT) {
      modeBox.append(h("div", { class: "card stack" },
        h("div", { class: "segmented", role: "group", "aria-label": "Receiving mode" },
          h("button", { type: "button", class: rec.mode === "partial" ? "on" : "", onclick: () => { rec.mode = "partial"; drawMode(); applyMode(); } }, "Partial"),
          h("button", { type: "button", class: rec.mode === "full" ? "on" : "", onclick: () => { rec.mode = "full"; drawMode(); applyMode(); } }, "Full PO")),
        rec.mode === "full" ? alertBox("warn", "Full receipt receives every open PO line. Quantities come from Epicor, not from you, and you cannot review them first.") : null));
    }
  }
  function applyMode() {
    const full = rec.mode === "full";
    addCard.hidden = full;
    selectedCard.hidden = full;
    reviewBtn.disabled = full ? false : state.selectedLines.length === 0;
  }

  root.append(
    h("h1", { class: "page-title" }, "Items received"),
    h("div", { class: "card" },
      h("dl", { class: "kv" },
        h("dt", {}, "PO"), h("dd", {}, r.poNumber),
        h("dt", {}, "Pack slip"), h("dd", {}, r.packSlipNumber),
        h("dt", {}, "Supplier"), h("dd", {}, r.vendorNum))),
    statusBox, modeBox, addCard, selectedCard, reviewBtn,
    h("button", { class: "btn btn-quiet btn-block", type: "button", onclick: () => go("review") }, "Back to details"));

  drawMode();
  drawEntryMode();
  drawSelected();
  applyMode();
  if (state.poLinesStatus === "idle") fetchLines(); else drawStatus();
  drawEntryMode();

  return () => { destroyed = true; closeScanner(); };
}
