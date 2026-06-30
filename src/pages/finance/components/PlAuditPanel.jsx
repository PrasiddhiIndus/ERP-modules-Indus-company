import React from "react";
import { Clock, User } from "lucide-react";
import { formatAuditTimestamp } from "../lib/plAudit";

export function PlAuditPanel({ audit, className = "" }) {
  if (!audit?.updatedAt) {
    return (
      <div className={`pl-audit-panel pl-audit-empty ${className}`}>
        <Clock size={14} />
        <span>Not saved yet for this period</span>
      </div>
    );
  }
  const { date, time } = formatAuditTimestamp(audit.updatedAt);
  return (
    <div className={`pl-audit-panel ${className}`}>
      <div className="pl-audit-title">Last updated</div>
      <div className="pl-audit-rows">
        <div className="pl-audit-row">
          <User size={13} />
          <span>{audit.updatedBy || "Unknown user"}</span>
        </div>
        <div className="pl-audit-row">
          <Clock size={13} />
          <span>
            {date} · {time}
          </span>
        </div>
      </div>
    </div>
  );
}
