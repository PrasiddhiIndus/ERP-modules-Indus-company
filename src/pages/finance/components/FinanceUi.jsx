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
  PageTaskHeader,
  PrimaryButton as ErpPrimaryButton,
  EmptyState as ErpEmptyState,
  InlineAlert,
} from "../../../components/erpUi";

export {
  SectionCard,
  KpiTile,
  Badge,
  Modal,
  TinyInput,
  TinySelect,
  StatusChip,
  PageTaskHeader,
  InlineAlert,
};
export { PeriodMonthSelect } from "./PeriodMonthSelect";
export { FinanceDateInput } from "./FinanceDateInput";

/** Finance page chrome — prefers erpUi PageTaskHeader; keeps refresh/export affordances. */
export function PageHeader({ title, subtitle, onRefresh, onExport, primaryAction, children }) {
  return (
    <PageTaskHeader title={title} subtitle={subtitle}>
      {children}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="erp-btn-secondary inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-control"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      )}
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          className="erp-btn-secondary inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-control"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      )}
      {primaryAction}
    </PageTaskHeader>
  );
}

export function PrimaryButton({ children, onClick, disabled, className = "" }) {
  return (
    <ErpPrimaryButton onClick={onClick} disabled={disabled} className={className} icon={Plus}>
      {children}
    </ErpPrimaryButton>
  );
}

export function EmptyState({ icon, title, message, action }) {
  return <ErpEmptyState icon={icon} title={title} message={message} action={action} />;
}

export function LoadingState({ message = "Loading finance data…" }) {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-ink-muted">{message}</div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <InlineAlert tone="error">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline">
          Retry
        </button>
      ) : null}
    </InlineAlert>
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
