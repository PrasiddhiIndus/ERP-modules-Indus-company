import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  formatINR,
  formatPA,
  formatSalaryDate,
  getSalaryRevisions,
  paFromMonthly,
} from "./salaryData";

/**
 * History rows: monthly field + optional P.A. override key.
 * P.A. = override from pa_overrides_json, else monthly × 12 (or ctc_annual for CTC).
 */
const HISTORY_ROWS = [
  { monthlyKey: "gross_monthly", paKey: "gross", label: "Gross", group: "Part A — earnings" },
  { monthlyKey: "basic_monthly", paKey: "basic", label: "Basic", group: "Part A — earnings" },
  { monthlyKey: "hra_monthly", paKey: "hra", label: "HRA", group: "Part A — earnings" },
  {
    monthlyKey: "special_allowance_monthly",
    paKey: "special",
    label: "Special allowance",
    group: "Part A — earnings",
  },
  { monthlyKey: "emp_pf_monthly", paKey: "emp_pf", label: "PF (employee)", group: "Employee deductions" },
  { monthlyKey: "pt_monthly", paKey: "pt", label: "Professional tax", group: "Employee deductions" },
  {
    monthlyKey: "emp_esic_monthly",
    paKey: "emp_esic",
    label: "ESIC (employee)",
    group: "Employee deductions",
  },
  {
    monthlyKey: "take_home_monthly",
    paKey: "take_home",
    label: "Take home",
    group: "Employee deductions",
    emphasize: true,
  },
  { monthlyKey: "er_pf_monthly", paKey: "er_pf", label: "PF (employer)", group: "Part B — employer" },
  {
    monthlyKey: "er_esic_monthly",
    paKey: "er_esic",
    label: "ESIC (employer)",
    group: "Part B — employer",
  },
  { monthlyKey: "gratuity_monthly", paKey: "gratuity", label: "Gratuity", group: "Part B — employer" },
  {
    monthlyKey: "leave_encash_monthly",
    paKey: "leave_encash",
    label: "Leave encashment",
    group: "Part B — employer",
  },
  {
    monthlyKey: "mediclaim_monthly",
    paKey: "mediclaim",
    label: "Mediclaim",
    group: "Part B — employer",
  },
  { monthlyKey: "lic_monthly", paKey: "lic", label: "LIC", group: "Part B — employer" },
  {
    monthlyKey: "special_perf_bonus_monthly",
    paKey: "special_perf",
    label: "Special / perf. bonus",
    group: "Part B — employer",
  },
  { monthlyKey: "bonus_monthly", paKey: "bonus", label: "Bonus", group: "Part B — employer" },
  {
    monthlyKey: "total_b_monthly",
    paKey: "total_b",
    label: "Total Part B",
    group: "Part B — employer",
    emphasize: true,
  },
  {
    monthlyKey: "ctc_monthly",
    paKey: "ctc",
    label: "CTC",
    group: "CTC totals",
    emphasize: true,
  },
];

const MODE_FIELDS = [
  { key: "basic_mode", label: "Basic mode" },
  { key: "hra_mode", label: "HRA mode" },
  { key: "emp_esic_mode", label: "Employee ESIC mode" },
  { key: "er_esic_mode", label: "Employer ESIC mode" },
  { key: "gratuity_mode", label: "Gratuity mode" },
  { key: "leave_encash_mode", label: "Leave encashment mode" },
  { key: "employee_level", label: "Employee level" },
];

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nearlyEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 0.001;
}

