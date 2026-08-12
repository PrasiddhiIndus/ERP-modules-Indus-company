import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { History, RefreshCw } from "lucide-react";
import { formatINR, formatSalaryDate, getSalaryStructure } from "../../adminOperations/salaryAdmin/salaryData";
import SalaryRevisionHistory from "../../adminOperations/salaryAdmin/SalaryRevisionHistory";
import { Drawer } from "../../adminOperations/components/AdminUi";

/**
 * Employee Master → Salary revisions (CTC change history for this person).
 * Compact summary only; full list opens on History click.
 */
export default function EmployeeSalaryRevisionsTab({ employee }) {
  const [, setSearchParams] = useSearchParams();
  const [salary, setSalary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ctc = await getSalaryStructure(employee?.id);
        if (!cancelled) setSalary(ctc);
      } catch (err) {
        console.warn(err);
        if (!cancelled) setSalary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employee?.id]);

  function goReviseCtc() {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", "ctc");
    next.set("mode", "revise");
    setSearchParams(next, { replace: false });
  }

  if (loading) {
    return <p className="text-sm text-slate-500 py-8 text-center">Loading salary revisions…</p>;
  }

  const versionCount = salary?.declared
    ? (Number(salary.revision_count) ||
        (Array.isArray(salary.revisions) ? salary.revisions.length : 0) ||
        0) + 1
    : 0;
  const lastDate = salary?.updated_at || salary?.wef_date || null;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">CTC change history for this employee.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            disabled={!salary?.declared}
            className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <History className="h-3.5 w-3.5" />
            History{versionCount ? ` (${versionCount})` : ""}
          </button>
          <button
            type="button"
            onClick={goReviseCtc}
            className="h-8 px-2.5 rounded-md bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Revise CTC
          </button>
        </div>
      </div>

      {!salary?.declared ? (
        <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-lg">
          No CTC yet. Save a compensation structure first — create and later revisions appear in History.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full text-left rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 hover:bg-emerald-50"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
              Current CTC
            </p>
            <span className="text-[10px] font-medium text-emerald-700">
              Version {versionCount}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
            Annual CTC · {formatINR(salary.ctc_annual)}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            Last updated {formatSalaryDate(lastDate)} · click for full revision list and amounts
          </p>
        </button>
      )}

      <Drawer
        open={historyOpen}
        title="CTC revision history"
        onClose={() => setHistoryOpen(false)}
        widthClass="max-w-xl"
      >
        <SalaryRevisionHistory employee={employee} salary={salary} />
      </Drawer>
    </div>
  );
}
