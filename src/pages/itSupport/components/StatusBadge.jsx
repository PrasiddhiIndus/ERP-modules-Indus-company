import React from "react";
import { STATUS_MAP, statusLabel } from "../itSupportConstants";

export default function StatusBadge({ status, className = "" }) {
  const meta = STATUS_MAP[status];
  const tone = meta?.tone || "bg-surface-sunken text-ink-secondary border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${tone} ${className}`.trim()}
    >
      {statusLabel(status)}
    </span>
  );
}
