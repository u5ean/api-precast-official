// Reusable barcode scanner built on html5-qrcode 2.3.8 (loaded from CDN in index.html).
// Starts the rear camera, reports ONE raw value, then stops itself so a code cannot be
// processed twice. Callers decide what the value means; nothing is guessed here.

import { h } from "./ui.js";

export class ScannerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function translate(err) {
  const name = err && err.name ? err.name : "";
  const msg = String((err && err.message) || err || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /permission/i.test(msg)) {
    return new ScannerError("denied", "Camera permission was denied. Allow camera access in your browser settings, or type the part number instead.");
  }
  if (name === "NotFoundError" || /no cameras|requested device not found/i.test(msg)) {
    return new ScannerError("nocamera", "No camera was found on this device. Type the part number instead.");
  }
  if (name === "NotReadableError") {
    return new ScannerError("busy", "The camera is in use by another app. Close it and try again.");
  }
  return new ScannerError("failed", "The camera could not start. Type the part number instead.");
}

export function createScanner(mountEl, { onCode }) {
  const id = "scanner-" + Math.random().toString(36).slice(2, 8);
  const region = h("div", { id, class: "scanner-region" });
  mountEl.append(region);
  let qr = null;
  let running = false;
  let handled = false;

  async function stop() {
    const q = qr;
    qr = null;
    if (!q) return;
    try {
      if (running) await q.stop();
      q.clear();
    } catch (_) { /* already stopped */ }
    running = false;
  }

  async function start() {
    if (running) return;
    if (!window.isSecureContext) {
      throw new ScannerError("insecure", "Camera scanning needs HTTPS. Open the app over a secure address.");
    }
    if (!window.Html5Qrcode) {
      throw new ScannerError("unavailable", "The scanner library did not load. Check the connection, or type the part number instead.");
    }
    const F = window.Html5QrcodeSupportedFormats || {};
    const formats = ["QR_CODE", "CODE_128", "CODE_39", "CODE_93", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF", "DATA_MATRIX"]
      .map((n) => F[n])
      .filter((v) => v !== undefined);
    handled = false;
    qr = new window.Html5Qrcode(id, { formatsToSupport: formats.length ? formats : undefined, verbose: false });
    try {
      await qr.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (vw, vh) => ({
            width: Math.max(50, Math.floor(vw * 0.85)),
            height: Math.max(50, Math.floor(Math.min(vh * 0.6, 220))),
          }),
        },
        (text) => {
          const value = String(text || "").trim();
          if (handled || !value) return;
          handled = true; // blocks duplicate decodes while the camera shuts down
          stop().finally(() => onCode(value));
        },
        () => { /* per-frame "no code found" noise */ }
      );
      running = true;
    } catch (err) {
      qr = null;
      running = false;
      throw translate(err);
    }
  }

  async function destroy() {
    await stop();
    region.remove();
  }

  return { start, stop, destroy, get running() { return running; } };
}
