/**
 * Email exit documents to an Inactive / Left employee. Documents are built in the
 * browser (same content as the download), attached as PDF, and sent from the
 * company mailbox by the API.
 *
 * PDFs are staged one-at-a-time (avoids nginx 1mb 413), then sent in a single email.
 */
import { fetchApiWithAuth } from "./apiBase";
import { buildExitDocument } from "./employeeExitDocuments";
import { EXIT_EMAIL_NGINX_SAFE_PDF_BYTES } from "./exitEmailLimits";
import { exitDocumentDocxToPdf } from "./exitDocumentPdf";

export { EXIT_EMAIL_NGINX_SAFE_PDF_BYTES } from "./exitEmailLimits";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the document."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Login email on file for the employee (profile, then sign-in account; "" when none)
 * and the "From" mailboxes this user may send as.
 */
export async function fetchExitEmailSetup(employeeId) {
  const res = await fetchApiWithAuth(
    `/api/admin/employee-exit/email/recipient?employeeId=${encodeURIComponent(employeeId)}`,
    { method: "GET", timeoutMs: 20_000 }
  );
  if (!res.ok) throw new Error(res.error || "Could not find the employee email.");
  return { email: res.data?.email || "", senders: res.data?.senders || [] };
}

function exitEmailTooLargeMessage(status) {
  if (status === 413) {
    return "The documents are too large to send in one email. Try fewer documents, or ask IT to review upload/mail size limits.";
  }
  return null;
}

async function stageExitAttachment({ fileName, label, base64 }) {
  const res = await fetchApiWithAuth("/api/admin/employee-exit/email/attachment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, label, base64 }),
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    throw new Error(
      exitEmailTooLargeMessage(res.status) || res.error || "Could not upload a document for email."
    );
  }
  const id = res.data?.id;
  if (!id) throw new Error("Could not upload a document for email.");
  return id;
}

/** @param {{ employee: object, to: string, senderMail?: string, documentKeys: string[] }} p */
export async function emailExitDocuments({ employee, to, senderMail, documentKeys }) {
  const keys = Array.isArray(documentKeys) ? documentKeys : [];
  if (!keys.length) throw new Error("Select at least one document to send.");

  // Stage each PDF in a small request (nginx-safe), then send once with all attachments.
  const attachmentIds = [];
  for (const key of keys) {
    const { blob, fileName, label } = await buildExitDocument(key, employee);
    const pdf = await exitDocumentDocxToPdf(blob, {
      documentKey: key,
      maxBytes: EXIT_EMAIL_NGINX_SAFE_PDF_BYTES,
    });
    const base64 = await blobToBase64(pdf);
    const id = await stageExitAttachment({
      fileName: fileName.replace(/\.docx$/i, ".pdf"),
      label,
      base64,
    });
    attachmentIds.push(id);
  }

  const res = await fetchApiWithAuth("/api/admin/employee-exit/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId: employee.id,
      to,
      senderMail: senderMail || undefined,
      attachmentIds,
    }),
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    throw new Error(exitEmailTooLargeMessage(res.status) || res.error || "Could not send the email.");
  }
  return res.data || {};
}
