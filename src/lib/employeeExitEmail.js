/**
 * Email exit documents to an Inactive / Left employee. Documents are built in the
 * browser (same content as the download), attached as PDF, and sent from the
 * company mailbox by the API.
 */
import { fetchApiWithAuth } from "./apiBase";
import { buildExitDocument } from "./employeeExitDocuments";
import { exitDocumentDocxToPdf } from "./exitDocumentPdf";

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

/** @param {{ employee: object, to: string, senderMail?: string, documentKeys: string[] }} p */
export async function emailExitDocuments({ employee, to, senderMail, documentKeys }) {
  const attachments = [];
  for (const key of documentKeys) {
    const { blob, fileName, label } = await buildExitDocument(key, employee);
    const pdf = await exitDocumentDocxToPdf(blob, { documentKey: key });
    attachments.push({ fileName: fileName.replace(/\.docx$/i, ".pdf"), label, base64: await blobToBase64(pdf) });
  }
  const res = await fetchApiWithAuth("/api/admin/employee-exit/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: employee.id, to, senderMail: senderMail || undefined, attachments }),
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        res.error ||
          "The documents are too large for the server to accept. Redeploy the API and raise the web server upload limit if this continues."
      );
    }
    throw new Error(res.error || "Could not send the email.");
  }
  return res.data;
}
