// Local-device storage only. Receipt history here is NOT authoritative: the backend
// exposes no history endpoint (U15). The "pending" markers protect against double
// receipts when a submit's outcome is unknown.

const HISTORY_KEY = "gr_history_v1";
const PENDING_KEY = "gr_pending_v1";
const HEADER_KEY = "gr_headers_v1";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

export const getHistory = () => read(HISTORY_KEY, []);

export function addHistory(entry) {
  const list = getHistory();
  list.unshift({ ...entry, ts: new Date().toISOString() });
  write(HISTORY_KEY, list.slice(0, 20));
}

const keyOf = (po, slip) => `${po}|${slip}`;
export const getPending = (po, slip) => read(PENDING_KEY, {})[keyOf(po, slip)] || null;

export function setPending(po, slip, info = {}) {
  const map = read(PENDING_KEY, {});
  map[keyOf(po, slip)] = { ...info, ts: new Date().toISOString() };
  write(PENDING_KEY, map);
}

export function clearPending(po, slip) {
  const map = read(PENDING_KEY, {});
  delete map[keyOf(po, slip)];
  write(PENDING_KEY, map);
}

// Receipt headers this device has already created, so a retry after a failed second
// step reuses the header instead of tripping the duplicate pack slip check.
export const hasHeader = (po, slip) => !!read(HEADER_KEY, {})[keyOf(po, slip)];

export function setHeader(po, slip) {
  const map = read(HEADER_KEY, {});
  map[keyOf(po, slip)] = new Date().toISOString();
  write(HEADER_KEY, map);
}

export function clearHeader(po, slip) {
  const map = read(HEADER_KEY, {});
  delete map[keyOf(po, slip)];
  write(HEADER_KEY, map);
}
  