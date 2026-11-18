/**
 * PO At Glance Word export: saved sign-off boxes carry the signer's signature image (IEV, Maintenance, R&M, Projects);
 * unsaved / unsigned boxes and exports without images keep the previous output.
 */
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { emptyOcForm } from "../src/pages/projects/oc/ocModel.js";
import { IEV_OC_DEPARTMENT } from "../src/pages/projects/oc/ocDepartment.js";
import { MAINTENANCE_OC_DEPARTMENT } from "../src/pages/maintenance/poAtGlance/mmOcDepartment.js";
import { RM_OC_DEPARTMENT } from "../src/pages/commercial-rm-mm-amc-iev/poAtGlance/rmOcDepartment.js";
import { PROJECTS_OC_DEPARTMENT } from "../src/pages/projects/poAtGlance/pjOcDepartment.js";
import { buildOcDocxBuffer } from "../src/pages/projects/oc/ocWordExport.js";
import { buildMmOcDocxBuffer } from "../src/pages/maintenance/poAtGlance/mmWordExport.js";
import { buildRmOcDocxBuffer } from "../src/pages/commercial-rm-mm-amc-iev/poAtGlance/rmWordExport.js";
import { buildPjOcDocxBuffer } from "../src/pages/projects/poAtGlance/pjWordExport.js";
import { signatureImageType } from "../src/pages/projects/oc/ocSignatureImages.js";

// 1×1 transparent PNG.
const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
));
const IMG = { data: PNG, type: "png", width: 100, height: 40 };
const SIGNED_AT = "2026-11-18T06:30:00.000Z";

const CASES = [
  ["IEV", IEV_OC_DEPARTMENT, buildOcDocxBuffer],
  ["Maintenance", MAINTENANCE_OC_DEPARTMENT, buildMmOcDocxBuffer],
  ["R&M", RM_OC_DEPARTMENT, buildRmOcDocxBuffer],
  ["Projects", PROJECTS_OC_DEPARTMENT, buildPjOcDocxBuffer],
];

function formFor(dept) {
  const f = emptyOcForm(dept.slots);
  Object.assign(f, { id: "00000000-0000-0000-0000-000000000001", client_name: "Mock Client", po_wo_no: "PO-1", po_date: "2026-11-01" });
  const [first, second] = dept.slots;
  f.signoff[first.slot] = { signed_by: "Signer One", saved_by: "Signer One", signed_at: SIGNED_AT, signed_user_id: "u1" };
  // Typed but not yet saved: never printed with an image.
  f.signoff[second.slot] = { signed_by: "Signer Two", saved_by: "", signed_at: "", signed_user_id: "" };
  return f;
}

async function exportParts(build, form, opts) {
  const zip = new PizZip(await build(form, opts));
  return {
    xml: zip.file("word/document.xml").asText(),
    media: Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n].dir),
  };
}

describe("PO At Glance Word export — signature images", () => {
  it.each(CASES)("%s: embeds the saved signer's signature image in its sign-off box", async (_label, dept, build) => {
    const form = formFor(dept);
    const first = dept.slots[0].slot;
    const second = dept.slots[1].slot;
    const { xml, media } = await exportParts(build, form, { signatures: { [first]: IMG, [second]: IMG } });
    // Only the saved box gets an image (the unsaved one is ignored even though an image was offered).
    expect(media).toHaveLength(1);
    expect(xml).toContain("<w:drawing>");
    expect(xml).toContain("Signer One");
  });

  it.each(CASES)("%s: export without signature images is unchanged (no media)", async (_label, dept, build) => {
    const { xml, media } = await exportParts(build, formFor(dept));
    expect(media).toHaveLength(0);
    expect(xml).toContain("Signer One");
  });

  it("detects signature image types and rejects other files", () => {
    expect(signatureImageType(PNG)).toBe("png");
    expect(signatureImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(signatureImageType(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(signatureImageType(null)).toBeNull();
  });

  it("every shared PO At Glance department builds its Word file with signatures", () => {
    for (const [, dept] of CASES) expect(typeof dept.buildDocx).toBe("function");
  });
});
