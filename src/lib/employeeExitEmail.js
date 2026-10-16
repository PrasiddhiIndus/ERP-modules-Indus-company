/**
 * Email exit documents to an Inactive / Left employee. Documents are built in the
 * browser (same content as the download), attached as PDF, and sent from the
 * company mailbox by the API.
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
    return "The email is too large for the server upload limit. Try again after the latest update, or ask IT to set client_max_body_size 35m on /api/.";
  }
  return null;
}

async function postExitEmail({ employeeId, to, senderMail, attachments }) {
  const res = await fetchApiWithAuth("/api/admin/employee-exit/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId,
      to,
      senderMail: senderMail || undefined,
      attachments,
    }),
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    throw new Error(
      exitEmailTooLargeMessage(res.status) ||
        res.error ||
        "Could not send the email."
    );
  }
  return res.data || {};
}

/** @param {{ employee: object, to: string, senderMail?: string, documentKeys: string[] }} p */
export async function emailExitDocuments({ employee, to, senderMail, documentKeys }) {
  const keys = Array.isArray(documentKeys) ? documentKeys : [];
  if (!keys.length) throw new Error("Select at least one document to send.");

  let last = null;
  let sent = 0;
  let messages = 0;

  // One attachment per API call — avoids production nginx 413 (1mb default) and Graph 3MB caps.
  for (const key of keys) {
    const { blob, fileName, label } = await buildExitDocument(key, employee);
    const pdf = await exitDocumentDocxToPdf(blob, {
      documentKey: key,
      maxBytes: EXIT_EMAIL_NGINX_SAFE_PDF_BYTES,
    });
    const base64 = await blobToBase64(pdf);
    last = await postExitEmail({
      employeeId: employee.id,
      to,
      senderMail,
      attachments: [{ fileName: fileName.replace(/\.docx$/i, ".pdf"), label, base64 }],
    });
    sent += Number(last.sent) || 1;
    messages += Number(last.messages) || 1;
  }

  return {
    ...(last || {}),
    ok: true,
    email: last?.email || to,
    sent,
    messages,
  };
}
