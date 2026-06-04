import React, { useMemo } from "react";
import { TinyInput, TinySelect } from "../components/AdminUi";

function employeeLabel(row) {
  const name = row.employeeName || row.empCode || "—";
  const code = row.empCode ? ` (${row.empCode})` : "";
  return `${name}${code}`;
}

function matchesSearch(row, needle) {
  if (!needle) return true;
  const hay = [row.employeeName, row.empCode, row.employeeId, row.department].join(" ").toLowerCase();
  return hay.includes(needle);
}

export const BULK_EMPLOYEE_MARK_FILTERS = [
  { id: "all", label: "All employees" },
  { id: "present", label: "Present (P) on any day in range" },
  { id: "unmarked", label: "Unmarked on any day in range" },
  { id: "marked", label: "Has a mark on any day in range" },
];

export function BulkMarkEmployeePicker({
  employees,
  selectedCodes,
  onToggleSelect,
  onClearSelected,
  onSelectAll,
  search,
  onSearchChange,
  markLabel,
  bulkDateFrom,
  bulkDateTo,
  dayMarkByCode = {},
  markFilter = "all",
  onMarkFilterChange,
}) {
  const needle = search.trim().toLowerCase();
  const rangeLabel =
    bulkDateFrom && bulkDateTo && bulkDateFrom !== bulkDateTo
      ? `${bulkDateFrom} → ${bulkDateTo}`
      : bulkDateFrom || bulkDateTo || "";

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const pool = useMemo(
    () => employees.filter((row) => row.empCode && matchesSearch(row, needle)),
    [employees, needle]
  );

  const available = useMemo(
    () => pool.filter((row) => !selectedSet.has(row.empCode)),
    [pool, selectedSet]
  );

  const selected = useMemo(() => {
    const byCode = new Map(employees.map((r) => [r.empCode, r]));
    return selectedCodes.map((code) => byCode.get(code)).filter(Boolean);
  }, [employees, selectedCodes]);

  const listClass =
    "h-48 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100";

  const itemClass =
    "w-full text-left px-2 py-1.5 text-[11px] text-gray-800 hover:bg-blue-50 cursor-pointer truncate";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-600">
          Select employees for bulk <strong>{markLabel}</strong>
          {rangeLabel ? ` · ${rangeLabel}` : ""}. Marks apply horizontally across the date range for{" "}
          <strong>selected employees only</strong>.
        </p>
        <span className="text-[10px] text-gray-500 tabular-nums">
          {selectedCodes.length} selected · {available.length} available
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="block text-[11px] text-gray-600 min-w-[200px]">
          Search employees
          <TinyInput
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name, code, ID, department…"
            className="w-full mt-1 max-w-md"
          />
        </label>
        {onSelectAll ? (
          <button
            type="button"
            onClick={onSelectAll}
            disabled={!employees.length}
            className="h-8 px-3 rounded-lg border border-[#1F3A8A] bg-[#1F3A8A]/5 text-[#1F3A8A] text-xs font-semibold hover:bg-[#1F3A8A]/10 disabled:opacity-50"
          >
            Select all
          </button>
        ) : null}
        {onMarkFilterChange ? (
          <label className="block text-[11px] text-gray-600 min-w-[220px]">
            Filter list
            <TinySelect
              value={markFilter}
              onChange={(e) => onMarkFilterChange(e.target.value)}
              className="w-full mt-1"
            >
              {BULK_EMPLOYEE_MARK_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </TinySelect>
          </label>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase text-gray-500 mb-1">Available</p>
          <div className={listClass} role="listbox" aria-label="Available employees">
            {available.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-gray-400 text-center">No employees to show</p>
            ) : (
              available.map((row) => {
                const existing = dayMarkByCode[row.empCode];
                return (
                  <button
                    key={row.empCode}
                    type="button"
                    className={itemClass}
                    title={existing ? `Mark in range: ${existing}` : "Click to select"}
                    onClick={() => onToggleSelect(row.empCode, true)}
                  >
                    {employeeLabel(row)}
                    {existing ? (
                      <span className="ml-1 text-[10px] text-amber-700">[{existing}]</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase text-gray-500 mb-1">Selected for bulk mark</p>
          <div className={listClass} role="listbox" aria-label="Selected employees">
            {selected.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-gray-400 text-center">Click employees on the left to add</p>
            ) : (
              selected.map((row) => {
                const existing = dayMarkByCode[row.empCode];
                return (
                  <button
                    key={row.empCode}
                    type="button"
                    className={`${itemClass} hover:bg-red-50`}
                    title={existing ? `Mark in range: ${existing}` : "Click to remove from selection"}
                    onClick={() => onToggleSelect(row.empCode, false)}
                  >
                    {employeeLabel(row)}
                    {existing ? (
                      <span className="ml-1 text-[10px] text-amber-700">[{existing}]</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {selectedCodes.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onClearSelected) onClearSelected();
                else selectedCodes.forEach((c) => onToggleSelect(c, false));
              }}
              className="mt-2 w-full h-8 px-3 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50"
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
