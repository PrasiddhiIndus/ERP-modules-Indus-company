/**
 * Email CTC details (Annexure-I PDFs) to the employee's login email.
 * The server picks the recipient; the browser only builds the PDFs.
 */
import { fetchApiWithAuth } from "../../../lib/apiBase";
import { exportNodeToPdfBlob } from "../../../lib/exportNodeToPdf";
import { buildAnnexureHtml } from "./annexurePrint";

const A4_WIDTH_PX = 794;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the PDF."));
    reader.readAsDataURL(blob);
  });
}

/** Annexure-I (same layout as Print Annexure) → base64 PDF. */
export async function annexurePdfBase64(params) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${A4_WIDTH_PX}px`,
    height: "1123px",
    border: "0",
  });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(buildAnnexureHtml(params));
    doc.close();
    await new Promise((r) => window.setTimeout(r, 50));
    const blob = await exportNodeToPdfBlob(doc.body);
    return await blobToBase64(blob);
  } finally {
    iframe.remove();
  }
}

export async function fetchCtcEmailRecipient(employeeId) {
  const res = await fetchApiWithAuth(
    `/api/admin/salary/ctc-email/recipient?employeeId=${encodeURIComponent(employeeId)}`,
    { method: "GET", timeoutMs: 20_000 }
  );
  if (!res.ok) throw new Error(res.error || "Could not find the employee email.");
  return res.data?.email || "";
}

/** @param {{ employeeId: string|number, attachments: { fileName: string, label: string, pdfBase64: string }[] }} p */
export async function sendCtcEmail({ employeeId, attachments }) {
  const res = await fetchApiWithAuth("/api/admin/salary/ctc-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, attachments }),
    timeoutMs: 120_000,
  });
  if (!res.ok) throw new Error(res.error || "Could not send the email.");
  return res.data;
}
