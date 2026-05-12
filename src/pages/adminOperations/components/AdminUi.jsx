import React from "react";

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

const severityTone = {
  info: "bg-sky-50 text-sky-800 border-sky-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  high: "bg-orange-50 text-orange-900 border-orange-200",
  critical: "bg-red-50 text-red-900 border-red-200",
};

export const StatusChip = ({ label, severity = "info" }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
      severityTone[severity] || severityTone.info
    }`}
  >
    {label}
  </span>
);

export const KpiTile = ({ label, value, sub, onClick, tone = "border-gray-100" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left w-full rounded-xl border ${tone} bg-white shadow-sm px-3 py-2.5 hover:border-[#1F3A8A]/40 hover:shadow transition`}
  >
    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
    <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
    {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
  </button>
);

export const FilterBar = ({ children }) => (
  <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50/80">{children}</div>
);

export const DenseTable = ({ columns, rows, onRowClick, rowKey = "id" }) => (
  <div className="overflow-x-auto rounded-lg border border-gray-200">
    <table className="min-w-full text-xs">
      <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
        <tr>
          {columns.map((c) => (
            <th key={c.key} className="text-left font-semibold px-2 py-2 whitespace-nowrap">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 bg-white">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">
              No records
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row[rowKey]}
              className={onRowClick ? "cursor-pointer hover:bg-blue-50/40" : ""}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1.5 align-middle text-gray-800 whitespace-nowrap">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export function Drawer({ open, title, onClose, children, widthClass = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close drawer" onClick={onClose} />
      <div
        className={`relative ml-auto h-full w-full ${widthClass} bg-white shadow-2xl border-l border-gray-200 flex flex-col`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 text-lg leading-none px-1">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, widthClass = "max-w-md" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl border border-gray-200 w-full ${widthClass} max-h-[90vh] flex flex-col`}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            ×
          </button>
        </div>
        <div className="p-4 overflow-y-auto text-sm">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export const LinkedChip = ({ label, toHint }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-[11px] text-blue-800">
    {label}
    {toHint && <span className="text-blue-500">→ {toHint}</span>}
  </span>
);

export const Timeline = ({ items }) => (
  <ul className="space-y-2 border-l-2 border-gray-200 ml-1 pl-3">
    {items.map((it, i) => (
      <li key={i} className="relative">
        <span className="absolute -left-[7px] top-1.5 w-2 h-2 rounded-full bg-[#1F3A8A]" />
        <p className="text-xs font-medium text-gray-900">{it.title}</p>
        <p className="text-[11px] text-gray-500">{it.meta}</p>
      </li>
    ))}
  </ul>
);
