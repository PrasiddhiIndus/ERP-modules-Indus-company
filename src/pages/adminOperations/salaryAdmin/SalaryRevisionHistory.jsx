import React from "react";
import { formatINR, formatSalaryDate, getSalaryRevisions } from "./salaryData";

/**
 * Shared CTC revision history panel (Salary Master drawer + CTC page drawer).
 */
export default function SalaryRevisionHistory({ employee, salary, currentPreview = null }) {
  const revisions = employee ? getSalaryRevisions(employee.id) : [];
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
                <li
                  key={`${rev.revision_no}-${rev.revised_at}-${i}`}
                  className="relative pl-4 pb-5 last:pb-0"
                >
                  <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-accent ring-2 ring-white" />
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-900">
                        Version {currentVersion - 1 - i}
                        <span className="ml-1.5 font-normal text-gray-500">
                          (archived)
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Archived {formatSalaryDate(rev.revised_at)}
                      </p>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <Meta label="Basic / mo" value={formatINR(rev.basic_monthly)} compact />
                      <Meta label="Gross / mo" value={formatINR(rev.gross_monthly)} compact />
                      <Meta label="CTC annual" value={formatINR(rev.ctc_annual)} compact />
                      <Meta label="Take home" value={formatINR(rev.take_home_monthly)} compact />
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-1.5">
                      <MetaRow label="W.E.F. date" value={formatSalaryDate(wef)} />
                      <MetaRow label="Revision reason" value={reason || "—"} />
                    </div>

                    {delta != null && delta !== 0 ? (
                      <p
                        className={`mt-1.5 text-[11px] font-medium tabular-nums ${
                          delta > 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {delta > 0 ? "↑" : "↓"} {formatINR(Math.abs(delta))} vs prior
                      </p>
                    ) : null}
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

function Meta({ label, value, compact = false }) {
  return (
    <div>
      <p
        className={`${
          compact ? "text-gray-500" : "text-[10px] uppercase tracking-wide text-emerald-700/80"
        }`}
      >
        {label}
      </p>
      <p
        className={`font-medium tabular-nums text-gray-900 ${
          compact ? "text-xs" : "text-sm font-semibold"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-right break-words">{value}</span>
    </div>
  );
}
