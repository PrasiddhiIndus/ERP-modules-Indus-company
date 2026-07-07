import * as XLSX from "xlsx";
import { MODULES } from "../config/roles";
import { managerDisplayLabel } from "./userManagementHierarchy";
import { roleLabel, teamLabel } from "../pages/userManagement/userManagementLabels";

const moduleLabel = (value) =>
  MODULES.find((m) => m.value === value)?.label ?? teamLabel(value);

export function buildUserManagementExportRows(profiles, options = {}) {
  const { includeEmpCode = true, includeHierarchy = true } = options;

  return (profiles || []).map((row, idx) => {
    const exportRow = {
      "S.No": idx + 1,
      Username: row.username || "—",
    };

    if (includeEmpCode) {
      exportRow["Emp code"] = row.employee_code || row.linked_employee_code || "—";
    }

    exportRow.Email = row.email || "—";
    exportRow.Team = teamLabel(row.team);
    exportRow.Role = roleLabel(row.role);

    if (includeHierarchy) {
      exportRow["L1 Manager"] = managerDisplayLabel(
        row.l1_manager_code,
        row.l1_manager_name
      );
      exportRow["L2 Manager"] = managerDisplayLabel(
        row.l2_manager_code,
        row.l2_manager_name
      );
    }

    exportRow["Extra modules"] =
      Array.isArray(row.allowed_modules) && row.allowed_modules.length
        ? row.allowed_modules.map((m) => moduleLabel(m)).join(", ")
        : "—";

    return exportRow;
  });
}

export function exportUserManagementToExcel(rows, filename = "users-export") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
