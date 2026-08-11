import React from "react";
import { StatusChip } from "../../../adminOperations/components/AdminUi";
import { formatINR } from "./deductionsStore";

export const inputClass =
  "w-full h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent";
export const labelClass = "block text-xs font-medium text-gray-600 mb-1";

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-gray-500">{hint}</p> : null}
    </label>
  );
}

export function MoneyText({ value, strong = false }) {
  return (
    <span className={`tabular-nums ${strong ? "font-semibold text-gray-900" : "text-gray-800"}`}>
      {formatINR(value)}
    </span>
  );
}

export function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  if (s === "active" || s === "open") return <StatusChip label={status} severity="info" />;
  if (s === "hold" || s === "paused") return <StatusChip label={status} severity="warning" />;
  if (s === "closed" || s === "settled" || s === "stopped") {
    return <StatusChip label={status} severity="critical" />;
  }
  return <StatusChip label={status || "—"} severity="info" />;
}

export function MonthInput({ value, onChange, disabled = false, required = false }) {
  return (
    <input
      type="month"
      value={value || ""}
      onChange={onChange}
      disabled={disabled}
      required={required}
      className={inputClass}
    />
  );
}

export function ShellBanner({ children }) {
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-sm font-medium text-gray-800">{title}</p>
      {body ? <p className="mt-1 text-xs text-gray-500 max-w-md mx-auto">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PrimaryButton({ children, onClick, type = "button", disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, type = "button", disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function DangerButton({ children, onClick, type = "button", disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-9 px-3 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
