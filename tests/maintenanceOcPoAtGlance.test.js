import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import {
  blankContact, blankSecurityRow, emptyOcForm, formFromRecord, toSavePayload, validateOcForm,
} from "../src/pages/projects/oc/ocModel.js";
import { IEV_OC_DEPARTMENT } from "../src/pages/projects/oc/ocDepartment.js";
import {
  MAINTENANCE_OC_DEPARTMENT, MM_OC_SIGNOFF_SLOTS, mmOcCanConfigure, mmOcCanDelete, mmOcCanEdit,
} from "../src/pages/maintenance/poAtGlance/mmOcDepartment.js";
import {
  buildMmOcDocxBuffer, mmContractValue, mmDate, mmDuration, mmSecurity,
} from "../src/pages/maintenance/poAtGlance/mmWordExport.js";

const SLOTS = MM_OC_SIGNOFF_SLOTS;
const SIGNED_AT = "2026-10-26T06:28:00.000Z";

/** Sample entry from the reference "M&M PO format.doc". */
function mmForm() {
  const f = emptyOcForm(SLOTS);
  Object.assign(f, {
    client_name: "HPCL-LNG Ltd, Chhara",
    client_address: "Gir-Somnath",
    is_sez: false,
    po_wo_no: "Mail Confirmation Given On Dated. 19-10-2026",
    po_date: "2026-10-19",
    project_description: "Fire Extinguisher Valve Replacing, N2 Filling & SCBA Refilling Job.",
    delivery_date: "2026-11-30",
    contract_value: "41200",
    gst_pct: "18",
    payment_terms: "30 Days Credit",
    other_information: "Fire Extinguisher Valve Replacing, N2 Filling & SCBA Refilling Job.",
    remarks: "Fire Extinguisher Valve Replacing, N2 Filling & SCBA Refilling Job.",
    remarks_date: "2026-10-26",
  });
  f.penalty.enabled = false;
  f.security_items = [{ ...blankSecurityRow(), type: "SD", applicable: false }];
  f.emd.enabled = false;
  f.dlp.enabled = false;
  f.warranty.enabled = false;
  f.contacts = [
    { ...blankContact(), department: "User", names: "Mr. Sourabh Solanki", emails: "sourabh.solanki@hplng.in" },
    { ...blankContact(), department: "Commercial" },
  ];
  f.signoff.MM_USER = { signed_by: "Mock M&M User", saved_by: "Mock M&M User", signed_at: SIGNED_AT };
  return f;
}

async function documentXml(form) {
  const logo = fs.readFileSync(path.resolve("public/maintenance/indus-ifs-logo.jpeg"));
  const buf = await buildMmOcDocxBuffer(form, { logo });
  if (process.env.MM_OC_DOCX_OUT) fs.writeFileSync(process.env.MM_OC_DOCX_OUT, buf);
  const zip = new PizZip(buf);
  const plain = (name) => zip.file(name).asText().replace(/<[^>]+>/g, "");
  return {
    body: plain("word/document.xml"),
    header: Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).map(plain).join(" "),
    media: Object.keys(zip.files).filter((n) => n.startsWith("word/media/")),
  };
}

describe("Maintenance PO At Glance — department profile", () => {
  it("uses its own tables, functions and notify route, never IEV's", () => {
    const mm = MAINTENANCE_OC_DEPARTMENT;
    for (const [key, table] of Object.entries(mm.tables)) {
      expect(table).toMatch(/^mm_oc_/);
      expect(table).not.toBe(IEV_OC_DEPARTMENT.tables[key]);
    }
    expect(mm.rpc).toEqual({ save: "mm_oc_save", employeeOptions: "mm_oc_employee_options" });
    expect(mm.notifyPath).toBe("/api/maintenance/oc/signoff-notify");
    expect(IEV_OC_DEPARTMENT.tables.master).toBe("oc_master");
    expect(IEV_OC_DEPARTMENT.notifyPath).toBe("/api/fire-tender/oc/signoff-notify");
  });

  it("has the three M&M sign-off boxes", () => {
    expect(SLOTS.map((s) => s.label)).toEqual(["User (M&M Dept.)", "Vertical Head", "Finance Department"]);
    expect(Object.keys(emptyOcForm(SLOTS).signoff)).toEqual(["MM_USER", "VERTICAL_HEAD", "FINANCE"]);
    expect(Object.keys(emptyOcForm().signoff)).toEqual(["SALES", "PLANNING", "IEV_HEAD", "FINANCE"]);
  });

  it("gives Maintenance users access and leaves IEV-only users out", () => {
    const mmManager = { role: "manager", allowed_modules: ["maintenance"] };
    const mmModules = new Set(["maintenance"]);
    expect(mmOcCanEdit(mmManager, mmModules)).toBe(true);
    expect(mmOcCanDelete(mmManager, mmModules)).toBe(true);
    expect(mmOcCanConfigure(mmManager, mmModules)).toBe(true);
    const ievExec = { role: "executive", allowed_modules: ["fireTender"] };
    const ievModules = new Set(["fireTender"]);
    expect(mmOcCanEdit(ievExec, ievModules)).toBe(false);
    expect(mmOcCanDelete(ievExec, ievModules)).toBe(false);
    expect(mmOcCanConfigure(ievExec, ievModules)).toBe(false);
    expect(mmOcCanEdit({ role: "super_admin" }, new Set())).toBe(true);
  });
});

