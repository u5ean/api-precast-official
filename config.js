/*
 * Deployment configuration. Edit this file only; no rebuild needed.
 * Nothing secret belongs here: Epicor and OCR credentials stay inside n8n.
 */
window.APP_CONFIG = {
  // Origin of your n8n instance, e.g. "https://n8n.example.com"
  N8N_BASE_URL: "https://primary-production-b7199.up.railway.app/",

  // "/webhook" = production URLs (workflow must be ACTIVE).
  // "/webhook-test" = n8n test URLs (only while "Listen for test event" is on).
  WEBHOOK_PREFIX: "/webhook",

  // Verified webhook paths (all HTTP POST)
  LOGIN_PATH: "/login",
  DOCUMENT_PATH: "/document",
  CONFIRM_FIELDS_PATH: "/confirm-fields",
  CREATE_RECEIPT_PATH: "/create-receipt",
  GET_LINES_PATH: "/get-lines", // NOTE: this endpoint RECEIVES and COMMITS. Never used to preview.

  // Endpoints that do NOT exist yet (see BACKEND_REQUIRED.md). Leave null until the
  // backend team has built them and confirmed the response contract.
  PO_LINES_PATH: "/get-lines", // read-only PO line lookup (U6)
  SUBMIT_PATH: "/get-lines",   // final receipt submission via get-lines (commits after create-receipt)

  FEATURES: {
    // Master switch for the final submit button. Also requires SUBMIT_PATH.
    SUBMIT_ENABLED: true,
    // Full receipt = "receive every open PO line". Off by default because it cannot be reviewed.
    ALLOW_FULL_RECEIPT: false,
    // Call /create-receipt before submitting. Off: its relationship to /get-lines is unverified (U5).
    CREATE_HEADER_STEP: true,
  },

  TIMEOUTS_MS: { default: 30000, document: 90000, submit: 120000 },

  // Photos are shrunk in the browser before upload (OCR services limit file size).
  IMAGE: { maxEdge: 1800, quality: 0.85 },
};
