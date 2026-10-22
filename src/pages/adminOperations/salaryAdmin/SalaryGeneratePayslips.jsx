import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, History, PencilLine, RefreshCw, Search } from "lucide-react";
import {
  Badge,
  Drawer,
  FilterBar,
  KpiTile,
  SectionCard,
  StatusChip,
  TinyInput,
} from "../components/AdminUi";
import { RegisterDepartmentFilter } from "../employee/RegisterDepartmentFilter";
import { departmentInSelection } from "../../../lib/employeeMasterDepartments";
import {
  buildPayslipFromLine,
  formatPayslipMoney,
  listPayslipsForMonthAsync,
  payslipRevisionList,
} from "../../../lib/salaryPayslips";
import {
  generatePayslipsForProcessedEmployees,
  getMonthRunByKey,
  getMonthRunWithLines,
  monthKey,
  monthLabel,
  reviseProcessedLineForPayslip,
  salaryLineLocked,
  salaryLockedOn,
} from "./salaryMonthProcessing";
import {
  buildPayslipDemoBundle,
  demoGeneratePayslips,
  demoRevisePayslip,
} from "./salaryPayslipDemo";
import { formatINRPlain } from "./salaryData";
import { salaryFiguresHidden } from "./salaryPrivacy";
import PayslipPreviewModal from "../../admin/employeeMaster/PayslipPreviewModal";
import { toast } from "../../../lib/toast";

const textIn =
  "h-8 px-2 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const btnGhost =
  "h-8 px-2.5 text-[11px] font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1";
const btnPrimary =
  "h-8 px-2.5 text-[11px] font-semibold rounded bg-accent text-white hover:bg-accent-deep disabled:opacity-50 inline-flex items-center gap-1";

function Money({ value }) {
  if (salaryFiguresHidden()) return <span className="tabular-nums">XXXXX</span>;
  if (value == null || value === "") return <span className="text-slate-300">—</span>;
  return <span className="tabular-nums">₹{formatINRPlain(value)}</span>;
}

function slipStatus(line, slip) {
  if (slip || line?.computed_json?.payslip) {
    const rev =
      slip?.payslip_revision_no ||
      line?.computed_json?.payslip_revision_no ||
      slip?.revision_no ||
      1;
    return { id: "generated", label: `Payslip · Rev ${rev}`, severity: "info" };
  }
  if (salaryLineLocked(line)) {
    return { id: "locked", label: "Locked (no slip file)", severity: "warning" };
  }
  return { id: "pending", label: "Pending generate", severity: "neutral" };
}

function matchesDepartmentFilter(department, selectedDepartments) {
  if (!selectedDepartments?.length) return true;
  return departmentInSelection(department, selectedDepartments);
}

/**
 * Salary Processing → Generate Payslip tab.
 * Lists processed employees; generate individually / by department;
 * revise amounts with full payslip revision history. Demo seed when no live run.
 */
