import React from "react";
import { columnsHaveSerialNumber } from "../utils/listTable";

/**
 * Lightweight list table with automatic S.No column (unless disabled or already present).
 */
export function ListTable({
  columns,
  rows,
  rowKey = "id",
  onRowClick,
  showSerialNumber = "auto",
  serialLabel = "S.No",
  serialOffset = 0,
  emptyMessage = "No records",
  className = "",
  tableClassName = "min-w-full text-xs",
  theadClassName = "bg-gray-50 border-b border-gray-200 text-gray-600",
  tbodyClassName = "bg-white divide-y divide-gray-100",
}) {
  const shouldShowSerial =
    showSerialNumber === false
      ? false
      : showSerialNumber === true
        ? true
        : !columnsHaveSerialNumber(columns);

  const effectiveColumns = shouldShowSerial
    ? [{ key: "__sn", label: serialLabel, className: "text-center w-11" }, ...columns]
    : columns;

  return (
    <div className={`overflow-x-auto border border-gray-200 rounded-lg ${className}`.trim()}>
      <table className={tableClassName}>
        <thead className={theadClassName}>
          <tr>
            {effectiveColumns.map((col) => (
              <th
                key={col.key}
                className={`text-left px-2 py-2 font-semibold whitespace-nowrap ${col.headerClassName || col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbodyClassName}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={effectiveColumns.length} className="px-3 py-6 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={row[rowKey] ?? rowIndex}
                className={onRowClick ? "cursor-pointer hover:bg-blue-50/40" : ""}
                onClick={() => onRowClick?.(row)}
              >
                {effectiveColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-2 py-1.5 align-middle text-gray-800 ${col.cellClassName || col.className || ""}`}
                  >
                    {col.key === "__sn"
                      ? rowIndex + 1 + serialOffset
                      : col.render
                        ? col.render(row, rowIndex)
                        : row[col.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
