import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import {
  OC_COMPANY_NAME, OC_DOC_REF, OC_FORM_TITLE, OC_SECURITY_HEADING, blankContact, blankMilestone, blankSecurityRow,
  contractValueInWords, emptyOcForm, formFromRecord, formatSignedAt, ocExportFileName, signoffPending, toSavePayload,
  validateOcForm,
} from "../src/pages/projects/oc/ocModel.js";
import { buildOcDocxBuffer } from "../src/pages/projects/oc/ocWordExport.js";

function filledForm() {
  const f = emptyOcForm();
  Object.assign(f, {
    oc_no: "IFSPL-IEV-OCC-26/27-00007",
    oc_date: "2026-10-12",
    cost_center_tally: "IEV / Mock Project",
    client_name: "Mock Client Industries Pvt Ltd",
    client_address: "Plot 1, GIDC Estate\nVadodara 390010",
    is_sez: false,
    po_wo_no: "PO-MOCK-001",
    po_date: "2026-10-01",
    project_description: "Supply, fabrication and commissioning of 2 Industrial Emergency Vehicles",
    duration_of_job: "6 months",
    delivery_date: "2027-03-31",
    contract_value: "12345678.5",
    gst_pct: "18",
    payment_terms: "30% advance against ABG, balance on delivery",
    rto_insurance: "RTO registration and transit insurance by client",
    other_information: "Training for 5 operators included",
    remarks: "Checked against PO",
    remarks_date: "2026-10-12",
  });
  f.penalty = { enabled: true, rate: "0.5", period_unit: "WEEK", cap_percent: "10", applicable_from_text: "after delivery date" };
  f.security_items = [
    { ...blankSecurityRow(), type: "SD", applicable: true, pct: "5", due_days: "15", validity_text: "Till end of DLP" },
    { ...blankSecurityRow(), type: "ABG", pct: "10", due_days: "30", validity_text: "Till advance recovery" },
    { ...blankSecurityRow(), type: "PBG", pct: "3", due_days: "30", validity_text: "Warranty + 3 months" },
    { ...blankSecurityRow(), type: "PBG", pct: "2", due_days: "45", validity_text: "Second PBG" },
    blankSecurityRow(),
  ];
  f.emd = { enabled: true, release_or_adjust: "ADJUST_SD", release_date: "" };
  f.dlp = { enabled: true, detail_text: "12 months from commissioning" };
  f.warranty = { enabled: false, detail_text: "should be dropped" };
  f.payment_milestones = [
    { ...blankMilestone(), percent: "30", trigger: "Advance", due_days: "0" },
    { ...blankMilestone(), percent: "70", trigger: "On delivery", due_days: "30", notes: "Against invoice" },
  ];
  f.contacts = [
    { ...blankContact(), department: "Purchase", names: "Mock Buyer", mobiles: "9999900001, 9999900002", emails: "buyer@example.test" },
    { ...blankContact(), department: "Projects", names: "Mock Engineer", mobiles: "9999900003", emails: "eng@example.test, eng2@example.test" },
    blankContact(),
  ];
  f.signoff.SALES = { signed_by: "Mock Sales", saved_by: "Mock Sales", signed_at: SIGNED_AT };
  f.signoff.FINANCE = { signed_by: "Mock Finance", saved_by: "Mock Finance", signed_at: SIGNED_AT };
  return f;
}

const SIGNED_AT = "2026-10-12T06:28:00.000Z";

/** Turns a save payload into rows shaped like the database, the way oc_save stores them. */
function rowsFromPayload(p) {
  return {
    master: { ...p, id: "oc-1" },
    security: p.security_items.map((s, i) => ({ ...s, seq: i + 1 })),
    conditions: p.fixed_conditions,
    penalty: p.penalty,
    milestones: p.payment_milestones.map((m, i) => ({ ...m, seq: i + 1 })),
    contacts: p.contacts.map((c, i) => ({ ...c, seq: i + 1 })),
    signoff: p.signoff.map((s) => ({ ...s, signed_at: SIGNED_AT })),
  };
}
const withoutKeys = (f) => JSON.parse(JSON.stringify(f, (k, v) => (k === "key" ? undefined : v)));

