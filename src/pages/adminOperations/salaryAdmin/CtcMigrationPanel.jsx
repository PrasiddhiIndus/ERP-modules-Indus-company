import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import toast from "../../../lib/toast";
import {
  DenseTable,
  FilterBar,
  InlineAlert,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../components/AdminUi";
import {
  CATEGORY_EXISTING_CONFIRMED,
  CATEGORY_NEW_PROBATION,
  SCHEME_NEW,
  SCHEME_OLD,
  SKILL_SEMI,
  SKILL_SKILLED,
  STATUS_CONFIRMED,
  STATUS_PROBATION,
  calculateCtc,
  roundRupee,
  schemeLabel,
} from "./ctcEngine";
import { resolveRuleVersion } from "./payrollRulesDb";
import { dbFetchSalaryStructureMap, dbReviseSalaryStructure } from "./salaryDb";
import { isAnnexureRecord, resultToStructurePayload, skillLabel, statusLabel } from "./annexureCtcRecord";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return roundRupee(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(d) {
  const s = String(d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y, m, day] = s.split("-");
  return `${day}-${m}-${y}`;
}

function severityFor(code) {
  if (code === "error_gross_below_min") return "critical";
  if (code === "check_ctc_mismatch") return "warning";
  return "info";
}

/**
 * Move employees on the earlier CTC structure to the Compensation Scheme.
 * Nothing is saved until HR selects rows and applies them after reviewing the report.
 */
export default function CtcMigrationPanel({ ruleVersions }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState(new Map());
  const [cutOver, setCutOver] = useState("");
  const [defaultScheme, setDefaultScheme] = useState(SCHEME_OLD);
  const [skillById, setSkillById] = useState({});
  const [schemeById, setSchemeById] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [map, empRes] = await Promise.all([
        dbFetchSalaryStructureMap({ withRevisions: false }),
        supabase
          .from("admin_ifsp_employee_master")
          .select(
            "id, employee_id, employee_code, full_name, department, designation, status, confirmation_date, date_of_birth, date_of_joining"
          )
          .order("employee_id", { ascending: true }),
      ]);
      if (empRes.error) throw empRes.error;
      setStructures(map);
      setEmployees((empRes.data || []).filter((e) => (e.status || "Active") === "Active"));
      setSelected(new Set());
    } catch (err) {
      console.error("CTC migration: load failed", err);
      setError("Could not load employees and current salaries. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const today = todayIso();
    const out = [];
    for (const emp of employees) {
      const s = structures.get(String(emp.id));
      if (!s?.declared || isAnnexureRecord(s)) continue;
      const oldGross = Number(s.gross_monthly) || 0;
      const oldCtc = Number(s.ctc_monthly) || 0;
      const wef = cutOver || String(s.wef_date || "").slice(0, 10) || today;
      const confirmed = Boolean(emp.confirmation_date) && String(emp.confirmation_date).slice(0, 10) <= today;
      const status = confirmed ? STATUS_CONFIRMED : STATUS_PROBATION;
      const skill = skillById[emp.id] || SKILL_SKILLED;
      const scheme = schemeById[emp.id] || defaultScheme;
      const version = resolveRuleVersion(ruleVersions, scheme, wef);
      let result = null;
      let calcError = "";
      if (!version) calcError = "No payroll rules for this scheme.";
      else if (oldGross <= 0) calcError = "No Gross on current CTC.";
      else {
        try {
          result = calculateCtc(version.rules, { skill, status, monthlyGross: oldGross });
        } catch (err) {
          calcError = err?.message || "Could not calculate.";
        }
      }
      out.push({
        id: emp.id,
        emp,
        structure: s,
        wef,
        status,
        skill,
        scheme,
        version,
        result,
        calcError,
        oldGross,
        oldCtc,
        newGross: result?.gross ?? null,
        newCtc: result?.ctc ?? null,
        ctcDiff: result ? result.ctc - oldCtc : null,
        takeHomeDiff: result ? result.take_home - (Number(s.take_home_monthly) || 0) : null,
        validation: result?.validation || null,
        canApply: Boolean(result && !result.validation.blocksSave && version),
      });
    }
    return out;
  }, [employees, structures, cutOver, defaultScheme, skillById, schemeById, ruleVersions]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllValid = () => setSelected(new Set(rows.filter((r) => r.canApply).map((r) => r.id)));

  const downloadReport = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Reconciliation");
      ws.addRow([
        "Emp. Code",
        "Name",
        "Department",
        "Status",
        "Skill",
        "Scheme",
        "W.E.F.",
        "Old Gross",
        "Old CTC",
        "New Gross",
        "New CTC",
        "CTC difference",
        "Take Home difference",
        "Validation",
      ]);
      ws.getRow(1).font = { bold: true };
      for (const r of rows) {
        ws.addRow([
          r.emp.employee_code || r.emp.employee_id || "",
          r.emp.full_name || "",
          r.emp.department || "",
          statusLabel(r.status),
          skillLabel(r.skill),
          schemeLabel(r.scheme),
          fmtDate(r.wef),
          roundRupee(r.oldGross),
          roundRupee(r.oldCtc),
          r.newGross != null ? roundRupee(r.newGross) : "",
          r.newCtc != null ? roundRupee(r.newCtc) : "",
          r.ctcDiff != null ? roundRupee(r.ctcDiff) : "",
          r.takeHomeDiff != null ? roundRupee(r.takeHomeDiff) : "",
          r.validation?.label || r.calcError,
        ]);
      }
      ws.columns.forEach((c) => {
        c.width = 16;
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CTC-Reconciliation-${todayIso()}.xlsx`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error("CTC migration: report export failed", err);
      toast.error("Could not download", "Please try again.");
    }
  };

  const applySelected = async () => {
    const picked = rows.filter((r) => selected.has(r.id) && r.canApply);
    if (!picked.length) {
      toast.warning("Nothing selected", "Select employees without errors first.");
      return;
    }
    if (
      !window.confirm(
        `Create the new salary structure for ${picked.length} employee(s)? Their current CTC moves to history.`
      )
    ) {
      return;
    }
    setApplying(true);
    let ok = 0;
    const failed = [];
    for (const r of picked) {
      try {
        const payload = resultToStructurePayload(r.result, {
          rules: r.version.rules,
          ruleVersionId: r.version.id,
          scheme: r.scheme,
          category: r.status === STATUS_CONFIRMED ? CATEGORY_EXISTING_CONFIRMED : CATEGORY_NEW_PROBATION,
          revisionType: "initial",
          wefDate: r.wef,
          reason: "Moved to Compensation Scheme 2026-27 (reconciliation approved)",
          employee: r.emp,
        });
        await dbReviseSalaryStructure(r.id, payload, { wef_date: r.wef, reason: payload.revision_reason });
        ok += 1;
      } catch (err) {
        console.error("CTC migration: apply failed", r.id, err);
        failed.push(r.emp.employee_code || r.emp.full_name || r.id);
      }
    }
    setApplying(false);
    if (ok) toast.success("Salary structure updated", `${ok} employee(s) moved to the new structure.`);
    if (failed.length) toast.error("Some employees were not updated", failed.slice(0, 5).join(", "));
    await load();
  };

  const columns = [
    {
      key: "pick",
      label: "",
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          disabled={!r.canApply}
          onChange={() => toggle(r.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    { key: "code", label: "Code", render: (r) => r.emp.employee_code || r.emp.employee_id || "—" },
    { key: "name", label: "Name", render: (r) => r.emp.full_name || "—" },
    { key: "status", label: "Status", render: (r) => statusLabel(r.status) },
    {
      key: "skill",
      label: "Skill",
      render: (r) => (
        <TinySelect
          value={r.skill}
          onChange={(e) => setSkillById((m) => ({ ...m, [r.id]: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
        >
          <option value={SKILL_SKILLED}>Skilled</option>
          <option value={SKILL_SEMI}>Semi-skilled</option>
        </TinySelect>
      ),
    },
    {
      key: "scheme",
      label: "Scheme",
      render: (r) => (
        <TinySelect
          value={r.scheme}
          onChange={(e) => setSchemeById((m) => ({ ...m, [r.id]: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
        >
          <option value={SCHEME_OLD}>Old</option>
          <option value={SCHEME_NEW}>New</option>
        </TinySelect>
      ),
    },
    { key: "wef", label: "W.E.F.", render: (r) => fmtDate(r.wef) },
    { key: "oldGross", label: "Old Gross", cellClassName: "text-right tabular-nums", render: (r) => fmtMoney(r.oldGross) },
    { key: "oldCtc", label: "Old CTC", cellClassName: "text-right tabular-nums", render: (r) => fmtMoney(r.oldCtc) },
    { key: "newCtc", label: "New CTC", cellClassName: "text-right tabular-nums", render: (r) => fmtMoney(r.newCtc) },
    {
      key: "ctcDiff",
      label: "CTC diff.",
      cellClassName: "text-right tabular-nums",
      render: (r) => (r.ctcDiff == null ? "—" : `${r.ctcDiff >= 0 ? "+" : ""}${fmtMoney(r.ctcDiff)}`),
    },
    {
      key: "thDiff",
      label: "Take Home diff.",
      cellClassName: "text-right tabular-nums",
      render: (r) => (r.takeHomeDiff == null ? "—" : `${r.takeHomeDiff >= 0 ? "+" : ""}${fmtMoney(r.takeHomeDiff)}`),
    },
    {
      key: "validation",
      label: "Check",
      render: (r) =>
        r.validation ? (
          <span title={r.validation.message}>
            <StatusChip label={r.validation.label} severity={severityFor(r.validation.code)} />
          </span>
        ) : (
          <span className="text-critical text-[11px]">{r.calcError}</span>
        ),
    },
  ];

  return (
    <SectionCard
      title="Move existing employees to the new structure"
      right={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={downloadReport}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Reconciliation report
          </button>
          <button
            type="button"
            onClick={applySelected}
            disabled={applying || !selected.size}
            className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50"
          >
            {applying ? "Applying…" : `Apply to selected (${selected.size})`}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-ink-secondary">
          Each employee&apos;s current monthly Gross is rebuilt with the new rules. Status is Confirmed when the
          confirmation date has passed. Review the report with HR, then apply the approved rows — nothing changes
          until you apply.
        </p>
        <FilterBar>
          <label className="text-xs">
            <span className="block text-ink-muted mb-1">Cut-over date (blank = current W.E.F.)</span>
            <TinyInput type="date" value={cutOver} onChange={(e) => setCutOver(e?.target?.value || "")} />
          </label>
          <label className="text-xs">
            <span className="block text-ink-muted mb-1">Default scheme</span>
            <TinySelect value={defaultScheme} onChange={(e) => setDefaultScheme(e.target.value)}>
              <option value={SCHEME_OLD}>Old Scheme</option>
              <option value={SCHEME_NEW}>New Scheme</option>
            </TinySelect>
          </label>
          <button
            type="button"
            onClick={selectAllValid}
            className="h-8 px-3 rounded-lg border border-border bg-white text-xs"
          >
            Select all without errors
          </button>
          <span className="text-xs text-ink-muted self-center">{rows.length} employee(s) on the earlier structure</span>
        </FilterBar>
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        {loading ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : (
          <DenseTable columns={columns} rows={rows} showSerialNumber stickyHeader />
        )}
      </div>
    </SectionCard>
  );
}
