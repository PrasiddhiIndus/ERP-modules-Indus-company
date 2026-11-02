import React, { useMemo } from "react";
/**
 * Canonical ERP UI primitives. Import via `components/erpUi` only.
 * Theme: use design tokens (`bg-surface`, `border-border`, `text-ink-*`) — never hard-coded hex.
 */
import {
  columnsHaveSerialNumber,
  prependSerialColumn,
  resolveSerialCellValue,
} from "../../utils/listTable";
import FormDateInput from "../FormDateInput";

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
        <div className="mt-2 text-[11px] text-ink-muted rounded-lg border border-border bg-surface-sunken/80 px-3 py-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export const SectionCard = ({ title, right, children, className = "" }) => (
  <div
    className={`erp-elevate bg-surface rounded-card shadow-card border border-border/80 overflow-visible transition-[box-shadow,transform,border-color] duration-theme ease-theme hover:shadow-card-hover hover:border-accent-border/60 ${className}`.trim()}
  >
    <div className="erp-card-header border-b border-divider flex items-center justify-between gap-3 min-h-[52px] bg-gradient-to-b from-surface to-surface-sunken/40 rounded-t-card overflow-hidden">
      <h3 className="type-card-title text-ink-strong type-truncate">{title}</h3>
      {right}
    </div>
    <div className="erp-card-body overflow-visible relative z-[1]">{children}</div>
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
        className={`h-9 ${className}`.trim()}
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
      className={`h-9 border border-border rounded-control px-2.5 text-xs bg-surface text-ink shadow-sm transition-[border-color,box-shadow] duration-theme focus:border-accent focus:shadow-focus ${className}`.trim()}
    />
  );
};

export const TinySelect = ({ children, className = "", ...rest }) => (
  <select
    {...rest}
    className={`relative z-[2] h-9 border border-border rounded-control px-2.5 text-xs bg-surface text-ink shadow-sm transition-[border-color,box-shadow] duration-theme focus:border-accent focus:shadow-focus focus:z-50 ${className}`.trim()}
  >
    {children}
  </select>
);

