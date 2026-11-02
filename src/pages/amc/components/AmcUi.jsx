import React from "react";
import { RefreshCw, Download, Plus } from "lucide-react";
import {
  SectionCard,
  KpiTile,
  Badge,
  FilterBar,
  DenseTable,
  Drawer,
  Modal,
  Timeline,
  TinyInput,
  TinySelect,
  StatusChip,
  PageTaskHeader,
  PrimaryButton as ErpPrimaryButton,
} from "../../../components/erpUi";
import { formatStatusLabel, STATUS_TONE } from "../constants/workflows";

export {
  SectionCard,
  KpiTile,
  Badge,
  FilterBar,
  DenseTable,
  Drawer,
  Modal,
  Timeline,
  TinyInput,
  TinySelect,
  PageTaskHeader,
};

export function AmcStatusBadge({ status }) {
  const tone = STATUS_TONE[status] || "info";
  return <StatusChip label={formatStatusLabel(status)} severity={tone} />;
}

export function PageHeader({ title, subtitle, onRefresh, onExport, primaryAction }) {
  return (
    <PageTaskHeader title={title} subtitle={subtitle}>
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

export function PrimaryButton({ children, onClick, icon: Icon = Plus }) {
  return (
    <ErpPrimaryButton onClick={onClick} icon={Icon}>
      {children}
    </ErpPrimaryButton>
  );
}

export function ProfileTabs({ tabs, active, onChange, children }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-border mb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 -mb-px ${
              active === t.id
                ? "border-accent text-accent bg-accent-soft/50"
                : "border-transparent text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function AlertCard({ alert, onAction }) {
  const sevTone =
    alert.severity === "critical"
      ? "border-critical-border bg-critical-soft"
      : alert.severity === "high"
        ? "border-warning-border bg-warning-soft"
        : "border-warning-border bg-warning-soft";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${sevTone}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-strong">{alert.title}</p>
          <p className="text-ink-secondary mt-0.5">
            {alert.customer_name} · {alert.site_name || "—"} · {alert.related_record}
          </p>
        </div>
        <AmcStatusBadge status={alert.severity} />
      </div>
      {onAction && (
        <button type="button" onClick={() => onAction(alert)} className="mt-2 text-[11px] font-medium text-accent">
          View source →
        </button>
      )}
    </div>
  );
}

export function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-ink-muted uppercase">{label}</p>
      <p className="text-sm text-ink-strong mt-0.5">{value ?? "—"}</p>
    </div>
  );
}