describe("PO At Glance — validation", () => {
  it("requires PO/WO No., PO date, client, project description, contract value and delivery date", () => {
    const e = validateOcForm(emptyOcForm());
    expect(Object.keys(e).sort()).toEqual(["client_name", "contract_value", "delivery_date", "po_date", "po_wo_no", "project_description"]);
    expect(validateOcForm({ ...filledForm(), oc_no: "x".repeat(81) }).oc_no).toMatch(/80 characters/);
  });

  it("allows saving without an OC No. (the Finance Department fills it later)", () => {
    expect(validateOcForm({ ...filledForm(), oc_no: "" })).toEqual({});
    expect(toSavePayload({ ...filledForm(), oc_no: "  " }).oc_no).toBeNull();
  });

  it("accepts a fully filled form", () => {
    expect(validateOcForm(filledForm())).toEqual({});
  });

  it("delivery date must be after the PO date", () => {
    const f = { ...filledForm(), delivery_date: "2026-10-01" };
    expect(validateOcForm(f).delivery_date).toMatch(/after the PO/);
  });

  it("details are required only when their Yes/No is Yes", () => {
    const f = filledForm();
    f.penalty = { ...f.penalty, rate: "" };
    f.dlp = { enabled: true, detail_text: "" };
    f.warranty = { enabled: true, detail_text: "" };
    f.emd = { enabled: true, release_or_adjust: "RELEASE", release_date: "" };
    const e = validateOcForm(f);
    expect(e["penalty.rate"]).toBeTruthy();
    expect(e["dlp.detail_text"]).toBeTruthy();
    expect(e["warranty.detail_text"]).toBeTruthy();
    expect(e["emd.release_date"]).toBeTruthy();

    const off = filledForm();
    off.penalty = { enabled: false, rate: "", period_unit: "WEEK", cap_percent: "", applicable_from_text: "" };
    off.dlp = { enabled: null, detail_text: "" };
    off.emd = { enabled: false, release_or_adjust: "", release_date: "" };
    expect(validateOcForm(off)).toEqual({});
  });

  it("security percentages must be between 0 and 100 and need a type", () => {
    const f = filledForm();
    f.security_items = [{ ...blankSecurityRow(), type: "ABG", pct: "120" }, { ...blankSecurityRow(), pct: "5" }];
    const e = validateOcForm(f);
    expect(e["security_items.0.pct"]).toBeTruthy();
    expect(e["security_items.1.type"]).toBeTruthy();
  });

  it("payment milestones must total 100 when present", () => {
    const f = filledForm();
    f.payment_milestones[1].percent = "60";
    expect(validateOcForm(f).payment_milestones).toMatch(/total 100%.*90/);
    f.payment_milestones = [];
    expect(validateOcForm(f).payment_milestones).toBeUndefined();
  });

  it("checks contact mobiles and e-mails", () => {
    const f = filledForm();
    f.contacts[0].emails = "not-an-email";
    f.contacts[1].mobiles = "abc";
    const e = validateOcForm(f);
    expect(e["contacts.0.emails"]).toBeTruthy();
    expect(e["contacts.1.mobiles"]).toBeTruthy();
  });
});

describe("PO At Glance — save payload and reload", () => {
  it("drops blank rows, keeps one row per security item, and clears details when No", () => {
    const p = toSavePayload(filledForm());
    expect(p.security_items.map((s) => s.type)).toEqual(["SD", "ABG", "PBG", "PBG"]);
    expect(p.security_items[0].applicable).toBe(true);
    expect(p.security_items[1].applicable).toBeNull();
    expect(p.contacts).toHaveLength(2);
    expect(p.contacts[0].mobiles).toEqual(["9999900001", "9999900002"]);
    expect(p.fixed_conditions.find((c) => c.key === "WARRANTY").detail_text).toBeNull();
    expect(p.fixed_conditions.find((c) => c.key === "EMD").release_date).toBeNull();
    expect(p.signoff).toEqual([{ slot: "SALES", signed_by: "Mock Sales" }, { slot: "FINANCE", signed_by: "Mock Finance" }]);
    expect(p.contract_value).toBe(12345678.5);
  });

  it("every field reloads exactly as saved", () => {
    const original = filledForm();
    const reloaded = formFromRecord(rowsFromPayload(toSavePayload(original)));
    const expected = withoutKeys(original);
    expected.id = "oc-1";
    expected.security_items = expected.security_items.slice(0, 4);
    expected.contacts = expected.contacts.slice(0, 2);
    expected.warranty.detail_text = "";
    expect(withoutKeys(reloaded)).toEqual(expected);
  });
});

describe("PO At Glance — digital sign-off", () => {
  it("shows the signing date and time in India time", () => {
    expect(formatSignedAt(SIGNED_AT)).toBe("12/10/2026, 11:58 AM");
    expect(formatSignedAt("")).toBe("");
  });

  it("a typed or changed name is signed on the next save; an unchanged name keeps its time", () => {
    expect(signoffPending({ signed_by: "Asha", saved_by: "" })).toBe(true);
    expect(signoffPending({ signed_by: "Asha K", saved_by: "Asha" })).toBe(true);
    expect(signoffPending({ signed_by: " Asha ", saved_by: "Asha" })).toBe(false);
    expect(signoffPending({ signed_by: "", saved_by: "Asha" })).toBe(false);
  });
});

