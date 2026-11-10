// API layer for the n8n webhooks. This is the ONLY module that talks to the network.
//
// Response conventions differ per workflow ({success,error|errors} vs {ok,message,problems}),
// so everything is normalised into ApiError here.
//
// Verified contracts: login, document, confirm-fields (errors only), create-receipt,
// get-lines. PROVISIONAL (marked below): confirm-fields success, PO lines lookup.

import { state, clearSession } from "./state.js";

const cfg = () => window.APP_CONFIG;

export class ApiError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status ?? null;
    this.kind = opts.kind || "server"; // server | auth | network | timeout | format | contract | config | disabled
    this.fields = opts.fields || null; // {po_number: "...", pack_slip_number: "..."}
    this.problems = opts.problems || null; // string[]
    this.body = opts.body ?? null;
    this.outcomeUnknown = !!opts.outcomeUnknown; // true when a commit MAY have happened
  }
}

function buildUrl(path, query) {
  const c = cfg();
  const base = String(c.N8N_BASE_URL || "").replace(/\/+$/, "");
  if (!base || base.includes("YOUR-N8N-DOMAIN")) {
    throw new ApiError("The n8n address is not configured. Set N8N_BASE_URL in config.js.", { kind: "config" });
  }
  const url = base + (c.WEBHOOK_PREFIX || "") + path;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? url + "?" + s : url;
}

function messageFrom(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.message === "string" && data.message) return data.message;
  if (typeof data.error === "string" && data.error) return data.error;
  if (data.errors && typeof data.errors === "object") {
    const first = Object.values(data.errors).find((v) => typeof v === "string");
    if (first) return first;
  }
  return "";
}

function send({ path, query, json, form, auth = true, timeoutMs, onUploadProgress, outcomeSensitive = false }) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = buildUrl(path, query); } catch (e) { reject(e); return; }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs || cfg().TIMEOUTS_MS.default;
    xhr.responseType = "text";
    xhr.setRequestHeader("Accept", "application/json");

    if (auth) {
      if (!state.session.sessionId) {
        reject(new ApiError("You are signed out. Sign in again.", { kind: "auth", status: 401 }));
        return;
      }
      xhr.setRequestHeader("Authorization", "Bearer " + state.session.sessionId);
    }

    let body;
    if (form) {
      body = form; // browser sets multipart boundary
    } else {
      xhr.setRequestHeader("Content-Type", "application/json");
      body = JSON.stringify(json ?? {});
    }

    if (onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onUploadProgress(e.loaded / e.total); };
    }

    xhr.onload = () => {
      const status = xhr.status;
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) { data = null; }

      if (status === 401 && auth) {
        clearSession();
        window.dispatchEvent(new CustomEvent("gr:unauthorized"));
        reject(new ApiError(messageFrom(data) || "Session expired. Sign in again.", { status, kind: "auth", body: data }));
        return;
      }
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        const ok2xx = status >= 200 && status < 300;
        reject(new ApiError(
          ok2xx ? "The server returned an empty or unreadable response." : `The server returned an error (${status}).`,
          { status, kind: "format", outcomeUnknown: outcomeSensitive && (ok2xx || status >= 500) }
        ));
        return;
      }
      const flag = data.ok !== undefined ? data.ok : data.success;
      if (status < 200 || status >= 300 || flag === false) {
        reject(new ApiError(messageFrom(data) || `Request failed (${status}).`, {
          status,
          kind: "server",
          body: data,
          fields: data.errors && typeof data.errors === "object" ? data.errors : null,
          problems: Array.isArray(data.problems) ? data.problems : null,
          outcomeUnknown: outcomeSensitive && status >= 500,
        }));
        return;
      }
      resolve({ status, data });
    };
    xhr.onerror = () => reject(new ApiError("Could not reach the server. Check the connection and try again.", { kind: "network", outcomeUnknown: outcomeSensitive }));
    xhr.ontimeout = () => reject(new ApiError("The server took too long to respond.", { kind: "timeout", outcomeUnknown: outcomeSensitive }));
    xhr.onabort = () => reject(new ApiError("The request was cancelled.", { kind: "network", outcomeUnknown: outcomeSensitive }));
    xhr.send(body);
  });
}

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

