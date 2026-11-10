import { h, alertBox, clear } from "../ui.js";
import { state } from "../state.js";
import { extractDocument } from "../api.js";
import { prepareImage } from "../image.js";
import { go } from "../nav.js";

export function render(root) {
  let busy = false;
  const doc = state.document;

  const message = h("div");
  const previewBox = h("div", { class: "preview", hidden: true });
  const previewImg = h("img", { alt: "Delivery order photo preview" });
  previewBox.append(previewImg);

  const progressBox = h("div", { class: "progress-box", hidden: true });
  const progressLabel = h("div", { class: "small" });
  const progress = h("progress", { max: "1", value: "0" });
  progressBox.append(progressLabel, progress);

  const camInput = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, "aria-hidden": "true", tabindex: "-1" });
  const fileInput = h("input", { type: "file", accept: "image/*", hidden: true, "aria-hidden": "true", tabindex: "-1" });

  const takeBtn = h("button", { class: "btn btn-primary btn-block btn-lg", type: "button", onclick: () => camInput.click() }, "Take photo");
  const uploadBtn = h("button", { class: "btn btn-secondary btn-block", type: "button", onclick: () => fileInput.click() }, "Upload an image");
  const retakeBtn = h("button", { class: "btn btn-secondary", type: "button", hidden: true, onclick: () => { clearPhoto(); camInput.click(); } }, "Retake");
  const extractBtn = h("button", { class: "btn btn-primary", type: "button", hidden: true, onclick: extract }, "Read document");
  const manualBtn = h("button", { class: "btn btn-quiet btn-block", type: "button", onclick: manual }, "Enter PO and pack slip manually");

  function showError(text) { clear(message); message.append(alertBox("error", text)); }
  function clearMessage() { clear(message); }

  function setPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { showError("That file is not an image."); return; }
    if (doc.previewUrl) { try { URL.revokeObjectURL(doc.previewUrl); } catch (_) {} }
    doc.file = file;
    doc.previewUrl = URL.createObjectURL(file);
    clearMessage();
    syncPhoto();
  }

  function clearPhoto() {
    if (doc.previewUrl) { try { URL.revokeObjectURL(doc.previewUrl); } catch (_) {} }
    doc.file = null;
    doc.previewUrl = null;
    camInput.value = "";
    fileInput.value = "";
    syncPhoto();
  }

  function syncPhoto() {
    const has = !!doc.file;
    previewBox.hidden = !has;
    if (has) previewImg.src = doc.previewUrl;
    takeBtn.hidden = has;
    uploadBtn.hidden = has;
    retakeBtn.hidden = !has;
    extractBtn.hidden = !has;
  }

  function setBusy(on) {
    busy = on;
    for (const b of [takeBtn, uploadBtn, retakeBtn, extractBtn, manualBtn]) b.disabled = on;
  }

  async function extract() {
    if (busy || !doc.file) return;
    clearMessage();
    setBusy(true);
    extractBtn.textContent = "Reading…";
    progressBox.hidden = false;
    progress.value = 0;
    progressLabel.textContent = "Preparing photo…";
    try {
      const prepared = await prepareImage(doc.file, window.APP_CONFIG.IMAGE);
      progressLabel.textContent = "Uploading photo… 0%";
      const result = await extractDocument(prepared, (f) => {
        progress.value = f;
        progressLabel.textContent = f >= 1 ? "Reading the document. This can take up to a minute." : `Uploading photo… ${Math.round(f * 100)}%`;
        if (f >= 1) progress.removeAttribute("value");
      });
      doc.extracted = { po_number: result.po_number, pack_slip_number: result.pack_slip_number };
      doc.missingFields = result.missing_fields;
      state.receipt.poNumber = result.po_number;
      state.receipt.packSlipNumber = result.pack_slip_number;
      state.receipt.verified = false;
      go("review");
    } catch (err) {
      if (err.kind === "auth") return; // router handles sign-out
      showError(err.message + " You can retry, retake the photo, or enter the numbers manually.");
      setBusy(false);
      extractBtn.textContent = "Read document";
      progressBox.hidden = true;
    }
  }

  function manual() {
    if (busy) return;
    doc.extracted = null;
    doc.missingFields = ["po_number", "pack_slip_number"];
    go("review");
  }

  camInput.addEventListener("change", () => setPhoto(camInput.files[0]));
  fileInput.addEventListener("change", () => setPhoto(fileInput.files[0]));

  root.append(
    h("h1", { class: "page-title" }, "Delivery order"),
    h("p", { class: "muted" }, "Photograph the delivery order so the PO number and pack slip number can be read for you. You can correct them next."),
    h("div", { class: "card stack" },
      message, previewBox, progressBox,
      takeBtn, uploadBtn,
      h("div", { class: "row" }, retakeBtn, extractBtn),
      camInput, fileInput),
    manualBtn);
  syncPhoto();
  return () => {};
}
