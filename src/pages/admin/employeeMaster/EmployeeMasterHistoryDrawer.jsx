import React, { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { Drawer } from "../../adminOperations/components/AdminUi";
import {
  fetchEmployeeMasterFieldHistory,
  formatEmployeeHistorySentence,
} from "./employeeMasterHistory";

/**
 * Employee Master — full field-change audit trail for one employee.
 */
export default function EmployeeMasterHistoryDrawer({ open, onClose, employee }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const empId = employee?.id;
  const titleName = String(employee?.full_name || employee?.employee_code || "Employee").trim();

  async function load() {
    if (!empId) return;
    setLoading(true);
    setError("");
    try {
      const list = await fetchEmployeeMasterFieldHistory(empId);
      setRows(list);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Could not load change history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !empId) {
      setRows([]);
      setError("");
      return undefined;
    }
    void load();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when drawer opens for this employee
  }, [open, empId]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Change history — ${titleName}`}
      widthClass="max-w-xl"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs text-gray-500">
          Every field change on this employee record (who, field, previous value, new value, date &amp; time).
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading history…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-4">{error}</p>
      ) : !rows.length ? (
        <div className="py-10 text-center text-gray-500">
          <History className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">No changes recorded yet</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Edits made after history tracking was enabled will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-800"
            >
              <p className="leading-snug">{formatEmployeeHistorySentence(row)}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                <dt className="font-medium text-gray-600">Field</dt>
                <dd>{row.field_label || row.field_key}</dd>
                {row.field_key !== "__created__" ? (
                  <>
                    <dt className="font-medium text-gray-600">Previous</dt>
                    <dd className="break-words">{row.old_value?.trim() ? row.old_value : "—"}</dd>
                    <dt className="font-medium text-gray-600">New</dt>
                    <dd className="break-words">{row.new_value?.trim() ? row.new_value : "—"}</dd>
                  </>
                ) : null}
                <dt className="font-medium text-gray-600">By</dt>
                <dd>{row.changed_by_name || "—"}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