/* ------------------------------- Login ------------------------------- */
export async function login(username, password) {
  const { data } = await send({ path: cfg().LOGIN_PATH, json: { username, password }, auth: false });
  if (data.success !== true || !data.session_id) {
    throw new ApiError(data.error || data.message || "Invalid username or password", { kind: "server", body: data });
  }
  return { sessionId: data.session_id, expires_at: data.expires_at || null };
}

/* ------------------------- Document OCR (/document) ------------------------- */
export async function extractDocument(file, onProgress) {
  const form = new FormData();
  form.append("image", file, file.name || "delivery-order.jpg"); // field name must be exactly "image"
  const { data } = await send({
    path: cfg().DOCUMENT_PATH,
    form,
    timeoutMs: cfg().TIMEOUTS_MS.document,
    onUploadProgress: onProgress,
  });
  if (data.success !== true || !data.extracted || typeof data.extracted !== "object") {
    throw new ApiError("The document reader returned an unexpected response.", { kind: "contract", body: data });
  }
  const po = clean(data.extracted.po_number);
  const slip = clean(data.extracted.pack_slip_number);
  const missing = [];
  if (!po) missing.push("po_number");
  if (!slip) missing.push("pack_slip_number");
  return { po_number: po, pack_slip_number: slip, missing_fields: missing };
}

/* ----------------------- PO validation (/confirm-fields) ----------------------- */
// PROVISIONAL (U1): the workflow has no success response yet. This parser accepts the
// verified Epicor names (VendorNum, PurPoint) or snake_case/camelCase twins, at the top
// level or under "po". If they are absent it FAILS CLOSED rather than guessing.
function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

export async function confirmFields(poNumber, packSlipNumber) {
  const { data } = await send({
    path: cfg().CONFIRM_FIELDS_PATH,
    json: { po_number: poNumber, pack_slip_number: packSlipNumber },
  });
  const sources = [data, data.po, data.po_info].filter((s) => s && typeof s === "object");
  let vendor, pur;
  for (const s of sources) {
    if (vendor === undefined) vendor = pick(s, ["vendor_num", "vendorNum", "VendorNum"]);
    if (pur === undefined) pur = pick(s, ["pur_point", "purPoint", "PurPoint"]);
  }
  if (vendor === undefined || pur === undefined) {
    throw new ApiError(
      "The PO was accepted, but the server did not return the supplier number and purchase point. This is a known backend gap (U1).",
      { kind: "contract", body: data }
    );
  }
  return { vendorNum: String(vendor), purPoint: String(pur) };
}

/* ------------------------- Receipt header (/create-receipt) ------------------------- */
// Disabled by default (U5). Present so the integration is ready once verified.
export async function createReceiptHeader({ poNum, packSlip, vendorNum, purPoint, date }) {
  if (!cfg().FEATURES.CREATE_HEADER_STEP) {
    throw new ApiError("Receipt header creation is switched off in config.js (FEATURES.CREATE_HEADER_STEP).", { kind: "disabled" });
  }
  const { data } = await send({
    path: cfg().CREATE_RECEIPT_PATH,
    query: { poNum, packSlip, vendorNum, purPoint },
    json: date ? { date } : {},
    outcomeSensitive: true,
  });
  if (data.ok !== true) {
    throw new ApiError("The server did not confirm that the receipt header was created.", { kind: "contract", body: data, outcomeUnknown: true });
  }
  return data;
}

/* ----------------------------- PO lines (read-only) ----------------------------- */
export const poLinesAvailable = () => !!cfg().PO_LINES_PATH;