export default function SalaryGeneratePayslips({ year, month, monthDays, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [slipsByEmp, setSlipsByEmp] = useState(() => new Map());
  const [departments, setDepartments] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [slipFilter, setSlipFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [preview, setPreview] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [reviseFor, setReviseFor] = useState(null);
  const [reviseMode, setReviseMode] = useState("regenerate"); // regenerate | revise
  const [reviseForm, setReviseForm] = useState({});
  const [reviseNote, setReviseNote] = useState("");

  const applyBundle = useCallback((bundle, demo) => {
    setIsDemo(Boolean(demo || bundle?.isDemo));
    setRun(bundle?.run || null);
    setLines(bundle?.lines || []);
    setSlipsByEmp(bundle?.slipsByEmp || new Map());
    setDepartments(bundle?.departments || []);
  }, []);

  const loadDemo = useCallback(() => {
    const bundle = buildPayslipDemoBundle({
      year,
      month,
      monthDays: monthDays || 26,
    });
    applyBundle(bundle, true);
    setSelectedIds([]);
    setLoading(false);
  }, [year, month, monthDays, applyBundle]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = monthKey(year, month);
      const existing = await getMonthRunByKey(key);
      if (!existing?.id) {
        loadDemo();
        return;
      }
      const bundle = await getMonthRunWithLines(existing.id);
      const monthLines = bundle.lines || [];
      const depts = [
        ...new Set(monthLines.map((l) => String(l.department || "").trim()).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b));

      const slips = await listPayslipsForMonthAsync(key);
      const map = new Map();
      for (const s of slips || []) map.set(String(s.employee_master_id), s);
      for (const line of monthLines) {
        const id = String(line.employee_master_id);
        if (!map.has(id) && line.computed_json?.payslip) {
          map.set(id, line.computed_json.payslip);
        }
      }

      applyBundle(
        {
          run: bundle.run,
          lines: monthLines,
          slipsByEmp: map,
          departments: depts,
        },
        false
      );
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      toast.warning("Could not load live processed salary — showing demo.");
      loadDemo();
    } finally {
      setLoading(false);
    }
  }, [year, month, applyBundle, loadDemo]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lines || [])
      .filter((line) => matchesDepartmentFilter(line.department, selectedDepartments))
      .filter((line) => {
        if (!q) return true;
        const hay = [line.employee_code, line.employee_name, line.department, line.designation]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .filter((line) => {
        const slip = slipsByEmp.get(String(line.employee_master_id));
        const st = slipStatus(line, slip).id;
        if (slipFilter === "pending") return st === "pending" || st === "locked";
        if (slipFilter === "generated") return st === "generated";
        return true;
      })
      .map((line) => {
        const slip = slipsByEmp.get(String(line.employee_master_id)) || null;
        return { line, slip, status: slipStatus(line, slip) };
      });
  }, [lines, selectedDepartments, search, slipFilter, slipsByEmp]);

  const kpis = useMemo(() => {
    const total = lines.length;
    const generated = lines.filter(
      (l) => slipsByEmp.has(String(l.employee_master_id)) || l.computed_json?.payslip
    ).length;
    const pending = Math.max(0, total - generated);
    const net = rows.reduce((s, r) => s + (Number(r.line.net_salary) || 0), 0);
    return { total, generated, pending, net, visible: rows.length };
  }, [lines, slipsByEmp, rows]);

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedIds.includes(String(r.line.employee_master_id)));

  const toggleSelect = (id) => {
    const key = String(id);
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelectedIds([]);
    else setSelectedIds(rows.map((r) => String(r.line.employee_master_id)));
  };

  const selectedPool = useMemo(() => {
    if (!selectedIds.length) return rows;
    const set = new Set(selectedIds.map(String));
    return rows.filter((r) => set.has(String(r.line.employee_master_id)));
  }, [rows, selectedIds]);

  const resolveGenerateIds = ({ deptOnly = false } = {}) => {
    if (deptOnly && selectedDepartments.length) {
      return lines
        .filter((l) => matchesDepartmentFilter(l.department, selectedDepartments))
        .map((l) => l.employee_master_id);
    }
    return selectedPool.map((r) => r.line.employee_master_id);
  };

  const handleGenerate = async ({ forceRevision = false, deptOnly = false } = {}) => {
    const ids = resolveGenerateIds({ deptOnly });
    if (!ids.length) {
      toast.warning(
        selectedDepartments.length
          ? "No processed employees in the selected department(s)."
          : "Select employees, or leave selection empty to use the filtered list."
      );
      return;
    }
    setBusy(true);
    try {
      if (isDemo) {
        const result = demoGeneratePayslips({
          run,
          lines,
          slipsByEmp,
          employeeIds: ids,
          forceRevision,
          note: forceRevision ? "Regenerated from salary sheet (demo)" : "Generated (demo)",
        });
        setLines(result.lines);
        setSlipsByEmp(result.slipsByEmp);
        if (!result.slipCount) {
          toast.warning(
            forceRevision
              ? "No payslips were updated."
              : "Selected employees already have payslips. Use Regenerate selected for a new revision."
          );
        } else {
          toast.success(
            `${result.slipCount} payslip(s) ${forceRevision ? "updated" : "generated"} (demo).`
          );
        }
        setSelectedIds([]);
        return;
      }

      const result = await generatePayslipsForProcessedEmployees({
        year,
        month,
        employeeIds: ids,
        forceRevision,
        note: forceRevision ? "Regenerated from salary sheet" : "Generated",
      });
      if (!result.slipCount) {
        toast.warning(
          forceRevision
            ? "No payslips were updated."
            : "Selected employees already have payslips. Use Regenerate selected to create a new revision."
        );
      } else {
        toast.success(
          `${result.slipCount} payslip(s) ${forceRevision ? "updated" : "generated"} for ${monthLabel(year, month)}.`
        );
      }
      setSelectedIds([]);
      await load();
      onChanged?.();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not generate payslips.");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = (row) => {
    const slip =
      row.slip ||
      (run ? buildPayslipFromLine(run, row.line, { processedOn: salaryLockedOn(row.line) || run.processed_on }) : null);
    if (!slip) {
      toast.warning("Generate the payslip first for this employee.");
      return;
    }
    setPreview(slip);
  };

  const openHistory = (row) => {
    const slip =
      row.slip ||
      (run ? buildPayslipFromLine(run, row.line, { processedOn: salaryLockedOn(row.line) || run.processed_on }) : null);
    setHistoryFor({ row, slip, revisions: payslipRevisionList(slip) });
  };

  const openRevise = (row, mode = "revise") => {
    const line = row.line;
    setReviseMode(mode);
    setReviseFor(row);
    setReviseNote(mode === "regenerate" ? "Regenerated with amount edits" : "");
    setReviseForm({
      present_days: line.present_days ?? "",
      loan: line.loan ?? 0,
      sal_adv: line.sal_adv ?? 0,
      unpaid_paid: line.unpaid_paid ?? 0,
      tds: line.tds ?? 0,
      pt_amount: line.pt_amount ?? 0,
      pf_basic: line.pf_basic ?? 0,
      custom_earn_full: line.custom_earn_full ?? 0,
      custom_ded_full: line.custom_ded_full ?? 0,
    });
  };

  /** Regenerate selected → open edit amounts drawer (one employee), then regenerate. */
  const openRegenerateWithEdit = () => {
    if (!selectedIds.length) {
      toast.warning("Select one employee, edit amounts, then regenerate the payslip.");
      return;
    }
    if (selectedIds.length > 1) {
      toast.warning(
        "Select only one employee to edit amounts and regenerate. For many staff without edits, use Generate / department first."
      );
      return;
    }
    const row = selectedPool[0];
    if (!row) {
      toast.warning("Select one employee to regenerate.");
      return;
    }
    openRevise(row, "regenerate");
  };

  const saveRevision = async () => {
    if (!reviseFor?.line) return;
    setBusy(true);
    const defaultNote =
      reviseMode === "regenerate"
        ? isDemo
          ? "Regenerated with amount edits (demo)"
          : "Regenerated with amount edits"
        : isDemo
          ? "Amount revision (demo)"
          : "Amount revision";
    try {
      const patch = {};
      for (const [k, v] of Object.entries(reviseForm)) {
        if (v === "" || v == null) continue;
        patch[k] = Number(v);
      }

      if (isDemo) {
        const result = demoRevisePayslip({
          run,
          lines,
          slipsByEmp,
          employeeMasterId: reviseFor.line.employee_master_id,
          patch,
          note: reviseNote.trim() || defaultNote,
        });
        setLines(result.lines);
        setSlipsByEmp(result.slipsByEmp);
        toast.success(
          `Payslip regenerated · Rev ${result.slip?.payslip_revision_no || ""} · ${reviseFor.line.employee_name || "employee"} (demo).`
        );
        setReviseFor(null);
        setSelectedIds([]);
        if (result.slip) setPreview(result.slip);
        return;
      }

      const result = await reviseProcessedLineForPayslip({
        year,
        month,
        employeeMasterId: reviseFor.line.employee_master_id,
        patch,
        note: reviseNote.trim() || defaultNote,
      });
      toast.success(
        `Payslip regenerated · Rev ${result.slip?.payslip_revision_no || ""} · ${reviseFor.line.employee_name || "employee"}.`
      );
      setReviseFor(null);
      setSelectedIds([]);
      await load();
      onChanged?.();
      if (result.slip) setPreview(result.slip);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not regenerate payslip.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {isDemo ? (
        <div className="rounded-lg border border-info-border bg-info-soft px-3 py-2 text-[11px] text-info flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Demo mode</strong> — no live processed salary for {monthLabel(year, month)}.
            Try filters, Generate by department, Preview, Revise amounts, and History. Nothing is
            saved to the database. Process salary on All Employees to use live data.
          </span>
          <button type="button" className={btnGhost} onClick={loadDemo} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Reset demo
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Processed on sheet" value={String(kpis.total)} sub={monthLabel(year, month)} />
        <KpiTile label="Payslips generated" value={String(kpis.generated)} sub="Have a slip file" />
        <KpiTile label="Pending generate" value={String(kpis.pending)} sub="Processed, no slip yet" />
        <KpiTile
          label="Visible net"
          value={salaryFiguresHidden() ? "XXXXX" : `₹${formatINRPlain(kpis.net)}`}
          sub={`${kpis.visible} in filters`}
          tone="border-accent-border"
        />
      </div>

      <SectionCard
        title="Payslips for processed salary"
        right={
          <div className="flex items-center gap-2">
            {isDemo ? <Badge tone="bg-info-soft text-info border border-info-border">Demo</Badge> : null}
            <StatusChip
              label={run ? `Sheet rev ${run.revision_no || 1}` : "—"}
              severity="neutral"
            />
          </div>
        }
      >
        <div className="space-y-3">
          <FilterBar>
            <label className="min-w-[10rem]">
              <span className="text-[11px] text-ink-muted">Department</span>
              <div className="mt-1">
                <RegisterDepartmentFilter
                  options={departments}
                  selected={selectedDepartments}
                  onChange={setSelectedDepartments}
                />
              </div>
            </label>
            <label className="min-w-[8rem]">
              <span className="text-[11px] text-ink-muted">Slip status</span>
              <select
                className={`${textIn} mt-1 w-full`}
                value={slipFilter}
                onChange={(e) => setSlipFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="pending">Pending generate</option>
                <option value="generated">Generated</option>
              </select>
            </label>
            <label className="flex-1 min-w-[12rem] max-w-sm">
              <span className="text-[11px] text-ink-muted">Search</span>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  className={`${textIn} pl-7 w-full`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, code, department…"
                />
              </div>
            </label>
            <div className="flex flex-wrap items-end gap-1.5 pb-0.5">
              <button
                type="button"
                className={btnGhost}
                disabled={busy || loading}
                onClick={() => (isDemo ? loadDemo() : load())}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy || !selectedDepartments.length || !lines.length}
                title="Generate for all processed employees in selected department(s)"
                onClick={() => handleGenerate({ deptOnly: true })}
              >
                <FileText className="h-3.5 w-3.5" />
                Generate by department
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy || !selectedPool.length}
                onClick={openRegenerateWithEdit}
                title="Select one employee → edit amounts → regenerate payslip (new revision + history)"
              >
                <PencilLine className="h-3.5 w-3.5" />
                Regenerate selected
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !selectedPool.length}
                onClick={() => handleGenerate({ forceRevision: false })}
              >
                <Download className="h-3.5 w-3.5" />
                {busy
                  ? "Working…"
                  : selectedIds.length
                    ? `Generate selected (${selectedPool.length})`
                    : `Generate filtered (${selectedPool.length})`}
              </button>
            </div>
          </FilterBar>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-raised text-ink-secondary">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all visible"
                    />
                  </th>
                  <th className="px-2 py-2 text-left">Code</th>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Department</th>
                  <th className="px-2 py-2 text-right">Present</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2 text-right">Net</th>
                  <th className="px-2 py-2 text-left">Payslip</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-ink-muted">
                      Loading processed employees…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-ink-muted">
                      No processed employees match these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map(({ line, slip, status }) => {
                    const id = String(line.employee_master_id);
                    const checked = selectedIds.includes(id);
                    return (
                      <tr key={line.id || id} className="border-t border-divider hover:bg-accent-soft/20">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(id)}
                            aria-label={`Select ${line.employee_name || id}`}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{line.employee_code || "—"}</td>
                        <td className="px-2 py-1.5 font-medium text-ink">{line.employee_name || "—"}</td>
                        <td className="px-2 py-1.5 text-ink-secondary">{line.department || "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{line.present_days ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">
                          <Money value={line.gross_wages} />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">
                          <Money value={line.net_salary} />
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusChip label={status.label} severity={status.severity} />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button
                              type="button"
                              className={btnGhost}
                              onClick={() => openPreview({ line, slip })}
                              title="Preview payslip"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className={btnGhost}
                              onClick={() => openHistory({ line, slip })}
                              title="Revision history"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className={btnGhost}
                              onClick={() => openRevise({ line, slip }, "regenerate")}
                              title="Edit amounts and regenerate payslip"
                              disabled={salaryFiguresHidden()}
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-ink-muted">
            Tick staff and Generate, or filter by department. To change amounts: select one
            employee → Regenerate selected (or pencil) → edit present days / deductions →
            Regenerate payslip. A new revision is kept in History.
          </p>
        </div>
      </SectionCard>

      {preview ? (
        <PayslipPreviewModal payslip={preview} onClose={() => setPreview(null)} />
      ) : null}

      <Drawer
        open={Boolean(historyFor)}
        title={
          historyFor
            ? `Payslip history · ${historyFor.row?.line?.employee_name || ""}`
            : "Payslip history"
        }
        onClose={() => setHistoryFor(null)}
        widthClass="max-w-lg"
      >
        {historyFor ? (
          <div className="space-y-3 text-xs">
            <p className="text-ink-secondary">
              {historyFor.row?.line?.employee_code} · {monthLabel(year, month)}
            </p>
            {(historyFor.revisions || []).length === 0 ? (
              <p className="text-ink-muted py-6 text-center">No revisions yet. Generate a payslip first.</p>
            ) : (
              <ul className="space-y-2">
                {historyFor.revisions.map((rev) => (
                  <li
                    key={`${rev.revision_no}_${rev.generated_at}`}
                    className={`rounded-lg border px-3 py-2 ${
                      rev.current ? "border-accent-border bg-accent-soft/30" : "border-border bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        Revision {rev.revision_no}
                        {rev.current ? " · current" : ""}
                      </span>
                      <span className="text-ink-muted tabular-nums">
                        {rev.generated_at ? String(rev.generated_at).slice(0, 16).replace("T", " ") : "—"}
                      </span>
                    </div>
                    {rev.note ? <p className="mt-1 text-ink-secondary">{rev.note}</p> : null}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-ink-muted">Gross</span>
                        <p className="font-medium">{formatPayslipMoney(rev.gross_wages)}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Deductions</span>
                        <p className="font-medium">{formatPayslipMoney(rev.total_ded)}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Net</span>
                        <p className="font-medium">{formatPayslipMoney(rev.net_salary)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(reviseFor)}
        title={
          reviseFor
            ? `Regenerate payslip · ${reviseFor.line?.employee_name || ""}`
            : "Regenerate payslip"
        }
        onClose={() => !busy && setReviseFor(null)}
        widthClass="max-w-md"
      >
        {reviseFor ? (
          <div className="space-y-3 text-xs">
            <p className="text-ink-secondary">
              {reviseFor.line.employee_code} · {monthLabel(year, month)} · working days{" "}
              {monthDays || run?.month_days || "—"}
              {isDemo ? " · demo" : ""}
            </p>
            <div className="rounded-lg border border-border bg-surface-sunken/40 px-3 py-2 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-ink-muted">Current gross</span>
                <p className="font-semibold tabular-nums">
                  <Money value={reviseFor.line.gross_wages} />
                </p>
              </div>
              <div>
                <span className="text-ink-muted">Current net</span>
                <p className="font-semibold tabular-nums">
                  <Money value={reviseFor.line.net_salary} />
                </p>
              </div>
            </div>
            <p className="text-[11px] text-ink-secondary">
              Edit amounts below, then regenerate. Totals recompute and a new revision is stored in
              history.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["present_days", "Present days"],
                ["pf_basic", "PF basic"],
                ["pt_amount", "P.Tax"],
                ["loan", "Loan"],
                ["sal_adv", "Salary advance"],
                ["unpaid_paid", "Unpaid / paid"],
                ["tds", "TDS"],
                ["custom_earn_full", "Extra earnings"],
                ["custom_ded_full", "Extra deductions"],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-ink-muted">{label}</span>
                  <TinyInput
                    type="number"
                    step="any"
                    className="mt-1 w-full text-right tabular-nums"
                    value={reviseForm[key] ?? ""}
                    onChange={(e) => setReviseForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-ink-muted">Revision note</span>
              <TinyInput
                className="mt-1 w-full"
                value={reviseNote}
                onChange={(e) => setReviseNote(e.target.value)}
                placeholder="e.g. Attendance correction"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} disabled={busy} onClick={() => setReviseFor(null)}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} disabled={busy} onClick={saveRevision}>
                {busy ? "Regenerating…" : "Regenerate payslip"}
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
