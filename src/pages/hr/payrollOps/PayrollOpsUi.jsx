import React, { useState } from "react";
import { Bell, Calendar } from "lucide-react";
import { StatusChip } from "../../adminOperations/components/AdminUi";
import { MONTHS, statusLabel, statusSeverity } from "./payrollOpsData";
import { payrollOpsAppPath } from "./payrollOpsNav";
import { useNavigate } from "react-router-dom";
import { usePayrollOps } from "./payrollOpsScope";

export function PayrollStatusChip({ status }) {
  return <StatusChip label={statusLabel(status)} severity={statusSeverity(status)} />;
}

export function CycleSelector({ showPayDate = false, payDate, setPayDate }) {
  const { month, setMonth, year, setYear } = usePayrollOps();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs">
        <Calendar className="h-3.5 w-3.5 text-ink-muted" />
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-transparent text-xs font-semibold text-ink outline-none"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="bg-transparent text-xs font-semibold text-ink outline-none"
        >
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      {showPayDate ? (
        <label className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs">
          <span className="text-ink-muted font-medium">Disbursal</span>
          <input
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className="bg-transparent text-xs font-semibold text-ink outline-none"
          />
        </label>
      ) : null}
    </div>
  );
}

export function NotificationBell() {
  const { notifications, openProcess } = usePayrollOps();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dangerCount = notifications.filter((n) => n.severity === "critical").length;

  const jump = (n) => {
    setOpen(false);
    if (n.type === "disbursement" || n.type === "transfer") {
      openProcess(n.siteId, [n.siteId]);
      return;
    }
    navigate(payrollOpsAppPath("compliance"));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-sunken"
        aria-label="Payroll alerts"
      >
        <Bell className={`h-4 w-4 text-ink ${dangerCount ? "animate-pulse" : ""}`} />
        {notifications.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">
            {notifications.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close alerts" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[22rem] max-h-96 overflow-auto rounded-lg border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-divider px-3 py-2">
              <p className="text-xs font-semibold text-ink">Alerts</p>
              <p className="text-[11px] text-ink-muted">{notifications.length} active</p>
            </div>
            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-ink-muted">You are all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => jump(n)}
                  className="block w-full border-b border-divider px-3 py-2.5 text-left last:border-0 hover:bg-surface-sunken"
                >
                  <p className="text-[12px] leading-snug text-ink">{n.message}</p>
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
