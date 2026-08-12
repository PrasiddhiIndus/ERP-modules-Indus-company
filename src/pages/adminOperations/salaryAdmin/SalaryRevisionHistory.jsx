import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatINR, formatSalaryDate, getSalaryRevisions } from "./salaryData";

/** Lines shown when a history version is expanded. */
const AMOUNT_GROUPS = [
  {
    title: "Part A — earnings",
    rows: [
      { key: "gross_monthly", label: "Gross" },
      { key: "basic_monthly", label: "Basic" },
      { key: "hra_monthly", label: "HRA" },
      { key: "special_allowance_monthly", label: "Special allowance" },
    ],
  },
  {
    title: "Employee deductions",
    rows: [
      { key: "emp_pf_monthly", label: "PF (employee)" },
      { key: "pt_monthly", label: "Professional tax" },
      { key: "emp_esic_monthly", label: "ESIC (employee)" },
      { key: "take_home_monthly", label: "Take home", emphasize: true },
    ],
  },
  {
    title: "Part B — employer",
    rows: [
      { key: "er_pf_monthly", label: "PF (employer)" },
      { key: "er_esic_monthly", label: "ESIC (employer)" },
      { key: "gratuity_monthly", label: "Gratuity" },
      { key: "leave_encash_monthly", label: "Leave encashment" },
      { key: "mediclaim_monthly", label: "Mediclaim" },
      { key: "lic_monthly", label: "LIC" },
      { key: "special_perf_bonus_monthly", label: "Special / perf. bonus" },
      { key: "bonus_monthly", label: "Bonus" },
      { key: "total_b_monthly", label: "Total Part B", emphasize: true },
    ],
  },
  {
    title: "CTC totals",
    rows: [
      { key: "ctc_monthly", label: "CTC monthly", emphasize: true },
      { key: "ctc_annual", label: "CTC annual", emphasize: true },
    ],
  },
];

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deltaClass(d) {
  if (d == null || d === 0) return "text-slate-400";
  return d > 0 ? "text-emerald-700" : "text-amber-700";
}

function formatDelta(d) {
  if (d == null) return "—";
  if (d === 0) return "No change";
  const sign = d > 0 ? "+" : "";
  return `${sign}${formatINR(d)}`;
}

/**
 * Newest-first timeline: current CTC + archived priors.
 * Oldest archive (or sole current) is labeled Initial CTC.
 */
function buildTimeline(current, revisions) {
  const archives = Array.isArray(revisions) ? revisions : [];
  const entries = [];

  if (current?.declared) {
    const versionNo = archives.length + 1;
    entries.push({
      id: "current",
      isCurrent: true,
      isInitial: archives.length === 0,
      versionNo,
      title: archives.length === 0 ? "Initial CTC" : `Version ${versionNo} · Current`,
      eventDate: current.updated_at || current.wef_date || current.created_at || null,
      createdDate: current.created_at || null,
      wef: current.wef_date || null,
      reason: current.revision_reason?.trim() || "",
      snapshot: current,
    });
  }

  archives.forEach((rev, i) => {
    const isOldest = i === archives.length - 1;
    const versionNo = Math.max(1, archives.length - i);
    entries.push({
      id: rev.id || `rev-${rev.revision_no}-${i}`,
      isCurrent: false,
      isInitial: isOldest,
      versionNo,
      title: isOldest ? "Initial CTC" : `Version ${versionNo}`,
      eventDate: rev.revised_at || rev.wef_date || rev.updated_at || null,
      createdDate: null,
      wef: rev.wef_date || rev.superseded_wef || null,
      reason: rev.revision_reason?.trim() || "",
      snapshot: rev,
    });
  });

  return entries;
}

/**
 * Shared CTC revision history panel (Salary Master drawer + CTC page drawer).
 * Compact list by default; click a version to see full amounts and increments.
 */
