import React, { useMemo } from "react";
import { prependSerialColumn, resolveSerialCellValue } from "../../../utils/listTable";

export const SectionCard = ({ title, right, children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
    <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between gap-2 min-h-[44px]">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {right}
    </div>
    <div className="p-3 sm:p-4">{children}</div>
  </div>
);

export const Badge = ({ children, tone = "bg-gray-100 text-gray-700" }) => (
  <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${tone}`}>{children}</span>
);

export const TinyInput = (props) => (
  <input
    {...props}
    className={`h-8 border border-gray-300 rounded px-2 text-xs ${props.className || ""}`.trim()}
  />
);

export const TinySelect = ({ children, className = "", ...rest }) => (
  <select
    {...rest}
    className={`h-8 border border-gray-300 rounded px-2 text-xs bg-white ${className}`.trim()}
  >
    {children}
  </select>
);

export const FilterBar = ({ children }) => (
  <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50/80">{children}</div>
);

function renderDenseCell(col, row, rowIndex) {
  if (col.key === "__sn") return resolveSerialCellValue(col, rowIndex);
  if (col.render) return col.render(row);
  const value = row[col.key];
  return value == null || value === "" ? "—" : value;
}

export const DenseTable = ({ columns, rows, rowKey = "id", serialOffset = 0 }) => {
  const tableColumns = useMemo(
    () => prependSerialColumn(columns, { offset: serialOffset, enabled: true }),
    [columns, serialOffset]
  );

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-max min-w-full text-xs border-separate border-spacing-0">
        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
          <tr>
            {tableColumns.map((c) => (
              <th key={c.key} className="text-left font-semibold px-2 py-2 whitespace-nowrap bg-gray-50">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={tableColumns.length} className="px-3 py-6 text-center text-gray-500">
                No records
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={row[rowKey]} className="group">
                {tableColumns.map((c) => (
                  <td
                    key={c.key}
                    className="px-2 py-1.5 align-middle text-gray-800 whitespace-nowrap bg-white group-hover:bg-red-50/40"
                  >
                    {renderDenseCell(c, row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
