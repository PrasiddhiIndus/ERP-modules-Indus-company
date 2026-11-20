import * as XLSX from "xlsx";
import { MODULES } from "../config/roles";
import {
  managerDisplayLabel,
  userManagementDisplayName,
  userManagementTeamDisplay,
} from "./userManagementHierarchy";
import { roleLabel, teamLabel } from "../pages/userManagement/userManagementLabels";

/** Fixed export columns. Password is included as a column; values stay blank (not stored/retrievable). */
export const USER_MGMT_EXPORT_COLUMNS = [
  "S.No",
  "Username",
  "Emp Code",
  "Email",
  "Team",
  "Role",
  "L1 Manager",
  "L2 Manager",
  "Extra Modules",
  "Password",
];

const moduleLabel = (value) =>
  MODULES.find((m) => m.value === value)?.label ?? teamLabel(value);

function dash(value) {
  const s = value == null ? "" : String(value).trim();
  return s || "—";
}

/**
 * Build Excel rows from User Management profiles (enriched with hierarchy when available).
 * Password is always blank — auth stores hashes only; plaintext is not available.
 */
export function buildUserManagementExportRows(profiles, options = {}) {
  void options; // retained for callers; columns are always included
  return (profiles || []).map((row, idx) => {
    const empCode = row.employee_code || row.linked_employee_code || "";
    const extra =
      Array.isArray(row.allowed_modules) && row.allowed_modules.length
        ? row.allowed_modules.map((m) => moduleLabel(m)).join(", ")
        : "";

    return {
      "S.No": idx + 1,
      Username: userManagementDisplayName(row),
      "Emp Code": dash(empCode),
      Email: dash(row.email),
      Team: userManagementTeamDisplay(row),
      Role: dash(roleLabel(row.role)),
      "L1 Manager": managerDisplayLabel(row.l1_manager_code, row.l1_manager_name),
      "L2 Manager": managerDisplayLabel(row.l2_manager_code, row.l2_manager_name),
      "Extra Modules": dash(extra),
      // Intentionally empty: plaintext passwords are not stored; never export hashes.
      Password: "",
    };
  });
}

export function exportUserManagementToExcel(rows, filename = "users-export") {
  const safeRows = (rows || []).map((row) => {
    const out = {};
    for (const col of USER_MGMT_EXPORT_COLUMNS) {
      if (col === "Password") {
        out[col] = row?.[col] ?? "";
        continue;
      }
      out[col] = row?.[col] ?? "—";
    }
    return out;
  });

  const aoa = [
    USER_MGMT_EXPORT_COLUMNS,
    ...safeRows.map((r) => USER_MGMT_EXPORT_COLUMNS.map((c) => r[c])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 12 },
    { wch: 32 },
    { wch: 22 },
    { wch: 16 },
    { wch: 28 },
    { wch: 28 },
    { wch: 40 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
