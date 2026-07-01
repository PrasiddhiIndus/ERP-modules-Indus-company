import React, { useCallback, useMemo, useRef, useState } from "react";
import { DAHEJ_EXPENSE_COLUMNS, DAHEJ_GRID_GROUPS } from "../constants/columns";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";;
import FormDateInput from "../../../../components/FormDateInput";


function CellInput({ column, value, onChange, disabled, onKeyDown }) {
  const common = "w-full h-7 px-1 text-[11px] border-0 bg-transparent focus:bg-blue-50 focus:ring-1 focus:ring-[#1F3A8A] rounded outline-none";
  if (column.type === "date") {
    return (
      <FormDateInput className={common} value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    );
  }
  if (column.type === "currency" || column.type === "number") {
    return (
      <input
        type="number"
        step={column.type === "currency" ? "0.01" : "1"}
        className={`${common} text-right tabular-nums`}
        value={value === 0 || value === "" ? "" : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onKeyDown={onKeyDown}
      />
    );
  }
  return (
    <input
      type="text"
      className={common}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export default function DahejExpenseGrid({ rows, onSave, readOnly = false, showBalance = true }) {
  const { bookingLocations, vehicles, monthClosed } = useDahejExpenses();
  const [selected, setSelected] = useState(new Set());
  const [editCell, setEditCell] = useState(null);
  const gridRef = useRef(null);

  const totals = useMemo(() => {
    const t = {};
    DAHEJ_EXPENSE_COLUMNS.forEach((c) => {
      if (c.type === "currency" || c.type === "number") {
        t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      }
    });
    t._running_balance = rows.length ? rows[rows.length - 1]._running_balance : 0;
    return t;
  }, [rows]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCellChange = useCallback(
    (row, key, value) => {
      const updated = { ...row, [key]: value };
      onSave(updated);
    },
    [onSave]
  );

  const frozenWidth = 64;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div ref={gridRef} className="overflow-auto max-h-[calc(100vh-280px)] erp-table-exempt">
        <table className="border-collapse min-w-max w-full text-[11px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#1F3A8A] text-white">
              <th className="sticky left-0 z-30 bg-[#1F3A8A] px-1 py-1 w-8 border-r border-blue-700" rowSpan={2}>
                <input
                  type="checkbox"
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                  checked={selected.size === rows.length && rows.length > 0}
                />
              </th>
              {DAHEJ_GRID_GROUPS.map((g) => {
                const cols = DAHEJ_EXPENSE_COLUMNS.filter((c) => c.group === g.id);
                if (!cols.length) return null;
                return (
                  <th
                    key={g.id}
                    colSpan={cols.length}
                    className="px-2 py-1 text-center font-semibold border-r border-blue-600 text-[10px] uppercase tracking-wide"
                  >
                    {g.label}
                  </th>
                );
              })}
              <th rowSpan={2} className="px-2 py-1 text-center font-semibold bg-[#172554] min-w-[72px]">
                Status
              </th>
              {showBalance && (
                <th rowSpan={2} className="px-2 py-1 text-center font-semibold bg-[#172554] min-w-[96px]">
                  Running Balance
                </th>
              )}
            </tr>
            <tr className="bg-[#2563eb] text-white">
              {DAHEJ_EXPENSE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-1 py-1.5 text-left font-medium border-r border-blue-500 whitespace-nowrap ${
                    col.frozen ? "sticky z-20 bg-[#2563eb]" : ""
                  }`}
                  style={{
                    minWidth: col.width,
                    ...(col.frozen ? { left: frozenWidth } : {}),
                  }}
                  title={col.label}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={DAHEJ_EXPENSE_COLUMNS.length + 3} className="py-12 text-center text-gray-500">
                  No entries for this month. Add rows or import from Excel.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30`}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-1 py-0 border-r border-gray-200">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  {DAHEJ_EXPENSE_COLUMNS.map((col) => {
                    const cellId = `${row.id}-${col.key}`;
                    const isEditing = editCell === cellId;
                    const disabled = readOnly || monthClosed;

                    if (col.key === "expense_booked_under" && !readOnly) {
                      return (
                        <td key={col.key} className="p-0 border-r border-gray-100" style={{ minWidth: col.width }}>
                          <select
                            className="w-full h-7 px-1 text-[11px] border-0 bg-transparent"
                            value={row.expense_booked_under || ""}
                            disabled={disabled}
                            onChange={(e) => handleCellChange(row, col.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {bookingLocations.filter((l) => l.is_active).map((l) => (
                              <option key={l.id} value={l.name}>{l.name}</option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    if (col.key === "vehicle_utilized_for" && !readOnly && vehicles.length) {
                      return (
                        <td key={col.key} className="p-0 border-r border-gray-100" style={{ minWidth: col.width }}>
                          <select
                            className="w-full h-7 px-1 text-[11px] border-0 bg-transparent"
                            value={row.vehicle_utilized_for || ""}
                            disabled={disabled}
                            onChange={(e) => {
                              const v = vehicles.find((x) => x.name === e.target.value);
                              handleCellChange(row, col.key, e.target.value);
                              if (v) handleCellChange({ ...row, vehicle_utilized_for: e.target.value }, "vehicle_id", v.id);
                            }}
                          >
                            <option value="">—</option>
                            {vehicles.filter((v) => v.is_active).map((v) => (
                              <option key={v.id} value={v.name}>{v.name}{v.registration_no ? ` (${v.registration_no})` : ""}</option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.key}
                        className={`p-0 border-r border-gray-100 ${col.frozen ? "sticky z-10 bg-inherit" : ""}`}
                        style={{ minWidth: col.width, ...(col.frozen ? { left: frozenWidth } : {}) }}
                        onClick={() => !disabled && setEditCell(cellId)}
                      >
                        <CellInput
                          column={col}
                          value={row[col.key]}
                          disabled={disabled}
                          onChange={(v) => handleCellChange(row, col.key, v)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Tab") setEditCell(null);
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-0.5 text-center">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                      row.status === "approved" ? "bg-emerald-100 text-emerald-800" :
                      row.status === "submitted" ? "bg-amber-100 text-amber-800" :
                      row.status === "closed" ? "bg-gray-200 text-gray-700" :
                      "bg-sky-100 text-sky-800"
                    }`}>
                      {row.status || "draft"}
                    </span>
                  </td>
                  {showBalance && (
                    <td className="px-2 py-0.5 text-right tabular-nums font-medium text-[#1F3A8A]">
                      {(row._running_balance ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                  )}
                </tr>
              ))
            )}
            {rows.length > 0 && (
              <tr className="bg-amber-50 font-semibold sticky bottom-0 border-t-2 border-amber-300">
                <td className="sticky left-0 bg-amber-50 px-2 py-1 border-r" colSpan={1} />
                {DAHEJ_EXPENSE_COLUMNS.map((col) => (
                  <td key={col.key} className="px-1 py-1 text-right tabular-nums border-r border-amber-200" style={{ minWidth: col.width }}>
                    {col.key === "sr_no" ? "TOTAL" : col.type === "currency" ? (totals[col.key] || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : ""}
                  </td>
                ))}
                <td />
                {showBalance && (
                  <td className="px-2 py-1 text-right tabular-nums text-amber-900">
                    {(totals._running_balance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { DahejExpenseGrid as useDahejGridSelection };
export function useGridSelection() {
  return useState(new Set());
}
