import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import toast from "../../../lib/toast";
import { DenseTable, FilterBar, InlineAlert, SectionCard, StatusChip, TinyInput } from "../components/AdminUi";
import { calculateCtc, roundRupee, schemeLabel } from "./ctcEngine";
import { resolveRuleVersion } from "./payrollRulesDb";
import { dbFetchSalaryStructureMap, dbReviseSalaryStructure } from "./salaryDb";
import { isAnnexureRecord, resultToStructurePayload, skillLabel, statusLabel } from "./annexureCtcRecord";

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

function toDay(d) {
  const s = String(d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function signed(v) {
  if (v == null) return "—";
  const r = roundRupee(v);
  return `${r > 0 ? "+" : ""}${fmtMoney(r)}`;
}

function OldNew({ before, after }) {
  const changed = roundRupee(before) !== roundRupee(after);
  return (
    <span className="tabular-nums">
      {fmtMoney(before)}
      {changed ? <span className="text-ink-muted"> → </span> : null}
      {changed ? <span className="font-medium text-ink">{fmtMoney(after)}</span> : null}
    </span>
  );
}

function latestEffectiveFrom(versions) {
  return (versions || []).reduce((max, v) => {
    const d = toDay(v.effective_from);
    return d > max ? d : max;
  }, "");
}

/**
 * Employees already on the Compensation Scheme whose CTC was worked out on an earlier rule
 * version (e.g. before a minimum wage revision). Gross, skill, status and scheme stay the same;
 * Part A is rebuilt with the rules in force from the chosen date. Nothing changes until applied.
 */
export default function CtcRuleUpdatePanel({ ruleVersions }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState(new Map());
  const [asOf, setAsOf] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!asOf && ruleVersions?.length) setAsOf(latestEffectiveFrom(ruleVersions));
  }, [ruleVersions, asOf]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [map, empRes] = await Promise.all([
        dbFetchSalaryStructureMap({ withRevisions: false }),
        supabase
          .from("admin_ifsp_employee_master")
          .select("id, employee_id, employee_code, full_name, status, date_of_birth, date_of_joining")
          .order("employee_id", { ascending: true }),
      ]);
      if (empRes.error) throw empRes.error;
      setStructures(map);
      setEmployees((empRes.data || []).filter((e) => (e.status || "Active") === "Active"));
      setSelected(new Set());
    } catch (err) {
      console.error("CTC rule update: load failed", err);
      setError("Could not load employees and current salaries. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const day = toDay(asOf);
    if (!day) return [];
    const out = [];
    for (const emp of employees) {
      const s = structures.get(String(emp.id));
      if (!s?.declared || !isAnnexureRecord(s)) continue;
      const recordWef = toDay(s.wef_date);
      const wef = recordWef > day ? recordWef : day;
      const version = resolveRuleVersion(ruleVersions, s.salary_scheme, wef);
      if (!version || version.beforeFirstVersion || version.id === s.rule_version_id) continue;

      const gross = Number(s.gross_monthly) || 0;
      let result = null;
      let note = "";
      if (s.is_custom) note = "Custom values — revise on the employee's CTC tab.";
      else if (gross <= 0) note = "No Gross on current CTC.";
      else {
        try {
          result = calculateCtc(version.rules, {
            skill: s.skill_category,
            status: s.employee_status,
            monthlyGross: gross,
          });
        } catch (err) {
          note = err?.message || "Could not calculate.";
        }
      }
      out.push({
        id: emp.id,
        emp,
        structure: s,
        wef,
        version,
        result,
        note,
        gross,
        canApply: Boolean(result && !result.validation.blocksSave),
      });
    }
    return out;
  }, [employees, structures, asOf, ruleVersions]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllValid = () => setSelected(new Set(rows.filter((r) => r.canApply).map((r) => r.id)));

  const applySelected = async () => {
    const picked = rows.filter((r) => selected.has(r.id) && r.canApply);
    if (!picked.length) {
      toast.warning("Nothing selected", "Select employees without errors first.");
      return;
    }
    if (
      !window.confirm(
        `Update the salary breakup for ${picked.length} employee(s) with the current payroll rules? Gross stays the same; the current CTC moves to history.`
      )
    ) {
      return;
    }
    setApplying(true);
    let ok = 0;
    const failed = [];
    for (const r of picked) {
      try {
        const s = r.structure;
        const payload = resultToStructurePayload(r.result, {
          rules: r.version.rules,
          ruleVersionId: r.version.id,
          scheme: s.salary_scheme,
          category: s.employee_category,
          revisionType: "correction",
          wefDate: r.wef,
          reason: `Payroll rules updated from ${fmtDate(r.version.effective_from)} (Gross retained)`,
          employee: r.emp,
        });
        await dbReviseSalaryStructure(r.id, payload, { wef_date: r.wef, reason: payload.revision_reason });
        ok += 1;
      } catch (err) {
        console.error("CTC rule update: apply failed", r.id, err);
        failed.push(r.emp.employee_code || r.emp.full_name || r.id);
      }
    }
    setApplying(false);
    if (ok) toast.success("Salary breakup updated", `${ok} employee(s) updated with Gross retained.`);
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
    {
      key: "profile",
      label: "Status / Skill / Scheme",
      render: (r) =>
        `${statusLabel(r.structure.employee_status)} · ${skillLabel(r.structure.skill_category)} · ${schemeLabel(
          r.structure.salary_scheme
        )}`,
    },
    { key: "wef", label: "W.E.F.", render: (r) => fmtDate(r.wef) },
    { key: "gross", label: "Gross (kept)", cellClassName: "text-right tabular-nums", render: (r) => fmtMoney(r.gross) },
    {
      key: "basic",
      label: "Basic",
      cellClassName: "text-right",
      render: (r) => (r.result ? <OldNew before={r.structure.basic_monthly} after={r.result.basic} /> : "—"),
    },
    {
      key: "medical",
      label: "Medical",
      cellClassName: "text-right",
      render: (r) =>
        r.result ? <OldNew before={r.structure.medical_allowance_monthly} after={r.result.medical} /> : "—",
    },
    {
      key: "conveyance",
      label: "Conveyance",
      cellClassName: "text-right",
      render: (r) => (r.result ? <OldNew before={r.structure.conveyance_monthly} after={r.result.conveyance} /> : "—"),
    },
    {
      key: "th",
      label: "Take Home diff.",
      cellClassName: "text-right tabular-nums",
      render: (r) => (r.result ? signed(r.result.take_home - (Number(r.structure.take_home_monthly) || 0)) : "—"),
    },
    {
      key: "ctc",
      label: "CTC diff.",
      cellClassName: "text-right tabular-nums",
      render: (r) => (r.result ? signed(r.result.ctc - (Number(r.structure.ctc_monthly) || 0)) : "—"),
    },
    {
      key: "check",
      label: "Check",
      render: (r) =>
        r.result ? (
          <span title={r.result.validation.message}>
            <StatusChip
              label={r.result.validation.label}
              severity={r.result.validation.level === "error" ? "critical" : "info"}
            />
          </span>
        ) : (
          <span className="text-[11px] text-ink-muted">{r.note}</span>
        ),
    },
  ];

  return (
    <SectionCard
      title="Apply updated payroll rules (Gross retained)"
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
          For employees already on the new structure whose breakup was worked out on earlier rules (for example
          before a minimum wage change). Gross stays the same; Basic, HRA and Advance Bonus follow the new rules and
          Medical / Conveyance absorb the difference. Nothing changes until you apply.
        </p>
        <FilterBar>
          <label className="text-xs">
            <span className="block text-ink-muted mb-1">Apply from</span>
            <TinyInput type="date" value={asOf} onChange={(e) => setAsOf(e?.target?.value || "")} />
          </label>
          <button
            type="button"
            onClick={selectAllValid}
            className="h-8 px-3 rounded-lg border border-border bg-white text-xs"
          >
            Select all without errors
          </button>
          <span className="text-xs text-ink-muted self-center">{rows.length} employee(s) to review</span>
        </FilterBar>
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        {loading ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : rows.length ? (
          <DenseTable columns={columns} rows={rows} showSerialNumber stickyHeader />
        ) : (
          <p className="text-xs text-ink-muted">Every employee on the new structure already uses the rules in force.</p>
        )}
      </div>
    </SectionCard>
  );
}
