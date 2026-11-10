// Centralised application state. Only the session is persisted (sessionStorage).

const SESSION_KEY = "gr_session";

export const state = {
  session: { sessionId: null, username: null, expiresAt: null },
  receipt: {
    poNumber: "",
    packSlipNumber: "",
    vendorNum: null,
    purPoint: null,
    receiptDate: "",
    verified: false,
    verifiedPo: null,
  },
  document: { file: null, previewUrl: null, extracted: null, missingFields: [] },
  poLines: [],
  poLinesStatus: "idle", // idle | loading | loaded | unavailable | error
  poLinesMessage: "",
  selectedLines: [],
  receiving: { mode: "partial", submitting: false, result: null },
};

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !s.sessionId) return;
    if (s.expiresAt && Date.parse(s.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    state.session = { sessionId: s.sessionId, username: s.username || null, expiresAt: s.expiresAt || null };
  } catch (_) { /* storage unavailable: user simply signs in again */ }
}

export function saveSession({ sessionId, username, expiresAt }) {
  state.session = { sessionId, username, expiresAt };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session)); } catch (_) {}
}

export function resetReceipt() {
  if (state.document.previewUrl) {
    try { URL.revokeObjectURL(state.document.previewUrl); } catch (_) {}
  }
  Object.assign(state.receipt, {
    poNumber: "", packSlipNumber: "", vendorNum: null, purPoint: null,
    receiptDate: "", verified: false, verifiedPo: null,
  });
  Object.assign(state.document, { file: null, previewUrl: null, extracted: null, missingFields: [] });
  state.poLines = [];
  state.poLinesStatus = "idle";
  state.poLinesMessage = "";
  state.selectedLines = [];
  Object.assign(state.receiving, { mode: "partial", submitting: false, result: null });
}

export function clearSession() {
  state.session = { sessionId: null, username: null, expiresAt: null };
  resetReceipt();
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
}