describe("PO At Glance — amount in words and file name", () => {
  it("writes the contract value in Indian words (lakh, crore)", () => {
    expect(contractValueInWords("12345678.5")).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only",
    );
    expect(contractValueInWords("150000")).toBe("Rupees One Lakh Fifty Thousand Only");
    expect(contractValueInWords("1000000000")).toBe("Rupees One Hundred Crore Only");
    expect(contractValueInWords("")).toBe("");
  });

  it("names exports OC_<OC no>_<client short>_<yyyymmdd>", () => {
    expect(ocExportFileName(filledForm())).toBe("PO_At_Glance_IFSPL-IEV-OCC-26-27-00007_Mock_Client_Industries_20261012");
  });
});

describe("PO At Glance — Word export", () => {
  it("matches the paper form: header, title, grid, sections and values", async () => {
    const buf = await buildOcDocxBuffer(filledForm());
    const xml = new PizZip(buf).file("word/document.xml").asText();
    const text = xml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/\s+/g, " ");
    for (const s of [
      OC_COMPANY_NAME, OC_DOC_REF, OC_FORM_TITLE, OC_SECURITY_HEADING, "Cost Center in Tally", "Whether SEZ",
      "LD / Penalty Clause, if any", "Release date / adjust against SD", "Customer's contact details",
      "WO/PO disseminated to concerned departments", "Group Head or IEV Head",
      "IFSPL-IEV-OCC-26/27-00007", "₹ 1,23,45,678.50", "0.5% per week", "SD Applicability: Yes", "Adjust against SD",
      "9999900002", "eng2@example.test", "1. 30% — Advance — within 0 days",
      "Name: Mock Sales", "Digitally signed", "Date & time: 12/10/2026, 11:58 AM",
    ]) {
      expect(text).toContain(s);
    }
    const order = ["Cost Center in Tally", "OC No.", "Client Name", "PO/WO No.", "Project Description", "Duration of Job",
      "Contract Value", "Payment Terms", "LD / Penalty", "Security items", "EMD", "Defect Liability Period", "Warranty",
      "RTO / Insurance", "Any Other Information", "Customer's contact details", "Remarks", "WO/PO disseminated"];
    let from = 0;
    for (const label of order) {
      const at = text.indexOf(label, from);
      expect(at, `${label} after the previous section`).toBeGreaterThanOrEqual(from);
      from = at + label.length;
    }
    expect(xml).toContain('w:w="11906"');
    expect([...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => m[1])).toEqual(["5416", "3610", "2100", "2700", "1700", "2526"]);
    if (process.env.OC_EXPORT_SAMPLE) fs.writeFileSync(path.join(os.tmpdir(), "oc-export-sample.docx"), buf);
  });

  it("puts the Indus logo in the header and labels the contract value as excluding taxes", async () => {
    const logo = fs.readFileSync("public/indus-logo.png");
    const zip = new PizZip(await buildOcDocxBuffer(filledForm(), { logo }));
    const xml = zip.file("word/document.xml").asText();
    expect(Object.keys(zip.files).some((n) => /^word\/media\/.+\.png$/.test(n))).toBe(true);
    expect(xml).toContain("<w:drawing>");
    expect([...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].slice(0, 3).map((m) => m[1])).toEqual(["1000", "4416", "3610"]);
    expect(xml).toContain("Contract Value (Excluding Taxes)");
    expect(xml).not.toContain("Including Taxes");
  });

  it("prints blank rows where the paper form is blank", async () => {
    const f = emptyOcForm();
    const xml = new PizZip(await buildOcDocxBuffer(f)).file("word/document.xml").asText();
    expect(xml).toContain("☐ Yes");
    expect((xml.match(/<w:tr[ >]/g) || []).length).toBeGreaterThan(25);
  });
});

describe("PO At Glance — naming", () => {
  it("shows PO At Glance and never the old OC Creation name on screens or in the export", async () => {
    expect(OC_FORM_TITLE).toBe("PO AT GLANCE");
    const files = [
      ...fs.readdirSync("src/pages/projects/oc").map((f) => `src/pages/projects/oc/${f}`),
      "src/pages/projects/FireTenderNavbar.jsx",
      "src/pages/projects/configurationTender/OcSignoffAssignmentPage.jsx",
      "src/lib/ievConfigAccess.js",
    ];
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/OC Creation|OC CREATION/);
    expect(fs.readFileSync("src/lib/ievConfigAccess.js", "utf8")).toContain('"PO At Glance Sign-off Assignment"');
    const xml = new PizZip(await buildOcDocxBuffer(filledForm())).file("word/document.xml").asText();
    expect(xml).toContain("PO AT GLANCE");
    expect(xml).not.toContain("OC CREATION");
  });
});
