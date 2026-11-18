/**
 * Projects PO At Glance (browser only): signature images for the Word export and preview.
 * Each completed stage uses the signature of the login that signed it (signed_user_id, stamped by the database),
 * served by /api/projects/oc/signature-file. Nothing here lets a user pick a signature.
 * The loader is shared with IEV, Maintenance and R&M (../oc/ocSignatureImages.js).
 */
import { loadOcSignatureImages } from "../oc/ocSignatureImages";
import { PJ_OC_SIGNOFF_SLOTS } from "./pjOcDepartment";

/** { [slot]: { data, type, width, height } } for every saved sign-off on the form. */
export function loadPjSignatureImages(form) {
  return loadOcSignatureImages(form, { key: "projects", slots: PJ_OC_SIGNOFF_SLOTS });
}
