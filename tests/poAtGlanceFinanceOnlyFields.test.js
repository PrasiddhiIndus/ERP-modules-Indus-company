/**
 * PO At Glance: OC No. and Cost Center in Tally are Finance Department only on every PO type
 * (UI locks them for everyone else; database guards reject changes from non-Finance logins).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const MIGRATIONS = "supabase/migrations";
const TABLES = ["oc_master", "mm_oc_master", "pj_oc_master", "rm_oc_master", "cm_oc_master"];

describe("PO At Glance — Finance-only OC No. and Cost Center in Tally", () => {
  const costCenter = read(`${MIGRATIONS}/20261118160000_po_at_glance_cost_center_finance_only.sql`);

  it("guards Cost Center in Tally on all five PO tables for Finance / Master PO users only", () => {
    for (const t of TABLES) {
      expect(costCenter).toMatch(new RegExp(`BEFORE INSERT OR UPDATE OF cost_center_tally ON public\\.${t}\\b`));
    }
    expect(costCenter).toContain("NOT public.oc_current_user_is_finance()");
    expect(costCenter).toContain("NOT public.finance_po_current_user_has_master_access()");
    expect(costCenter).toContain("'Only the Finance Department can fill or change Cost Center in Tally.'");
  });

  it("lets Finance set Cost Center in Tally from Master PO At Glance on every Master PO type", () => {
    for (const d of ["projects", "maintenance", "iev", "rm"]) expect(costCenter).toContain(`p_department = '${d}'`);
  });

  it("keeps the existing database OC No. guard on all five PO tables", () => {
    const files = fs.readdirSync(MIGRATIONS).sort().map((f) => read(`${MIGRATIONS}/${f}`));
    for (const fn of ["oc_master_guard", "mm_oc_master_guard", "pj_oc_master_guard", "rm_oc_master_guard", "cm_oc_master_guard"]) {
      const marker = `CREATE OR REPLACE FUNCTION public.${fn}()`;
      const latest = files.filter((sql) => sql.includes(marker)).pop();
      expect(latest, fn).toBeTruthy();
      const body = latest.slice(latest.lastIndexOf(marker)).split("$$;")[0];
      expect(body, fn).toContain("Only the Finance Department can fill or change the OC No.");
    }
  });

  it("locks both fields in the shared form unless the user is Finance (or in Master PO At Glance)", () => {
    const src = read("src/pages/projects/oc/OcCreationForm.jsx");
    expect(src).toContain("const tallyEditable = financeReview || isFinance;");
    expect(src).toContain("const ocReadOnly = financeReview ? !ocUnlocked : !isFinance;");
    expect(src).toMatch(/readOnly=\{!tallyEditable\}/);
    expect(src).not.toMatch(/maintenancePo \? true/);
  });

  it("locks both fields in the Commercial form unless the user is Finance", () => {
    const src = read("src/pages/commercial/poAtGlance/CommercialPoForm.jsx");
    const block = src.slice(src.indexOf("<Label>Cost Center in Tally</Label>"), src.indexOf("<Label>Customer</Label>"));
    expect((block.match(/readOnly=\{!isFinance\}/g) || []).length).toBe(3); // Cost Center, OC No., OC date
    expect(block).toContain('if (isFinance) set("cost_center_tally"');
  });
});
