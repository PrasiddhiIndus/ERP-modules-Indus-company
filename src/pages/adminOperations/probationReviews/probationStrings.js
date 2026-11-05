/**
 * English copy for Probation Reviews — taken verbatim from Indus One
 * (`src/locales/en.json` → indusOne.probation / indusOne.signature) so both apps read the same.
 * The ERP has no i18n runtime, so `t()` is a tiny key lookup with {{var}} interpolation.
 */

const STRINGS = {
  "errors.generic": "Something went wrong. Please try again.",

  "probation.title": "Probation reviews",
  "probation.subtitle": "Mandatory performance appraisals at 5.5 months from date of joining.",
  "probation.loading": "Loading probation reviews…",
  "probation.loadFailed": "Could not load probation reviews.",
  "probation.empty": "No probation reviews assigned to you.",
  "probation.noneInSection": "None",
  "probation.pendingSection": "My pending actions",
  "probation.historySection": "History — submitted & completed",
  "probation.back": "Back to list",
  "probation.recommendationRequired": "Select a recommendation",
  "probation.scoresRequired": "Rate all required competencies (1–5)",
  "probation.remarksFilledBy": "Filled by: {{name}}",
  "probation.l2RemarksPending": "To be filled by the L1/L2 reviewer after L1 submits.",
  "probation.signatureRequired": "Save your signature under Profile → My signature before continuing",
  "probation.mySignature": "My signature",
  "probation.changeSignature": "Change signature",
  "probation.signForm": "Sign form",
  "probation.signFinalize": "Sign and finalize",
  "probation.returnToL1": "Return to L1",
  "probation.signHint": "You must sign with your own saved signature.",
  "probation.saveDraft": "Save draft",
  "probation.submitConfirm": "Submit this probation review and attach your signature?",
  "probation.draftSaved": "Draft saved",
  "probation.submitted": "Review submitted",
  "probation.approveSign": "Approve and sign",
  "probation.approveConfirm": "Approve and attach your signature?",
  "probation.correctionRequired": "Correction comments are required",
  "probation.approved": "Approved",
  "probation.returned": "Returned for correction",
  "probation.notAuthorized": "Not authorized for this stage",
  "probation.correctionBanner": "Correction required",
  "probation.timeline": "Approval timeline",
  "probation.downloadPdf": "Download PDF",
  "probation.pdfReady": "PDF downloaded",
  "probation.status.awaiting_l1": "Due — Awaiting L1",
  "probation.status.in_progress_l1": "In progress — L1",
  "probation.status.awaiting_l2": "Awaiting L1/L2 reviewer",
  "probation.status.awaiting_hr": "Awaiting HR",
  "probation.status.awaiting_md": "Awaiting MD",
  "probation.status.correction_required": "Correction required",
  "probation.status.overdue": "Overdue",
  "probation.status.finalized": "Approved / Finalized",
  "probation.status.cancelled": "Cancelled",

  "signature.title": "My signature",
  "signature.hint": "Upload a PNG of your signature (under 2 MB). Only you can view or replace it.",
  "signature.loading": "Loading signature…",
  "signature.emptyTitle": "No signature yet",
  "signature.emptyHint": "PNG only · max 2 MB",
  "signature.previewAlt": "Your saved signature",
  "signature.uploadPreviewLabel": "Preview of upload",
  "signature.uploadPreviewAlt": "Signature you are about to upload",
  "signature.selectedFile": "{{name}} · {{size}}",
  "signature.authorizeLabel":
    "I authorize Indus One to store my signature for use in documents and workflows for which I am authorized.",
  "signature.save": "Save signature",
  "signature.cancel": "Cancel",
  "signature.chooseDifferent": "Choose different file",
  "signature.upload": "Upload signature",
  "signature.replace": "Replace signature",
  "signature.remove": "Remove",
  "signature.uploading": "Uploading…",
  "signature.updated": "Signature saved",
  "signature.removed": "Signature removed",
  "signature.removeConfirm": "Remove your saved signature?",
  "signature.updatedAt": "Updated {{time}}",
};

/** t("probation.title") / t("probation.remarksFilledBy", { name }) / t(key, { defaultValue }) */
export function t(key, vars = {}) {
  const raw = Object.prototype.hasOwnProperty.call(STRINGS, key) ? STRINGS[key] : vars.defaultValue ?? key;
  return String(raw).replace(/\{\{(\w+)\}\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : ""));
}
