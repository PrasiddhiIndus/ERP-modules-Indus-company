/**
 * Projects PO At Glance (browser only): signature images for the Word export and preview.
 * Each completed stage uses the signature of the login that signed it (signed_user_id, stamped by the database),
 * fetched from that employee's own Indus One upload. Nothing here lets a user pick a signature.
 */
import { fetchOcSignatureUrl } from "../oc/ocApi";
import { PJ_OC_SIGNOFF_SLOTS } from "./pjOcDepartment";

const MAX_W = 120;
const MAX_H = 45;

function imageType(bytes) {
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

async function loadOne(userId) {
  const url = await fetchOcSignatureUrl(userId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = new Uint8Array(await res.arrayBuffer());
  const type = imageType(data);
  if (!type) return null; // e.g. a PDF signature file — the export keeps the name and date only
  const { w, h } = await imageSize(new Blob([data]));
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  return { data, type, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** { [slot]: { data, type, width, height } } for every saved sign-off on the form. */
export async function loadPjSignatureImages(form) {
  const entries = await Promise.all(
    PJ_OC_SIGNOFF_SLOTS.map(async ({ slot }) => {
      const s = form?.signoff?.[slot];
      if (!s?.saved_by || !s?.signed_user_id) return [slot, null];
      try {
        return [slot, await loadOne(s.signed_user_id)];
      } catch (e) {
        console.warn("[PO At Glance] signature image not loaded for", slot, e);
        return [slot, null];
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, v]) => v));
}