const severityTone = {
  info: "bg-info-soft text-info border-info-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  high: "bg-warning-soft text-warning border-warning-border",
  critical: "bg-critical-soft text-critical border-critical-border",
  neutral: "bg-neutral-state-soft text-neutral-state border-neutral-state-border",
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

export const KpiTile = ({ label, value, sub, onClick, tone = "border-border/80" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`erp-kpi-tile text-left w-full rounded-card border ${tone} bg-gradient-to-br from-surface via-surface to-accent-soft/30 shadow-card pl-5 pr-4 py-3.5 transition-[border-color,box-shadow,transform] duration-theme ease-theme ${
      onClick ? "cursor-pointer hover:border-accent-border hover:shadow-card-hover hover:-translate-y-0.5" : ""
    }`}
  >
    <p className="type-mono-caption text-ink-muted">{label}</p>
    <p className="type-figure text-ink-strong mt-1.5 tracking-tight">{value}</p>
    {sub && <p className="type-meta text-ink-secondary mt-1.5">{sub}</p>}
  </button>
);

export const FilterBar = ({ children }) => (
  <div className="erp-filter-bar relative z-30 flex flex-wrap items-end gap-3 px-3.5 py-3 rounded-card border border-border/80 bg-surface-sunken/70 shadow-sm backdrop-blur-[2px] overflow-visible">
    {children}
  </div>
);

const DEFAULT_FROZEN_COLUMN_WIDTHS = [88, 104, 180, 132];
const SERIAL_COLUMN_WIDTH = 44;

function renderDenseCell(col, row, rowIndex) {
  if (col.key === "__sn") return resolveSerialCellValue(col, rowIndex);
  if (col.render) return col.render(row);
  const value = row[col.key];
  return value == null || value === "" ? "" : value;
}

function denseHeaderClassName(col) {
  return [col.headerClassName, col.widthClassName].filter(Boolean).join(" ");
}

function denseCellClassName(col) {
  return [col.cellClassName, col.widthClassName].filter(Boolean).join(" ");
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
  density = "compact",
}) {
  const comfortable = density === "comfortable";
  const cellPad = comfortable ? "px-3 py-2.5" : "px-2 py-1.5";
  const headPad = comfortable ? "px-3 py-2.5" : "px-2 py-2";
  const textSize = comfortable ? "text-[12px] leading-snug" : "text-xs";
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
      <div className="w-full min-w-0 max-w-full rounded-lg border border-border px-3 py-6 text-center text-xs text-ink-muted">
        No records
      </div>
    );
  }

  const scrollContainerClass = stickyHeader
    ? "erp-freeze-pane-scroll erp-freeze-pane-sticky-header w-full min-w-0 max-w-full overflow-auto rounded-lg border border-border"
    : "erp-freeze-pane-scroll w-full min-w-0 max-w-full overflow-x-auto rounded-lg border border-border";

  return (
    <div
      className={scrollContainerClass}
      style={stickyHeader ? { maxHeight: scrollMaxHeight } : undefined}
    >
      <div className="w-max min-w-full">
        <div
          className={`flex border-b border-divider bg-surface-sunken ${textSize} text-ink-secondary ${
            stickyHeader ? "sticky top-0 z-20" : ""
          }`}
        >
          <div
            className={`erp-freeze-pane-frozen flex shrink-0 sticky left-0 bg-surface-sunken erp-freeze-pane-edge ${
              stickyHeader ? "z-40" : "z-30"
            }`}
            style={{ width: frozenBlockWidth, minWidth: frozenBlockWidth }}
          >
            {frozenCols.map((c, i) => (
              <div
                key={c.key}
                title={c.headerTitle || c.label}
                className={`box-border ${headPad} font-semibold text-left whitespace-nowrap overflow-hidden text-ellipsis shrink-0`}
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
                className={`box-border ${headPad} font-semibold text-left whitespace-nowrap shrink-0 overflow-hidden text-ellipsis ${denseHeaderClassName(c)}`}
              >
                {renderDenseHeader(c)}
              </div>
            ))}
          </div>
        </div>
        {showFilters ? (
          <div className="flex border-b border-border bg-surface-sunken/95 text-xs">
            <div
              className={`erp-freeze-pane-frozen flex shrink-0 sticky left-0 bg-surface-sunken/95 erp-freeze-pane-edge ${
                stickyHeader ? "z-40" : "z-30"
              }`}
              style={{ width: frozenBlockWidth, minWidth: frozenBlockWidth }}
            >
              {frozenCols.map((c, i) => (
                <div
                  key={`filter-${c.key}`}
                  className="box-border px-1 py-1 shrink-0 overflow-hidden"
                  style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i] }}
                >
                  {renderDenseFilter(c)}
                </div>
              ))}
            </div>
            <div className="flex shrink-0">
              {scrollCols.map((c) => (
                <div
                  key={`filter-${c.key}`}
                  className={`box-border px-1 py-1 shrink-0 overflow-hidden ${denseHeaderClassName(c)}`}
                >
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
            className={`flex border-b border-divider ${textSize} group ${onRowClick ? "cursor-pointer" : ""} ${
              isActive ? "bg-accent-soft/80" : ""
            }`}
            onClick={() => onRowClick?.(row)}
          >
            <div
              className={`erp-freeze-pane-frozen flex shrink-0 sticky left-0 z-20 erp-freeze-pane-edge ${
                isActive ? "bg-accent-soft/80" : "bg-surface group-hover:bg-row-hover"
              }`}
              style={{ width: frozenBlockWidth, minWidth: frozenBlockWidth }}
            >
              {frozenCols.map((c, i) => (
                <div
                  key={c.key}
                  className={`box-border ${cellPad} text-ink align-middle shrink-0 overflow-hidden ${denseCellClassName(c)}`}
                  style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i] }}
                >
                  {renderDenseCell(c, row, rowIndex)}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 group-hover:bg-accent-soft/40">
              {scrollCols.map((c) => (
                <div
                  key={c.key}
                  className={`box-border ${cellPad} text-ink align-middle shrink-0 overflow-hidden whitespace-nowrap text-ellipsis ${denseCellClassName(c)}`}
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
  density = "compact",
}) => {
  const tableColumns = useMemo(
    () => resolveDenseTableColumns(columns, { showSerialNumber, serialLabel, serialOffset }),
    [columns, showSerialNumber, serialLabel, serialOffset]
  );
  const comfortable = density === "comfortable";
  const cellPad = comfortable ? "px-3 py-2.5" : "px-2 py-1.5";
  const headPad = comfortable ? "px-3 py-2.5" : "px-2 py-2";
  const textSize = comfortable ? "text-[12px] leading-snug" : "text-xs";

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
        density={density}
      />
    );
  }

  const showFilters = hasColumnFilters(tableColumns);

  return (
    <div
      className={`w-full max-w-full min-w-0 rounded-lg border border-border ${
        stickyHeader ? "overflow-auto" : "overflow-x-auto"
      }`}
      style={stickyHeader ? { maxHeight: scrollMaxHeight } : undefined}
    >
      <table
        className={`w-max min-w-full ${textSize} ${
          stickyHeader ? "border-collapse" : "border-separate border-spacing-0"
        }`}
      >
        <thead
          className={`bg-surface-sunken text-ink-secondary border-b border-divider ${
            stickyHeader ? "sticky top-0 z-20" : ""
          }`}
        >
          <tr>
            {tableColumns.map((c) => (
              <th
                key={c.key}
                title={c.headerTitle || undefined}
                className={`text-left font-semibold ${headPad} whitespace-nowrap bg-surface-sunken ${denseHeaderClassName(c)}`}
              >
                {renderDenseHeader(c)}
              </th>
            ))}
          </tr>
          {showFilters ? (
            <tr className="border-b border-border bg-surface-sunken/95">
              {tableColumns.map((c) => (
                <th key={`filter-${c.key}`} className="px-1.5 py-1.5 font-normal bg-surface-sunken/95">
                  {renderDenseFilter(c)}
                </th>
              ))}
            </tr>
          ) : null}
        </thead>
        <tbody className="divide-y divide-divider bg-surface">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={tableColumns.length} className="px-3 py-8 text-center text-ink-muted">
                No records
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const isActive = activeRowId != null && row[rowKey] === activeRowId;
              return (
              <tr
                key={row[rowKey]}
                className={`group transition-colors duration-theme ${onRowClick ? "cursor-pointer" : ""} ${isActive ? "bg-accent-soft/80" : ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {tableColumns.map((c) => (
                  <td
                    key={c.key}
                    className={`${cellPad} align-middle text-ink whitespace-nowrap overflow-hidden text-ellipsis ${
                      isActive ? "bg-accent-soft/80" : "bg-surface group-hover:bg-row-hover"
                    } ${denseCellClassName(c)}`}
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
    <div className="fixed inset-0 z-[100] flex erp-overlay-enter">
      <button type="button" className="absolute inset-0 bg-scrim" aria-label="Close drawer" onClick={onClose} />
      <div
        className={`relative ml-auto h-full w-full ${widthClass} bg-surface shadow-modal border-l border-border flex flex-col erp-drawer-enter`}
      >
        <div className="erp-card-header border-b border-border flex items-center justify-between">
          <h4 className="type-card-title text-ink-strong">{title}</h4>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink text-lg leading-none px-1">
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 erp-overlay-enter">
      <button type="button" className="absolute inset-0 bg-scrim" aria-label="Close" onClick={onClose} />
      <div className={`relative bg-surface rounded-card shadow-modal border border-border w-full ${widthClass} max-h-[90vh] flex flex-col erp-modal-enter`}>
        <div className="erp-card-header border-b border-border flex items-center justify-between">
          <h4 className="type-card-title text-ink-strong">{title}</h4>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            ×
          </button>
        </div>
        <div className="erp-card-body overflow-y-auto text-sm">{children}</div>
        {footer && <div className="erp-card-header border-t border-border bg-surface-sunken rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export const LinkedChip = ({ label, toHint }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-info-border bg-info-soft text-[11px] text-info">
    {label}
    {toHint && <span className="text-info">→ {toHint}</span>}
  </span>
);

export const Timeline = ({ items }) => (
  <ul className="space-y-2 border-l-2 border-border ml-1 pl-3">
    {items.map((it, i) => (
      <li key={i} className="relative">
        <span className="absolute -left-[7px] top-1.5 w-2 h-2 rounded-full bg-accent" />
        <p className="text-xs font-medium text-ink-strong">{it.title}</p>
        <p className="text-[11px] text-ink-muted">{it.meta}</p>
      </li>
    ))}
  </ul>
);

/**
 * Persistent page/form notice (validation or load failure).
 * For transient save/delete feedback, use the central toaster (`src/lib/toast.js`).
 */
export function InlineAlert({ tone = "error", children, className = "", onDismiss }) {
  if (!children) return null;
  const tones = {
    error: "border-critical-border bg-critical-soft text-critical",
    success: "border-success-border bg-success-soft text-success",
    warning: "border-warning-border bg-warning-soft text-warning",
    info: "border-border bg-surface-sunken text-ink",
  };
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-xs ${tones[tone] || tones.info} ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 whitespace-pre-wrap">{children}</div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
