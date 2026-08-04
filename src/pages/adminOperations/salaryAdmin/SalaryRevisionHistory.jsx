import React, { useEffect, useState } from "react";
import { formatINR, formatSalaryDate, getSalaryRevisions } from "./salaryData";

/**
 * Shared CTC revision history panel (Salary Master drawer + CTC page drawer).
 */
export default function SalaryRevisionHistory({ employee, salary, currentPreview = null }) {
  const [revisions, setRevisions] = useState(() =>
    Array.isArray(salary?.revisions) ? salary.revisions : []
  );

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

  const current = salary?.declared
    ? salary
    : currentPreview?.declared
      ? currentPreview
      : null;

  if (!employee) return null;

  const currentVersion = (Number(current?.revision_count) || 0) + 1;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3">
        <p className="text-sm font-semibold text-gray-900">{employee.full_name || "Employee"}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {[employee.employee_code || employee.employee_id, employee.designation, employee.department]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>

      {current ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
              Current CTC
            </p>
            <span className="text-[10px] font-medium text-emerald-700">
              Version {currentVersion}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Meta label="Basic / mo" value={formatINR(current.basic_monthly)} />
            <Meta label="Gross / mo" value={formatINR(current.gross_monthly)} />
            <Meta label="CTC annual" value={formatINR(current.ctc_annual)} />
            <Meta label="Take home" value={formatINR(current.take_home_monthly)} />
          </div>
          <div className="mt-3 pt-2.5 border-t border-emerald-200/80 space-y-1.5">
            <MetaRow label="W.E.F. date" value={formatSalaryDate(current.wef_date)} />
            <MetaRow
              label="Revision reason"
              value={current.revision_reason?.trim() || "—"}
            />
            <MetaRow label="Last updated" value={formatSalaryDate(current.updated_at)} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
          No CTC set yet. Open the employee to enter the first compensation structure.
        </p>
      )}

      <div>
        <h5 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mb-3">
          Previous revisions ({revisions.length})
        </h5>
        {revisions.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
            No revisions yet. The first change after initial CTC will appear here.
          </p>
        ) : (
          <ul className="space-y-0 border-l-2 border-gray-200 ml-1.5">
            {revisions.map((rev, i) => {
              const wef = rev.wef_date || rev.superseded_wef || null;
              const reason = rev.revision_reason?.trim() || "";
              const prevCtc = revisions[i + 1]?.ctc_annual;
              const delta =
                prevCtc != null && rev.ctc_annual != null
                  ? Number(rev.ctc_annual) - Number(prevCtc)
                  : null;

              return (
                <li key={rev.id || `${rev.revision_no}-${i}`} className="relative pl-5 pb-5 last:pb-0">
                  <span className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-400 ring-2 ring-white" />
                  <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-gray-800">
                        Revision {rev.revision_no || revisions.length - i}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {formatSalaryDate(rev.revised_at)}
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                      <Meta label="Gross" value={formatINR(rev.gross_monthly)} />
                      <Meta label="CTC annual" value={formatINR(rev.ctc_annual)} />
                    </div>
                    {delta != null && delta !== 0 ? (
                      <p
                        className={`mt-1.5 text-[11px] font-medium ${
                          delta > 0 ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {formatINR(delta)} vs earlier
                      </p>
                    ) : null}
                    <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                      <p>W.E.F. {formatSalaryDate(wef)}</p>
                      {reason ? <p className="text-gray-500">{reason}</p> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 text-right font-medium">{value}</span>
    </div>
  );
}
