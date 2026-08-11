import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { getSalaryStructure } from "../../adminOperations/salaryAdmin/salaryData";
import SalaryRevisionHistory from "../../adminOperations/salaryAdmin/SalaryRevisionHistory";

/** Display-only — inject sample revision rows when none exist yet. */
const SHOW_REVISION_PREVIEW_MOCK = true;

function buildMockRevisions(employeeId) {
  const id = employeeId ?? "preview";
  return [
    {
      id: `mock_rev_${id}_2`,
      revision_no: 2,
      basic_monthly: 16500,
      gross_monthly: 32000,
      ctc_annual: 456000,
      wef_date: "2025-04-01",
      revision_reason: "Annual increment FY 2025–26",
      revised_at: "2025-03-20T10:00:00.000Z",
    },
    {
      id: `mock_rev_${id}_1`,
      revision_no: 1,
      basic_monthly: 15000,
      gross_monthly: 28000,
      ctc_annual: 400000,
      wef_date: "2024-07-01",
      revision_reason: "Joining CTC",
      revised_at: "2024-06-25T09:00:00.000Z",
    },
  ];
}

function buildMockSalary(employee) {
  const id = employee?.id ?? "preview";
  return {
    id: `mock_ctc_${id}`,
    employee_master_id: id,
    declared: true,
    revision_count: 2,
    basic_monthly: 18000,
    hra_monthly: 7200,
    special_allowance_monthly: 9800,
    gross_monthly: 35000,
    ctc_monthly: 42000,
    ctc_annual: 504000,
    take_home_monthly: 29300,
    wef_date: "2026-04-01",
    revision_reason: "Annual increment FY 2026–27",
    updated_at: "2026-03-28T12:00:00.000Z",
    revisions: buildMockRevisions(id),
    _preview_mock: true,
  };
}

/**
 * Employee Master → Salary revisions (CTC change history for this person).
 */
export default function EmployeeSalaryRevisionsTab({ employee }) {
  const [, setSearchParams] = useSearchParams();
  const [salary, setSalary] = useState(null);
  const [usingMock, setUsingMock] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ctc = await getSalaryStructure(employee?.id);
        const hasRevisions = Array.isArray(ctc?.revisions) && ctc.revisions.length > 0;

        if (!cancelled) {
          if (hasRevisions) {
            setSalary(ctc);
            setUsingMock(false);
          } else if (SHOW_REVISION_PREVIEW_MOCK) {
            if (ctc?.declared) {
              setSalary({
                ...ctc,
                revision_count: Math.max(Number(ctc.revision_count) || 0, 2),
                revisions: buildMockRevisions(employee?.id),
                _preview_mock: true,
              });
            } else {
              setSalary(buildMockSalary(employee));
            }
            setUsingMock(true);
          } else {
            setSalary(ctc);
            setUsingMock(false);
          }
        }
      } catch (err) {
        console.warn(err);
        if (!cancelled) {
          if (SHOW_REVISION_PREVIEW_MOCK) {
            setSalary(buildMockSalary(employee));
            setUsingMock(true);
          } else {
            setSalary(null);
            setUsingMock(false);
          }
        }
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

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">CTC change history for this employee.</p>
        <div className="flex items-center gap-2">
          <Link
            to={`/app/admin/salary-admin/salary-components?employee=${encodeURIComponent(String(employee?.id || ""))}`}
            className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Salary components
          </Link>
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

      {usingMock ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing sample revision history for layout preview. Real CTC revisions replace these when saved.
        </p>
      ) : null}
      <SalaryRevisionHistory employee={employee} salary={salary} />
    </div>
  );
}
