import React from "react";
import { RefreshCw, Download, Plus } from "lucide-react";
import {
  SectionCard,
  KpiTile,
  Badge,
  Modal,
  TinyInput,
  TinySelect,
  StatusChip,
} from "../../adminOperations/components/AdminUi";

export { SectionCard, KpiTile, Badge, Modal, TinyInput, TinySelect, StatusChip };
export { PeriodMonthSelect } from "./PeriodMonthSelect";
export { FinanceDateInput } from "./FinanceDateInput";

export function PageHeader({ title, subtitle, onRefresh, onExport, primaryAction, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
        {primaryAction}
      </div>
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-[#1F6F4E] text-white hover:bg-[#1A5E42] disabled:opacity-50 ${className}`}
    >
      <Plus className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="fin-empty">
      {Icon && <Icon size={34} />}
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function LoadingState({ message = "Loading finance data…" }) {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-gray-500">
      {message}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function StatusPill({ margin, profit, warnMargin = 8, targetMargin = 12 }) {
  let label = "On target";
  let cls = "pill-ok";
  if (profit < 0) {
    label = "Loss";
    cls = "pill-loss";
  } else if (margin < warnMargin) {
    label = "Thin";
    cls = "pill-warn";
  } else if (margin < targetMargin) {
    label = "Watch";
    cls = "pill-watch";
  }
  return (
    <span className={`pill ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
      {label}
    </span>
  );
}
