import React, { useMemo } from "react";
import { prependSerialColumn, columnsHaveSerialNumber, resolveSerialCellValue } from "../../utils/listTable";
import { splitRowsIntoGroups } from "./attendanceTableHelpers";

function renderCell(col, row, rowIndex) {
  if (col.key === "__sn") return resolveSerialCellValue(col, rowIndex);
  if (col.render) return col.render(row);
  const value = row[col.key];
  return value == null || value === "" ? "—" : value;
}

function renderHeader(col) {
  if (col.headerRender) return col.headerRender();
  return col.label;
}

/**
 * Single semantic HTML table for attendance register — flat or grouped rows.
 */
export default function AttendanceRegisterTable({
  columns,
  rows,
  groupBy = "none",
  rowKey = "id",
  serialOffset = 0,
  loading = false,
}) {
  const tableColumns = useMemo(() => {
    const withSerial = prependSerialColumn(columns, {
      label: "S.No",
      offset: serialOffset,
      enabled: !columnsHaveSerialNumber(columns),
    });
    return withSerial;
  }, [columns, serialOffset]);

  const groupedRows = useMemo(() => {
    if (groupBy === "none") {
      return rows.map((row, index) => ({ type: "data", row, index }));
    }
    const groups = splitRowsIntoGroups(rows, groupBy);
    const out = [];
    let index = 0;
    for (const group of groups) {
      out.push({ type: "group", key: group.key, label: group.label, count: group.rows.length });
      for (const row of group.rows) {
        out.push({ type: "data", row, index });
        index += 1;
      }
    }
    return out;
  }, [rows, groupBy]);

  const colCount = tableColumns.length;

  return (
    <div className="w-full min-w-0 rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100dvh-20rem)] erp-attendance-register-scroll">
        <table className="w-full min-w-[1100px] text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_#e5e7eb]">
            <tr className="border-b border-gray-200 text-gray-600">
              {tableColumns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  title={col.headerTitle || col.label}
                  className={`text-left font-semibold px-3 py-2.5 whitespace-nowrap bg-gray-50 ${col.headerClassName || ""}`}
                >
                  {renderHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-gray-500">
                  Loading records…
                </td>
              </tr>
            ) : groupedRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-gray-500">
                  No records
                </td>
              </tr>
            ) : (
              groupedRows.map((entry, entryIndex) => {
                if (entry.type === "group") {
                  return (
                    <tr key={`group-${entry.key}`} className="bg-slate-100 border-y border-slate-200">
                      <td colSpan={colCount} className="px-3 py-2 text-xs font-semibold text-gray-800">
                        <span className="truncate">{entry.label}</span>
                        <span className="ml-2 font-normal text-gray-500 tabular-nums">
                          ({entry.count} record{entry.count === 1 ? "" : "s"})
                        </span>
                      </td>
                    </tr>
                  );
                }

                const { row, index } = entry;
                const zebra = index % 2 === 1 ? "bg-slate-50/60" : "bg-white";
                return (
                  <tr
                    key={row[rowKey] ?? `row-${entryIndex}`}
                    className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${zebra}`}
                  >
                    {tableColumns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 align-middle text-gray-800 ${col.cellClassName || ""}`}
                      >
                        {renderCell(col, row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
