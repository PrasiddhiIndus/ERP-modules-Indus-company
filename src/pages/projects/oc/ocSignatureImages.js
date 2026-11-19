/**
 * PO At Glance (browser only): signature images for the Word export and preview, for every department
 * on the shared PO At Glance screens (IEV, Maintenance, Projects, R&M).
 * Each saved sign-off box uses the signature of the login that signed it (signed_user_id, stamped by the database).
 * Nothing here lets a user pick a signature.
 */
import { fetchApiWithAuth } from "../../../lib/apiBase";
import { fetchOcSignatureUrl, ocStageSignatureBytes } from "./ocApi";

const MAX_W = 120;
const MAX_H = 45;

export function signatureImageType(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  return null;
}

async function imageSize(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return size;
  } catch {
    return { w: 3, h: 1 };
  }
}

/** Fallback when the box endpoint is unavailable: userId → Indus One file bytes (allowed for own / Finance Master). */
async function signatureBytesByUser(userId) {
  const res = await fetchApiWithAuth("/api/employee-signature/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, bytes: true }),
  });
  const b64 = res.ok ? String(res.data?.base64 || "") : "";
  if (!b64) return null;
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) data[i] = bin.charCodeAt(i);
  return data;
}

async function loadOne(dept, ocId, slot, userId) {
  let data = ocId ? await ocStageSignatureBytes(ocId, slot, dept).catch(() => null) : null;
  if (!data && userId) {
    data = await signatureBytesByUser(userId).catch(() => null);
    if (!data) {
      const url = await fetchOcSignatureUrl(userId);
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      data = new Uint8Array(await res.arrayBuffer());
    }
  }
  if (!data) return null;
  const type = signatureImageType(data);
  if (!type) return null; // e.g. a PDF signature file — the export keeps the name and date only
  const { w, h } = await imageSize(new Blob([data]));
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  return { data, type, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * { [slot]: { data, type, width, height } } for every saved sign-off on the form.
 * @param {object} form  PO At Glance form state (ocModel shape)
 * @param {{ key: string, slots: { slot: string }[] }} dept  department profile
 */
export async function loadOcSignatureImages(form, dept) {
  const ocId = form?.id || null;
  const entries = await Promise.all(
    (dept?.slots || []).map(async ({ slot }) => {
      const s = form?.signoff?.[slot];
      if (!s?.saved_by || !s?.signed_user_id) return [slot, null];
      try {
        return [slot, await loadOne(dept, ocId, slot, s.signed_user_id)];
      } catch (e) {
        console.warn("[PO At Glance] signature image not loaded for", slot, e);
        return [slot, null];
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, v]) => v));
}
