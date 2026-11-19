import React from "react";
import { PRIORITY_BADGE_CLASS, priorityLabel } from "../itSupportConstants";

export default function PriorityBadge({ priority, className = "" }) {
  if (!priority) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium bg-surface-sunken text-ink-muted border-border ${className}`.trim()}
      >
        Unset
      </span>
    );
  }
  const tone = PRIORITY_BADGE_CLASS[priority] || PRIORITY_BADGE_CLASS.low;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${tone} ${className}`.trim()}
    >
      {priorityLabel(priority)}
    </span>
  );
}
