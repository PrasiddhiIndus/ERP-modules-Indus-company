import React, { useMemo } from "react";
import {
  columnsHaveSerialNumber,
  prependSerialColumn,
  resolveSerialCellValue,
} from "../../../utils/listTable";
import FormDateInput from "../../../components/FormDateInput";

/** Page title block: one primary task per screen (UI design philosophy). */
export function PageTaskHeader({ title, subtitle, children, className = "" }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 mb-1 ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="type-page-title text-ink type-truncate">{title}</h1>
        {subtitle ? <p className="type-meta text-ink-secondary mt-1.5 max-w-3xl">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2.5 shrink-0">{children}</div> : null}
    </div>
  );
}

/** Secondary help — hidden until the user asks (progressive disclosure). */
export function CollapsibleHelp({ label = "How this works", children, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (!children) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-accent hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} {label}
      </button>
      {open ? (
        <div className="mt-2 text-[11px] text-gray-600 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export const SectionCard = ({ title, right, children, className = "" }) => (
  <div className={`bg-surface rounded-card shadow-card border border-border ${className}`}>
    <div className="erp-card-header border-b border-divider flex items-center justify-between gap-3 min-h-[52px] bg-surface-raised rounded-t-card">
      <h3 className="type-card-title text-ink type-truncate">{title}</h3>
      {right}
    </div>
    <div className="erp-card-body">{children}</div>
  </div>
);

export const Badge = ({ children, tone = "bg-surface-sunken text-ink-secondary border border-border" }) => (
  <span className={`erp-badge inline-flex px-2 py-0.5 ${tone}`}>{children}</span>
);

export const TinyInput = ({ type, value, onChange, className = "", ...rest }) => {
  if (type === "date") {
    return (
      <FormDateInput
        value={value}
        onChange={onChange}
        className={`h-8 ${className}`.trim()}
        compact
        {...rest}
      />
    );
  }
  return (
    <input
      {...rest}
      type={type}
      value={value}
      onChange={onChange}
      className={`h-8 border border-gray-300 rounded px-2 text-xs ${className}`.trim()}
    />
  );
};

export const TinySelect = ({ children, className = "", ...rest }) => (
  <select
    {...rest}
    className={`h-8 border border-gray-300 rounded px-2 text-xs bg-white ${className}`.trim()}
  >
    {children}
  </select>
);

const severityTone = {
  info: "bg-info-soft text-info border-info-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  high: "bg-warning-soft text-warning border-warning-border",
  critical: "bg-critical-soft text-critical border-critical-border",
};

export const StatusChip = ({ label, severity = "info" }) => (
  <span
    className={`erp-badge inline-flex items-center border ${
      severityTone[severity] || severityTone.info
    }`}
  >
    {label}
  </span>
);

export const KpiTile = ({ label, value, sub, onClick, tone = "border-border" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left w-full rounded-card border ${tone} bg-surface shadow-card px-4 py-3.5 transition-[border-color,background-color] duration-theme ease-theme ${onClick ? "cursor-pointer hover:border-accent-border" : ""}`}
  >
    <p className="type-mono-caption">{label}</p>
    <p className="type-figure text-ink mt-1.5">{value}</p>
    {sub && <p className="type-meta text-ink-muted mt-1.5">{sub}</p>}
  </button>
);

export const FilterBar = ({ children }) => (
  <div className="flex flex-wrap items-end gap-3 px-3.5 py-3 rounded-lg border border-gray-200 bg-gray-50/80">{children}</div>
);

const DEFAULT_FROZEN_COLUMN_WIDTHS = [88, 104, 180, 132];
const SERIAL_COLUMN_WIDTH = 44;

function renderDenseCell(col, row, rowIndex) {
  if (col.key === "__sn") return resolveSerialCellValue(col, rowIndex);
  if (col.render) return col.render(row);
  const value = row[col.key];
  return value == null || value === "" ? "" : value;
}

function resolveDenseTableColumns(columns, { showSerialNumber, serialLabel, serialOffset }) {
  const shouldShow =
    showSerialNumber === false
      ? false
      : showSerialNumber === true
        ? true
        : !columnsHaveSerialNumber(columns);
  return prependSerialColumn(columns, {
    label: serialLabel,
    offset: serialOffset,
    enabled: shouldShow,
  });
}

function renderDenseHeader(col) {
  if (col.headerRender) return col.headerRender();
  return col.label;
}

function renderDenseFilter(col) {
  if (col.filterRender) return col.filterRender();
  return null;
}

function hasColumnFilters(columns) {
  return (columns || []).some((c) => typeof c.filterRender === "function");
}

/** Excel-style freeze: first N columns stay fixed; only columns to the right scroll horizontally. */
function FreezePaneDenseTable({
  columns,
  rows,
  onRowClick,
  rowKey,
  frozenColumnCount,
  frozenColumnWidths,
  showSerialNumber,
  serialLabel,
  serialOffset,
  stickyHeader = false,
  scrollMaxHeight = "calc(100dvh - 22rem)",
  activeRowId = null,
}) {
  const tableColumns = useMemo(
    () => resolveDenseTableColumns(columns, { showSerialNumber, serialLabel, serialOffset }),
    [columns, showSerialNumber, serialLabel, serialOffset]
  );
  const hasPrependedSerial =
    tableColumns.length > (columns?.length || 0) && tableColumns[0]?.key === "__sn";
  const effectiveFrozenCount = frozenColumnCount + (hasPrependedSerial ? 1 : 0);
  const effectiveFrozenWidths = hasPrependedSerial
    ? [SERIAL_COLUMN_WIDTH, ...frozenColumnWidths.slice(0, frozenColumnCount)]
    : frozenColumnWidths.slice(0, frozenColumnCount);
  const frozenCols = tableColumns.slice(0, effectiveFrozenCount);
  const scrollCols = tableColumns.slice(effectiveFrozenCount);
  const widths = effectiveFrozenWidths.slice(0, effectiveFrozenCount);
  const frozenBlockWidth = widths.reduce((sum, w) => sum + w, 0);
  const showFilters = hasColumnFilters(tableColumns);

  if (rows.length === 0) {
    return (
      <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 py-6 text-center text-xs text-gray-500">
        No records
      </div>
    );
  }

  const scrollContainerClass = stickyHeader
    ? "erp-freeze-pane-scroll erp-freeze-pane-sticky-header w-full min-w-0 max-w-full overflow-auto rounded-lg border border-gray-200"
    : "erp-freeze-pane-scroll w-full min-w-0 max-w-full overflow-x-auto rounded-lg border border-gray-200";

  return (
    <div
      className={scrollContainerClass}
      style={stickyHeader ? { maxHeight: scrollMaxHeight } : undefined}
    >
      <div className="w-max min-w-full">
        <div
          className={`flex border-b border-divider bg-gray-50 text-xs text-gray-600 ${
            stickyHeader ? "sticky top-0 z-20" : ""
          }`}
        >
          <div
            className={`erp-freeze-pane-frozen flex shrink-0 sticky left-0 bg-gray-50 erp-freeze-pane-edge ${
              stickyHeader ? "z-40" : "z-30"
            }`}
            style={{ width: frozenBlockWidth, minWidth: frozenBlockWidth }}
          >
            {frozenCols.map((c, i) => (
              <div
                key={c.key}
                title={c.headerTitle || c.label}
                className="box-border px-2 py-2 font-semibold text-left whitespace-nowrap overflow-hidden text-ellipsis shrink-0"
                style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i] }}
              >
                {renderDenseHeader(c)}
              </div>
            ))}
          </div>
          <div className="flex shrink-0">
            {scrollCols.map((c) => (
              <div
                key={c.key}
                title={c.headerTitle || undefined}
                className={`box-border px-2 py-2 font-semibold text-left whitespace-nowrap shrink-0 ${c.headerClassName || ""}`}
              >
                {renderDenseHeader(c)}
              </div>
            ))}
          </div>
        </div>
        {showFilters ? (
          <div className="flex border-b border-gray-200 bg-gray-50/95 text-xs">
            <div
              className={`erp-freeze-pane-frozen flex shrink-0 sticky left-0 bg-gray-50/95 erp-freeze-pane-edge ${
                stickyHeader ? "z-40" : "z-30"
              }`}
              style={{ width: frozenBlockWidth, minWidth: frozenBlockWidth }}
            >
              {frozenCols.map((c, i) => (
                <div
                  key={`filter-${c.key}`}
                  className="box-border px-1 py-1 shrink-0"
                  style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i] }}
                >
                  {renderDenseFilter(c)}
                </div>
              ))}
            </div>
            <div className="flex shrink-0">
              {scrollCols.map((c) => (
                <div key={`filter-${c.key}`} className={`box-border px-1 py-1 shrink-0 ${c.headerClassName || ""}`}>
                  {renderDenseFilter(c)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {rows.map((row, rowIndex) => {
          const isActive = activeRowId != null && row[rowKey] === activeRowId;
          return (
          <div
            key={row[rowKey]}
            className={`flex border-b border-gray-100 text-xs group ${onRowClick ? "cursor-pointer" : ""} ${
              isActive ? "bg-blue-50/80" : ""
            }`}
            onClick={() => onRowClick?.(row)}
          >
            <div
              className={`erp-freeze-pane-frozen flex shrink-0 sticky left-0 z-20 erp-freeze-pane-edge ${
                isActive ? "bg-blue-50/80" : "bg-white group-hover:bg-blue-50"
              }`}
              style={{ width: frozenBlockWidth, minWidth: frozenBlockWidth }}
            >
              {frozenCols.map((c, i) => (
                <div
                  key={c.key}
                  className={`box-border px-2 py-1.5 text-gray-800 align-top shrink-0 overflow-hidden ${c.cellClassName || ""}`}
                  style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i] }}
                >
                  {renderDenseCell(c, row, rowIndex)}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 group-hover:bg-blue-50/40">
              {scrollCols.map((c) => (
                <div
                  key={c.key}
                  className={`box-border px-2 py-1.5 text-gray-800 align-top shrink-0 ${c.cellClassName || ""}`}
                >
                  {renderDenseCell(c, row, rowIndex)}
                </div>
              ))}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

export const DenseTable = ({
  columns,
  rows,
  onRowClick,
  rowKey = "id",
  frozenColumnCount = 0,
  frozenColumnWidths = DEFAULT_FROZEN_COLUMN_WIDTHS,
  showSerialNumber = "auto",
  serialLabel = "S.No",
  serialOffset = 0,
  stickyHeader = false,
  scrollMaxHeight = "calc(100dvh - 22rem)",
  activeRowId = null,
}) => {
  const tableColumns = useMemo(
    () => resolveDenseTableColumns(columns, { showSerialNumber, serialLabel, serialOffset }),
    [columns, showSerialNumber, serialLabel, serialOffset]
  );

  if (frozenColumnCount > 0) {
    return (
      <FreezePaneDenseTable
        columns={columns}
        rows={rows}
        onRowClick={onRowClick}
        rowKey={rowKey}
        frozenColumnCount={frozenColumnCount}
        frozenColumnWidths={frozenColumnWidths}
        showSerialNumber={showSerialNumber}
        serialLabel={serialLabel}
        serialOffset={serialOffset}
        stickyHeader={stickyHeader}
        scrollMaxHeight={scrollMaxHeight}
        activeRowId={activeRowId}
      />
    );
  }

  const showFilters = hasColumnFilters(tableColumns);

  return (
    <div
      className={`w-full max-w-full min-w-0 rounded-lg border border-gray-200 ${
        stickyHeader ? "overflow-auto" : "overflow-x-auto"
      }`}
      style={stickyHeader ? { maxHeight: scrollMaxHeight } : undefined}
    >
      <table
        className={`w-max min-w-full text-xs ${
          stickyHeader ? "border-collapse" : "border-separate border-spacing-0"
        }`}
      >
        <thead
          className={`bg-gray-50 text-gray-600 border-b border-divider ${
            stickyHeader ? "sticky top-0 z-20" : ""
          }`}
        >
          <tr>
            {tableColumns.map((c) => (
              <th
                key={c.key}
                title={c.headerTitle || undefined}
                className={`text-left font-semibold px-2 py-2 whitespace-nowrap bg-gray-50 ${c.headerClassName || ""}`}
              >
                {renderDenseHeader(c)}
              </th>
            ))}
          </tr>
          {showFilters ? (
            <tr className="border-b border-gray-200 bg-gray-50/95">
              {tableColumns.map((c) => (
                <th key={`filter-${c.key}`} className="px-1 py-1 font-normal bg-gray-50/95">
                  {renderDenseFilter(c)}
                </th>
              ))}
            </tr>
          ) : null}
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={tableColumns.length} className="px-3 py-6 text-center text-gray-500">
                No records
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const isActive = activeRowId != null && row[rowKey] === activeRowId;
              return (
              <tr
                key={row[rowKey]}
                className={`group ${onRowClick ? "cursor-pointer" : ""} ${isActive ? "bg-blue-50/80" : ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {tableColumns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 align-middle text-gray-800 whitespace-nowrap ${
                      isActive ? "bg-blue-50/80" : "bg-white group-hover:bg-blue-50/40"
                    } ${c.cellClassName || ""}`}
                  >
                    {renderDenseCell(c, row, rowIndex)}
                  </td>
                ))}
              </tr>
            );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export function Drawer({ open, title, onClose, children, widthClass = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close drawer" onClick={onClose} />
      <div
        className={`relative ml-auto h-full w-full ${widthClass} bg-white shadow-2xl border-l border-gray-200 flex flex-col`}
      >
        <div className="erp-card-header border-b border-gray-200 flex items-center justify-between">
          <h4 className="type-card-title text-gray-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 text-lg leading-none px-1">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto erp-card-body text-sm">{children}</div>
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
        <div className="erp-card-header border-b border-gray-200 flex items-center justify-between">
          <h4 className="type-card-title text-gray-900">{title}</h4>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            ×
          </button>
        </div>
        <div className="erp-card-body overflow-y-auto text-sm">{children}</div>
        {footer && <div className="erp-card-header border-t border-gray-200 bg-gray-50 rounded-b-xl">{footer}</div>}
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
        <span className="absolute -left-[7px] top-1.5 w-2 h-2 rounded-full bg-accent" />
        <p className="text-xs font-medium text-gray-900">{it.title}</p>
        <p className="text-[11px] text-gray-500">{it.meta}</p>
      </li>
    ))}
  </ul>
);
