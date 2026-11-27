/**
 * Site Ledger domain constants (extracted from SiteLedgerApp.jsx — values unchanged).
 *
 * PARENTS is a live, mutable registry kept in sync from app state via syncParents(arr)
 * so module-level helpers (parentLabel, displayStructure, ...) reflect parent edits.
 */
import { CHART_SERIES, TOKENS } from "../../../../theme/tokens";
import {
  buildMonthOptions,
  PERIOD_END_YEAR,
  PENDING_HISTORY_CUTOFF_KEY,
} from "../../lib/periods";

export { TOKENS, PERIOD_END_YEAR, PENDING_HISTORY_CUTOFF_KEY };


/* ───────────────────────── DOMAIN MODEL ─────────────────────────
   Two-level expense hierarchy:
     PARENTS  (6 reportable heads, shown by default)
       └─ CHILD_HEADS (the atomic cost lines; data is entered here)
   A site's `structure` = ordered parents, each with ordered child keys it uses.
*/

export const REVENUE_ITEMS = [
  { key: "saleRevenue", label: "Sale Revenue", sign: 1 },
  { key: "esicBill", label: "Reimbursement", sign: 1 },
  { key: "creditNote", label: "less: Credit Note / deductions", sign: -1 },
];

export const DEFAULT_PARENTS = [
  { key: "salaryCost", label: "Salary Cost", color: CHART_SERIES[0] },
  { key: "empBenefit", label: "Employee Benefit", color: CHART_SERIES[1] },
  { key: "facilities", label: "Facilities & Site Keep-up", color: CHART_SERIES[2] },
  { key: "uniformPpe", label: "Uniform/PPE's", color: CHART_SERIES[5] },
  { key: "adminMisc", label: "Admin & Other Misc. Expenses", color: CHART_SERIES[3] },
  { key: "fireTenderVehicle", label: "Fire Tender & Utility Vehicle", color: CHART_SERIES[4] },
];
/** Migrate legacy parent keys from older Site Ledger versions. */
export const PARENT_KEY_MIGRATE = {
  vehicle: "fireTenderVehicle",
  maintenance: "fireTenderVehicle",
  admin: "adminMisc",
  facilities: "facilities",
};
export const PARENT_PALETTE = [...CHART_SERIES];
// Live, mutable registry (kept in sync from App state so module helpers stay valid)
export const PARENTS = DEFAULT_PARENTS.map((p) => ({ ...p }));
export function syncParents(arr) { PARENTS.splice(0, PARENTS.length, ...arr.map((p) => ({ ...p }))); }
export const parentDef = (k) => PARENTS.find((p) => p.key === k);
export const parentColor = (k) => parentDef(k)?.color || TOKENS.critical;
export const parentLabel = (k) => parentDef(k)?.label || k;

// Library of child cost lines. `parent` is the default parent (sites can move them).
export const CHILD_HEADS = [
  { key: "salaries", label: "Gross Salary", parent: "salaryCost" },
  { key: "salariesOT", label: "Overtime Payment", parent: "salaryCost" },
  { key: "holiday", label: "National / Public Holiday Payment", parent: "salaryCost" },
  { key: "voucher", label: "Voucher Payment", parent: "salaryCost" },
  { key: "bonus", label: "Bonus", parent: "salaryCost" },
  { key: "gratuity", label: "Gratuity", parent: "salaryCost" },
  { key: "pf", label: "Provident Fund (PF)", parent: "empBenefit" },
  { key: "esicEmp", label: "ESI / WC", parent: "empBenefit" },
  { key: "insurance", label: "Insurance / Mediclaim", parent: "empBenefit" },
  { key: "medical", label: "Medical Expense", parent: "empBenefit" },
  { key: "empBenefit", label: "Employee welfare / benefit", parent: "empBenefit" },
  { key: "uniform", label: "Uniform / PPE", parent: "uniformPpe" },
  { key: "houseRent", label: "House Rent", parent: "facilities" },
  { key: "cook", label: "Cook Salary", parent: "facilities" },
  { key: "housekeeping", label: "Housekeeping salary & material", parent: "facilities" },
  { key: "vehicleRent", label: "Vehicle rent (temporary)", parent: "fireTenderVehicle" },
  { key: "vehicleRepair", label: "Vehicle repair & maintenance", parent: "fireTenderVehicle" },
  { key: "vehicleEMI", label: "Vehicle EMI / Reg / Insurance", parent: "fireTenderVehicle" },
  { key: "fuel", label: "Petrol & Diesel", parent: "fireTenderVehicle" },
  { key: "purchaseRepair", label: "Purchase / repair & maint.", parent: "fireTenderVehicle" },
  { key: "equipment", label: "Equipment / Tools purchase", parent: "fireTenderVehicle" },
  { key: "labourLicence", label: "Labour Licence fees", parent: "adminMisc" },
  { key: "indirect", label: "Indirect expenses", parent: "adminMisc" },
  { key: "bankCharges", label: "Bank charges / BG", parent: "adminMisc" },
  { key: "bizPromo", label: "Business Promotion", parent: "adminMisc" },
];

// Default child components seeded into every newly added site (per parent head).
// Labels are matched against the global library; missing heads are created.
export const DEFAULT_SITE_CHILD_TEMPLATE = [
  { parent: "salaryCost", labels: ["Gross Salary", "Overtime Payment", "Voucher Payment", "Bonus"] },
  { parent: "empBenefit", labels: ["PF", "ESIC", "GMC/GPA/WC", "Operational Cost", "Medical Reimbursement/PME"] },
  { parent: "facilities", labels: ["House Rent", "Vehicle Rent", "Housekeeping & Furnishing Items", "Repair & Maint. Equipments"] },
  { parent: "uniformPpe", labels: ["Uniform / PPE"] },
  { parent: "adminMisc", labels: ["Communication Expenses", "Travelling & Conveyance Expenses", "Bank Charges/ BD/BG/Labour License Expense"] },
  { parent: "fireTenderVehicle", labels: ["Fire Tender Rent", "Vehicle Repair & Maintenance", "FT/Vehicle EMI"] },
];

export const TARGET_MARGIN = 12;
export const WARN_MARGIN = 8;

export const SL_VALID_VIEWS = new Set(["overview", "sites", "site", "config", "entry", "reports"]);

/* ───────────────────────── MONTHS ───────────────────────── */
export const MONTHS = buildMonthOptions();
