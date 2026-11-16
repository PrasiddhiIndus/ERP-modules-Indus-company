/**
 * Commercial PO At Glance (browser only): signature images for the Word export.
 * Each signed stage uses the signature of the login that signed it (signed_user_id, stamped by the database),
 * served by /api/commercial/oc/signature-file. Nothing here lets a user pick a signature.
 */
import { CM_OC_STAGES } from "./cmOcDepartment";
import { cmStageSignatureBytes } from "./cmOcApi";

const MAX_W = 110;
const MAX_H = 42;

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

/** { [slot]: { data, type, width, height } } for every signed approval stage on the form. */
export async function loadCmSignatureImages(form) {
  if (!form?.id) return {};
  const entries = await Promise.all(
    CM_OC_STAGES.map(async ({ slot }) => {
      const s = form.signoff?.[slot];
      if (!s?.saved_by || !s?.signed_user_id) return [slot, null];
      try {
        const data = await cmStageSignatureBytes(form.id, slot);
        const type = data ? imageType(data) : null;
        if (!type) return [slot, null]; // e.g. a PDF signature file — the export keeps the name and date only
        const { w, h } = await imageSize(new Blob([data]));
        const scale = Math.min(MAX_W / w, MAX_H / h, 1);
        return [slot, { data, type, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }];
      } catch (e) {
        console.warn("[Commercial PO At Glance] signature image not loaded for", slot, e);
        return [slot, null];
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, v]) => v));
}
