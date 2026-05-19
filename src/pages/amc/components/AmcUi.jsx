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
} from "../../adminOperations/components/AdminUi";
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
};

export function AmcStatusBadge({ status }) {
  const tone = STATUS_TONE[status] || "info";
  return <StatusChip label={formatStatusLabel(status)} severity={tone} />;
}

export function PageHeader({ title, subtitle, onRefresh, onExport, primaryAction }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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

export function PrimaryButton({ children, onClick, icon: Icon = Plus }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-[#1F3A8A] rounded-lg hover:bg-[#172554]"
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

export function ProfileTabs({ tabs, active, onChange, children }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 -mb-px ${
              active === t.id
                ? "border-[#1F3A8A] text-[#1F3A8A] bg-blue-50/50"
                : "border-transparent text-gray-600 hover:text-gray-900"
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
      ? "border-red-300 bg-red-50"
      : alert.severity === "high"
        ? "border-orange-200 bg-orange-50"
        : "border-amber-200 bg-amber-50";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${sevTone}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{alert.title}</p>
          <p className="text-gray-600 mt-0.5">
            {alert.customer_name} · {alert.site_name || "—"} · {alert.related_record}
          </p>
        </div>
        <AmcStatusBadge status={alert.severity} />
      </div>
      {onAction && (
        <button type="button" onClick={() => onAction(alert)} className="mt-2 text-[11px] font-medium text-[#1F3A8A]">
          View source →
        </button>
      )}
    </div>
  );
}

export function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}