function paOverridesOf(snapshot) {
  const raw = snapshot?.pa_overrides_json;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

/** Resolve P.A. for a history snapshot: manual override, else monthly × 12 / saved CTC annual. */
function resolvePa(snapshot, paKey, monthlyKey) {
  if (!snapshot) return null;
  const ov = paOverridesOf(snapshot);
  if (ov[paKey] != null && ov[paKey] !== "") {
    const n = num(ov[paKey]);
    if (n != null) return n;
  }
  if (paKey === "ctc") {
    const annual = num(snapshot.ctc_annual);
    if (annual != null) return annual;
  }
  return paFromMonthly(snapshot[monthlyKey]);
}

function deltaClass(d) {
  if (d == null || nearlyEqual(d, 0)) return "text-slate-400";
  return d > 0 ? "text-emerald-700" : "text-amber-700";
}

function formatDelta(d, { annual = false } = {}) {
  if (d == null) return "—";
  if (nearlyEqual(d, 0)) return "No change";
  const sign = d > 0 ? "+" : "−";
  const abs = Math.abs(d);
  const body = (annual ? formatPA(abs) : formatINR(abs)).replace(/^₹/, "");
  return `${sign}₹${body}`;
}

function collectChanges(snapshot, compareTo) {
  if (!compareTo) return [];
  const changes = [];

  for (const field of MODE_FIELDS) {
    const now = snapshot?.[field.key];
    const prev = compareTo?.[field.key];
    if (now != null && prev != null && String(now) !== String(prev)) {
      changes.push({
        id: `mode:${field.key}`,
        label: field.label,
        detail: `${prev} → ${now}`,
      });
    }
  }

  for (const row of HISTORY_ROWS) {
    const mNow = num(snapshot?.[row.monthlyKey]);
    const mPrev = num(compareTo?.[row.monthlyKey]);
    if (mNow != null && mPrev != null && !nearlyEqual(mNow, mPrev)) {
      changes.push({
        id: `m:${row.monthlyKey}`,
        label: `${row.label} (monthly)`,
        detail: formatDelta(mNow - mPrev),
      });
    }

    const paNow = resolvePa(snapshot, row.paKey, row.monthlyKey);
    const paPrev = resolvePa(compareTo, row.paKey, row.monthlyKey);
    if (paNow != null && paPrev != null && !nearlyEqual(paNow, paPrev)) {
      changes.push({
        id: `pa:${row.paKey}`,
        label: `${row.label} (P.A.)`,
        detail: formatDelta(paNow - paPrev, { annual: true }),
      });
    }
  }

  return changes;
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
    if (!employee?.id) {
      setRevisions([]);
      return undefined;
    }

    // Prefer attached revisions when present; always refresh from DB so latest save shows.
    if (Array.isArray(salary?.revisions) && salary.revisions.length > 0) {
      setRevisions(salary.revisions);
    }

    getSalaryRevisions(employee.id)
      .then((rows) => {
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setRevisions(rows);
        } else if (Array.isArray(salary?.revisions)) {
          setRevisions(salary.revisions);
        } else {
          setRevisions([]);
        }
      })
      .catch((err) => {
        console.error("Salary revision history load failed", err);
        if (!cancelled) {
          setRevisions(Array.isArray(salary?.revisions) ? salary.revisions : []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    employee?.id,
    salary?.id,
    salary?.revision_count,
    salary?.updated_at,
    salary?.ctc_annual,
    salary?.revisions,
  ]);

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
            and what changed
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
            const ctcNow = resolvePa(entry.snapshot, "ctc", "ctc_monthly");
            const ctcPrev = resolvePa(older, "ctc", "ctc_monthly");
            const ctcDelta =
              ctcNow != null && ctcPrev != null ? ctcNow - ctcPrev : null;
            const open = expandedId === entry.id;
            const changeCount = older ? collectChanges(entry.snapshot, older).length : 0;

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
                        {formatPA(ctcNow)}
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
                    {ctcDelta != null && !nearlyEqual(ctcDelta, 0) ? (
                      <p className={`text-[11px] font-medium ${deltaClass(ctcDelta)}`}>
                        {formatDelta(ctcDelta, { annual: true })} vs prior
                      </p>
                    ) : null}
                    {changeCount > 0 ? (
                      <p className="text-[11px] text-slate-600">
                        {changeCount} change{changeCount === 1 ? "" : "s"}
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
                    <ChangesSummary snapshot={entry.snapshot} compareTo={older} />
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

function ChangesSummary({ snapshot, compareTo }) {
  const changes = useMemo(() => collectChanges(snapshot, compareTo), [snapshot, compareTo]);
  if (!compareTo) {
    return (
      <p className="text-[12px] text-slate-500">
        Initial saved CTC — no prior version to compare.
      </p>
    );
  }
  if (!changes.length) {
    return (
      <p className="text-[12px] text-slate-500">No amount or mode changes vs prior version.</p>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5">
        What changed
      </p>
      <ul className="rounded border border-slate-100 divide-y divide-slate-100">
        {changes.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12px]"
          >
            <span className="text-slate-700">{c.label}</span>
            <span className="tabular-nums font-medium text-slate-900 shrink-0">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AmountBreakdown({ snapshot, compareTo }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const row of HISTORY_ROWS) {
      const monthly = num(snapshot?.[row.monthlyKey]);
      const priorMonthly = num(compareTo?.[row.monthlyKey]);
      const pa = resolvePa(snapshot, row.paKey, row.monthlyKey);
      const priorPa = resolvePa(compareTo, row.paKey, row.monthlyKey);
      const monthlyChanged =
        compareTo && monthly != null && priorMonthly != null && !nearlyEqual(monthly, priorMonthly);
      const paChanged =
        compareTo && pa != null && priorPa != null && !nearlyEqual(pa, priorPa);
      const show =
        row.emphasize ||
        (monthly != null && monthly !== 0) ||
        (pa != null && pa !== 0) ||
        (priorMonthly != null && priorMonthly !== 0) ||
        (priorPa != null && priorPa !== 0) ||
        monthlyChanged ||
        paChanged;
      if (!show) continue;
      if (!map.has(row.group)) map.set(row.group, []);
      map.get(row.group).push({
        ...row,
        monthly,
        priorMonthly,
        pa,
        priorPa,
        monthlyChanged,
        paChanged,
      });
    }
    return [...map.entries()];
  }, [snapshot, compareTo]);

  return (
    <div className="space-y-4">
      {groups.map(([title, rows]) => (
        <div key={title}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5">
            {title}
          </p>
          <div className="overflow-x-auto rounded border border-slate-100">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="text-left font-semibold px-2.5 py-1.5">Component</th>
                  <th className="text-right font-semibold px-2.5 py-1.5">Monthly</th>
                  <th className="text-right font-semibold px-2.5 py-1.5">P.A.</th>
                  <th className="text-right font-semibold px-2.5 py-1.5">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const dMonthly =
                    row.monthly != null && row.priorMonthly != null
                      ? row.monthly - row.priorMonthly
                      : null;
                  const dPa =
                    row.pa != null && row.priorPa != null ? row.pa - row.priorPa : null;
                  const changeBits = [];
                  if (compareTo && dMonthly != null && !nearlyEqual(dMonthly, 0)) {
                    changeBits.push(`Mo ${formatDelta(dMonthly)}`);
                  }
                  if (compareTo && dPa != null && !nearlyEqual(dPa, 0)) {
                    changeBits.push(`P.A. ${formatDelta(dPa, { annual: true })}`);
                  }
                  return (
                    <tr
                      key={row.monthlyKey}
                      className={`border-t border-slate-100 ${
                        row.emphasize || row.monthlyChanged || row.paChanged
                          ? "bg-slate-50/80"
                          : ""
                      }`}
                    >
                      <td
                        className={`px-2.5 py-1.5 text-slate-700 ${
                          row.emphasize ? "font-semibold text-slate-900" : ""
                        }`}
                      >
                        {row.label}
                        {row.paChanged && !row.monthlyChanged ? (
                          <span className="ml-1.5 text-[10px] font-medium text-amber-700">
                            P.A. edited
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`px-2.5 py-1.5 text-right tabular-nums ${
                          row.monthlyChanged || row.emphasize
                            ? "font-semibold text-slate-900"
                            : "text-slate-800"
                        }`}
                      >
                        {formatINR(row.monthly)}
                      </td>
                      <td
                        className={`px-2.5 py-1.5 text-right tabular-nums ${
                          row.paChanged || row.emphasize
                            ? "font-semibold text-slate-900"
                            : "text-slate-800"
                        }`}
                      >
                        {formatPA(row.pa)}
                      </td>
                      <td
                        className={`px-2.5 py-1.5 text-right tabular-nums font-medium ${
                          changeBits.length
                            ? deltaClass(dPa ?? dMonthly)
                            : "text-slate-400"
                        }`}
                      >
                        {compareTo ? (changeBits.length ? changeBits.join(" · ") : "No change") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