describe("Maintenance PO At Glance — same rules as IEV", () => {
  it("runs the IEV validation unchanged", () => {
    expect(validateOcForm(mmForm())).toEqual({});
    const e = validateOcForm(emptyOcForm(SLOTS));
    expect(Object.keys(e).sort()).toEqual(["client_name", "contract_value", "delivery_date", "po_date", "po_wo_no", "project_description"]);
  });

  it("saves and reloads every field with the M&M boxes", () => {
    const form = mmForm();
    const p = toSavePayload(form, SLOTS);
    expect(p.signoff).toEqual([{ slot: "MM_USER", signed_by: "Mock M&M User" }]);
    const back = formFromRecord({
      master: { ...p, id: "mm-1" },
      security: p.security_items.map((s, i) => ({ ...s, seq: i + 1 })),
      conditions: p.fixed_conditions,
      penalty: p.penalty,
      milestones: [],
      contacts: p.contacts.map((c, i) => ({ ...c, seq: i + 1 })),
      signoff: p.signoff.map((s) => ({ ...s, signed_at: SIGNED_AT })),
    }, SLOTS);
    expect(back.client_name).toBe(form.client_name);
    expect(back.signoff.MM_USER.signed_by).toBe("Mock M&M User");
    expect(back.signoff.VERTICAL_HEAD.signed_by).toBe("");
    expect(back.signoff.SALES).toBeUndefined();
  });
});

describe("Maintenance PO At Glance — M&M Word format", () => {
  it("formats values the way the M&M format writes them", () => {
    const f = mmForm();
    expect(mmDate("2026-10-19")).toBe("19-10-2026");
    expect(mmContractValue(f)).toBe("41,200/-");
    expect(mmDuration(f)).toBe("19-10-2026 To 30-11-2026");
    expect(mmDuration({ ...f, duration_of_job: "6 weeks" })).toBe("6 weeks");
    expect(mmSecurity(f)).toEqual({ applicable: false, details: "No", others: [] });
  });

  it("has the M&M header, title, rows, contacts and sign-off boxes", async () => {
    const { body, header, media } = await documentXml(mmForm());
    expect(header).toContain("INDUS FIRE SAFETY PVT. LTD.");
    expect(header).toContain("IFSPL/M&amp;M-OC/F&amp;A/004, R-0, Eff. Dt.:01/05/2025");
    expect(media.length).toBeGreaterThan(0);
    for (const label of [
      "PO AT GLANCE", "Cost Center in Tally", "OC No.", "Client Name &amp; Address", "Whether SEZ:", "PO/WO No.",
      "Project Description", "Duration of Job", "Contract Value", "(Excl. Taxes)", "GST Applicability (%)",
      "Payment Terms", "LD / Penalty Clause, ", "SD Applicability", "EMD", "Defect Liability Period",
      "Warranty / Guarantee", "Any Other Information", "Customer’s contact details:", "Department", "Mobile No.",
      "E-mail address", "Remarks", "WO/PO disseminated to concerned departments", "User (M&amp;M Dept.)",
      "Vertical Head", "Finance Department",
    ]) expect(body).toContain(label);
    for (const value of [
      "HPCL-LNG Ltd, Chhara", "Gir-Somnath", "19-10-2026", "19-10-2026 To 30-11-2026", "41,200/-", "18%",
      "30 Days Credit", "Mr. Sourabh Solanki", "sourabh.solanki@hplng.in", "Date: 26-10-2026", "Mock M&amp;M User",
    ]) expect(body).toContain(value);
    expect(body).not.toMatch(/IEV|Planning Department|Sales &amp; Commercial/);
  });

  it("does not change the IEV export's header", async () => {
    const { buildOcDocxBuffer } = await import("../src/pages/projects/oc/ocWordExport.js");
    const f = emptyOcForm();
    const xml = new PizZip(await buildOcDocxBuffer(f)).file("word/document.xml").asText();
    expect(xml).toContain("IFSPL/IEV-OC/F&amp;A/003");
    expect(xml).not.toContain("M&amp;M-OC");
  });
});
