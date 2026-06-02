import React, { useMemo } from "react";
import { TinyInput } from "../components/AdminUi";

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

export function BulkMarkEmployeePicker({
  employees,
  selectedCodes,
  onToggleSelect,
  onClearSelected,
  search,
  onSearchChange,
  markLabel,
  bulkDate,
  dayMarkByCode = {},
}) {
  const needle = search.trim().toLowerCase();

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const available = useMemo(
    () =>
      employees.filter((row) => row.empCode && !selectedSet.has(row.empCode) && matchesSearch(row, needle)),
    [employees, needle, selectedSet]
  );

  const selected = useMemo(() => {
    const byCode = new Map(employees.filter((r) => r.empCode).map((r) => [r.empCode, r]));
    return selectedCodes
      .map((code) => byCode.get(code))
      .filter(Boolean)
      .filter((row) => matchesSearch(row, needle));
  }, [employees, needle, selectedCodes]);

  const listClass =
    "h-48 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100";

  const itemClass =
    "w-full text-left px-2 py-1.5 text-[11px] text-gray-800 hover:bg-blue-50 cursor-pointer truncate";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-600">
          Select employees for bulk <strong>{markLabel}</strong>
          {bulkDate ? ` on ${bulkDate}` : ""}. Click a name to move between lists.
        </p>
        <span className="text-[10px] text-gray-500 tabular-nums">
          {selectedCodes.length} selected · {available.length} available
        </span>
      </div>

      <label className="block text-[11px] text-gray-600">
        Search employees
        <TinyInput
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Name, code, ID, department…"
          className="w-full mt-1 max-w-md"
        />
      </label>

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
                    title={existing ? `Current mark: ${existing}` : "Click to select"}
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
              selected.map((row) => (
                <button
                  key={row.empCode}
                  type="button"
                  className={`${itemClass} hover:bg-red-50`}
                  title="Click to remove from selection"
                  onClick={() => onToggleSelect(row.empCode, false)}
                >
                  {employeeLabel(row)}
                </button>
              ))
            )}
          </div>

          {selected.length ? (
            <button
              type="button"
              onClick={() => {
                if (onClearSelected) onClearSelected();
                else selectedCodes.forEach((c) => onToggleSelect(c, false));
              }}
              className="mt-2 w-full h-8 px-3 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50"
            >
              Remove Selected
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