export default function SalaryRevisionHistory({ employee, salary, currentPreview = null }) {
  const [revisions, setRevisions] = useState(() =>
    Array.isArray(salary?.revisions) ? salary.revisions : []
  );
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (Array.isArray(salary?.revisions) && salary.revisions.length > 0) {
      setRevisions(salary.revisions);
      return undefined;
    }
    if (!employee?.id) {
      setRevisions([]);
      return undefined;
    }
    getSalaryRevisions(employee.id)
      .then((rows) => {
        if (!cancelled) setRevisions(rows || []);
      })
      .catch((err) => {
        console.error("Salary revision history load failed", err);
        if (!cancelled) setRevisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [employee?.id, salary?.id, salary?.revision_count, salary?.revisions]);

  useEffect(() => {
    setExpandedId(null);
  }, [employee?.id, salary?.updated_at, salary?.revision_count]);

  const current = salary?.declared
    ? salary
    : currentPreview?.declared
      ? currentPreview
      : null;

  const timeline = useMemo(() => buildTimeline(current, revisions), [current, revisions]);

  if (!employee) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3">
        <p className="text-sm font-semibold text-gray-900">{employee.full_name || "Employee"}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {[employee.employee_code || employee.employee_id, employee.designation, employee.department]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
        {timeline.length ? (
          <p className="mt-2 text-[11px] text-gray-600">
            {timeline.length} version{timeline.length === 1 ? "" : "s"} · click a row for full amounts
          </p>
        ) : null}
      </div>

      {!current ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
          No CTC set yet. Open the employee to enter the first compensation structure.
        </p>
      ) : null}

      {timeline.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
          No CTC history yet.
        </p>
      ) : (
        <ul className="space-y-0 border-l-2 border-gray-200 ml-1.5">
          {timeline.map((entry, i) => {
            const older = timeline[i + 1]?.snapshot || null;
            const ctcNow = num(entry.snapshot?.ctc_annual);
            const ctcPrev = num(older?.ctc_annual);
            const ctcDelta =
              ctcNow != null && ctcPrev != null ? ctcNow - ctcPrev : null;
            const open = expandedId === entry.id;

            return (
              <li key={entry.id} className="relative pl-5 pb-3 last:pb-0">
                <span
                  className={`absolute left-[-5px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                    entry.isCurrent ? "bg-emerald-500" : "bg-gray-400"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : entry.id)}
                  className={`w-full text-left rounded-lg border px-3.5 py-3 transition-colors ${
                    entry.isCurrent
                      ? "border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50"
                      : "border-gray-200 bg-white hover:bg-slate-50"
                  }`}
                  aria-expanded={open}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-gray-900">{entry.title}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {entry.isInitial && !entry.isCurrent
                          ? `Created ${formatSalaryDate(entry.eventDate)}`
                          : entry.isInitial
                            ? `Created ${formatSalaryDate(entry.eventDate || entry.createdDate)}`
                            : entry.isCurrent
                              ? `Revised ${formatSalaryDate(entry.eventDate)}`
                              : `In effect until next revise · ${formatSalaryDate(entry.eventDate)}`}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                        CTC annual
                      </p>
                      <p className="text-[13px] font-semibold tabular-nums text-gray-900">
                        {formatINR(entry.snapshot?.ctc_annual)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                        Gross / mo
                      </p>
                      <p className="text-[13px] font-semibold tabular-nums text-gray-900">
                        {formatINR(entry.snapshot?.gross_monthly)}
                      </p>
                    </div>
                    {ctcDelta != null && ctcDelta !== 0 ? (
                      <p className={`text-[11px] font-medium ${deltaClass(ctcDelta)}`}>
                        {formatDelta(ctcDelta)} vs prior
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-1.5 text-[11px] text-gray-500 space-y-0.5">
                    <p>W.E.F. {formatSalaryDate(entry.wef)}</p>
                    {entry.reason ? <p className="text-gray-600">{entry.reason}</p> : null}
                  </div>
                </button>

                {open ? (
                  <div className="mt-2 ml-0 rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-4">
                    <AmountBreakdown snapshot={entry.snapshot} compareTo={older} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AmountBreakdown({ snapshot, compareTo }) {
  return (
    <div className="space-y-4">
      {AMOUNT_GROUPS.map((group) => {
        const visibleRows = group.rows.filter((row) => {
          const v = num(snapshot?.[row.key]);
          const p = num(compareTo?.[row.key]);
          if (row.emphasize) return true;
          if (v != null && v !== 0) return true;
          if (p != null && p !== 0) return true;
          return false;
        });
        if (!visibleRows.length) return null;

        return (
          <div key={group.title}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5">
              {group.title}
            </p>
            <div className="overflow-x-auto rounded border border-slate-100">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="text-left font-semibold px-2.5 py-1.5">Component</th>
                    <th className="text-right font-semibold px-2.5 py-1.5">Amount</th>
                    <th className="text-right font-semibold px-2.5 py-1.5">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const value = num(snapshot?.[row.key]);
                    const prior = num(compareTo?.[row.key]);
                    const d = value != null && prior != null ? value - prior : null;
                    return (
                      <tr
                        key={row.key}
                        className={`border-t border-slate-100 ${
                          row.emphasize ? "bg-slate-50/80" : ""
                        }`}
                      >
                        <td
                          className={`px-2.5 py-1.5 text-slate-700 ${
                            row.emphasize ? "font-semibold text-slate-900" : ""
                          }`}
                        >
                          {row.label}
                        </td>
                        <td
                          className={`px-2.5 py-1.5 text-right tabular-nums ${
                            row.emphasize ? "font-semibold text-slate-900" : "text-slate-800"
                          }`}
                        >
                          {formatINR(value)}
                        </td>
                        <td
                          className={`px-2.5 py-1.5 text-right tabular-nums font-medium ${deltaClass(d)}`}
                        >
                          {compareTo ? formatDelta(d) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