// PROVISIONAL (U6): no read-only endpoint exists. If one is configured, it must return
// {lines:[...]} with part number and PO line. Quantities are intentionally NOT read.
export async function loadPoLines({ poNum, packSlip, vendorNum, purPoint }) {
  if (!poLinesAvailable()) {
    throw new ApiError("No read-only PO line endpoint is configured (backend item U6).", { kind: "disabled" });
  }
  const { data } = await send({
    path: cfg().PO_LINES_PATH,
    query: { poNum, packSlip, vendorNum, purPoint },
    json: {},
  });
  const raw = Array.isArray(data.lines) ? data.lines : null;
  if (!raw) throw new ApiError("The PO line response had no 'lines' list.", { kind: "contract", body: data });
  const lines = [];
  for (const r of raw) {
    const part = clean(pick(r, ["part_num", "PartNum"]));
    const lineNo = Number(pick(r, ["po_line", "POLine"]));
    if (!part || !Number.isInteger(lineNo)) continue;
    const rel = pick(r, ["po_rel", "PORelNum"]);
    lines.push({
      key: `${lineNo}-${rel ?? 0}`,
      part_num: part,
      po_line: lineNo,
      po_rel: rel === undefined ? null : Number(rel),
      description: clean(pick(r, ["description", "LineDesc"])),
    });
  }
  if (!lines.length) throw new ApiError("The server returned no usable PO lines.", { kind: "contract", body: data });
  return lines;
}

/* ------------------------------- Final submission ------------------------------- */
export function submitAvailability() {
  const c = cfg();
  const reasons = [];
  if (!c.FEATURES.SUBMIT_ENABLED) reasons.push("Submission is switched off (FEATURES.SUBMIT_ENABLED in config.js).");
  if (!c.SUBMIT_PATH) reasons.push("No submission endpoint is configured (SUBMIT_PATH in config.js).");
  return { ok: reasons.length === 0, reasons };
}

// Uses the verified /get-lines request shape. receive_all is ALWAYS sent explicitly,
// because the backend defaults to receiving every line when it is omitted.
export async function submitReceipt({ poNum, packSlip, vendorNum, purPoint, mode, lines }) {
  const avail = submitAvailability();
  if (!avail.ok) throw new ApiError(avail.reasons.join(" "), { kind: "disabled" });

  let query, json;
  if (mode === "partial") {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new ApiError("Add at least one part before submitting.", { kind: "disabled" });
    }
    for (const l of lines) {
      if (!l.part_num || !(Number(l.qty) > 0)) {
        throw new ApiError(`Line ${l.part_num || "(no part)"} needs a quantity above 0.`, { kind: "disabled" });
      }
    }
    query = { poNum, packSlip, vendorNum, purPoint, receive_all: "false" };
    json = {
      receive_all: false,
      lines: lines.map((l) => {
        const out = { part_num: l.part_num, qty: Number(l.qty) };
        if (l.po_line !== null && l.po_line !== undefined && l.po_line !== "") out.po_line = Number(l.po_line);
        return out;
      }),
    };
  } else if (mode === "full") {
    if (!cfg().FEATURES.ALLOW_FULL_RECEIPT) {
      throw new ApiError("Full receipt is switched off (FEATURES.ALLOW_FULL_RECEIPT).", { kind: "disabled" });
    }
    query = { poNum, packSlip, vendorNum, purPoint, receive_all: "true" };
    json = { receive_all: true };
  } else {
    throw new ApiError("Unknown receiving mode.", { kind: "disabled" });
  }

  const { data } = await send({
    path: cfg().SUBMIT_PATH,
    query,
    json,
    timeoutMs: cfg().TIMEOUTS_MS.submit,
    outcomeSensitive: true,
  });
  if (data.ok !== true) {
    throw new ApiError("The server response did not confirm the receipt.", { kind: "contract", body: data, outcomeUnknown: true });
  }
  return {
    message: data.message || "Receipt committed.",
    receiveAll: !!data.receive_all,
    lines: Array.isArray(data.lines) ? data.lines : null,
    rcvDtlCount: Array.isArray(data.rcvDtl) ? data.rcvDtl.length : null,
  };
}
