import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Search, Trash2, User } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import {
  PageTaskHeader,
  SectionCard,
  StatusChip,
  Modal,
  CollapsibleHelp,
} from "../components/AdminUi";
import {
  collectPersonComponentsDirectory,
  evalComponentFormula,
  flattenComponentTree,
  getDefaultCtcComponents,
  hydratePersonComponents,
  loadPersonComponents,
  normalizeComponentCode,
  newComponentId,
  persistPersonComponents,
  suggestComponentCode,
  validateComponentFormula,
} from "./salaryComponentsCatalog";

const inputCls =
  "h-8 w-full border border-slate-200 rounded-md px-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent/30";
const btnGhost =
  "h-8 px-2.5 text-[11px] font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1";
const btnPrimary =
  "h-8 px-2.5 text-[11px] font-medium rounded-md bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1";

function blankForm(parentCode = "PART_A") {
  return {
    id: "",
    code: "",
    name: "",
    parent_code: parentCode || "PART_A",
    kind: "custom",
    formula: "BAS * 10%",
    formula_label: "",
    active: true,
    show_on_profile: true,
    sort_order: 55,
  };
}

const SAMPLE_VARS = {
  gross_monthly: 45000,
  basic_monthly: 22500,
  hra_monthly: 9000,
  special_allowance_monthly: 13500,
  emp_pf_monthly: 1800,
  pt_monthly: 200,
  emp_esic_monthly: 0,
  take_home_monthly: 43000,
  er_pf_monthly: 1950,
  er_esic_monthly: 0,
  gratuity_monthly: 1082,
  leave_encash_monthly: 0,
  mediclaim_monthly: 0,
  lic_monthly: 0,
  special_perf_bonus_monthly: 0,
  bonus_monthly: 0,
  total_b_monthly: 3032,
  ctc_monthly: 48032,
};

/**
 * Flow: 1) Pick employee → 2) Review default CTC codes → 3) Add components for that person only.
 */
export default function SalaryComponentsMaster() {
  const [searchParams] = useSearchParams();
  const defaults = useMemo(() => getDefaultCtcComponents(), []);
  const defaultTree = useMemo(() => flattenComponentTree(defaults), [defaults]);

  const [employees, setEmployees] = useState([]);
  const [empQ, setEmpQ] = useState("");
  const [personId, setPersonId] = useState(() => searchParams.get("employee") || searchParams.get("employeeId") || "");
  const [personComponents, setPersonComponents] = useState([]);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [allPersonRows, setAllPersonRows] = useState([]);
  const [allLoading, setAllLoading] = useState(false);
  const [directoryQ, setDirectoryQ] = useState("");

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => blankForm());
  const [editingId, setEditingId] = useState(null);

  const refreshAllPersonRows = useCallback(async (empList = employees) => {
    setAllLoading(true);
    try {
      const rows = await collectPersonComponentsDirectory(empList || []);
      setAllPersonRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.warn("Salary components: directory load failed", err);
      setAllPersonRows([]);
    } finally {
      setAllLoading(false);
    }
  }, [employees]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from(EMPLOYEE_MASTER_TABLE)
          .select("id, full_name, employee_code, designation, department")
          .eq("status", "Active")
          .order("employee_code", { ascending: true })
          .limit(800);
        if (!cancelled) setEmployees(data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once employees load (or change), build directory from DB + all CTC profile caches
  useEffect(() => {
    if (!employees.length) {
      refreshAllPersonRows([]);
      return;
    }
    refreshAllPersonRows(employees);
  }, [employees, refreshAllPersonRows]);

  useEffect(() => {
    const fromUrl = searchParams.get("employee") || searchParams.get("employeeId") || "";
    if (fromUrl && String(fromUrl) !== String(personId)) {
      setPersonId(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!personId) {
      setPersonComponents([]);
      return undefined;
    }
    setPersonComponents(loadPersonComponents(personId));
    setNotice("");
    setError("");
    (async () => {
      try {
        const rows = await hydratePersonComponents(personId);
        if (!cancelled) setPersonComponents(rows);
      } catch (err) {
        console.warn("Salary components hydrate failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const selectedEmp = useMemo(
    () => employees.find((e) => String(e.id) === String(personId)) || null,
    [employees, personId]
  );

  const filteredEmployees = useMemo(() => {
    const needle = empQ.trim().toLowerCase();
    const selected = personId
      ? employees.filter((e) => String(e.id) === String(personId))
      : [];
    if (needle.length < 2) return selected;
    const hits = employees.filter((e) => {
      const hay = `${e.employee_code || ""} ${e.full_name || ""} ${e.designation || ""} ${e.department || ""}`.toLowerCase();
      return hay.includes(needle);
    });
    return hits.slice(0, 40);
  }, [employees, empQ, personId]);

  const persistPerson = useCallback(
    async (next) => {
      if (!personId) return;
      try {
        const saved = await persistPersonComponents(personId, next);
        setPersonComponents(saved);
        setError("");
        refreshAllPersonRows(employees);
      } catch (err) {
        console.error("Salary components save failed", err);
        setError(err?.message || "Could not save components to the database.");
        setPersonComponents(Array.isArray(next) ? next : []);
        refreshAllPersonRows(employees);
      }
    },
    [personId, refreshAllPersonRows, employees]
  );

  const knownCodes = useMemo(() => {
    const codes = new Set(defaults.map((c) => c.code));
    for (const c of personComponents) codes.add(c.code);
    return [...codes];
  }, [defaults, personComponents]);

  const parentOptions = useMemo(() => {
    return [
      ...defaults.filter((c) => c.code === "PART_A" || c.code === "PART_B" || c.kind !== "group"),
      ...personComponents,
    ];
  }, [defaults, personComponents]);

  const personTree = useMemo(() => flattenComponentTree(personComponents), [personComponents]);

  const filteredDirectoryRows = useMemo(() => {
    const needle = directoryQ.trim().toLowerCase();
    if (!needle) return allPersonRows;
    return allPersonRows.filter((r) => {
      const hay = `${r.employee_code || ""} ${r.employee_name || ""} ${r.department || ""} ${r.code || ""} ${r.name || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [allPersonRows, directoryQ]);

  /** Group flat rows → { employee, components[] } for a clear directory. */
  const directoryGroups = useMemo(() => {
    const map = new Map();
    for (const row of filteredDirectoryRows) {
      const id = String(row.employee_master_id);
      if (!map.has(id)) {
        map.set(id, {
          employee_master_id: row.employee_master_id,
          employee_code: row.employee_code || "",
          employee_name: row.employee_name || "Employee",
          department: row.department || "",
          designation: row.designation || "",
          components: [],
        });
      }
      map.get(id).components.push(row);
    }
    return [...map.values()].sort((a, b) =>
      `${a.employee_name} ${a.employee_code}`.localeCompare(`${b.employee_name} ${b.employee_code}`)
    );
  }, [filteredDirectoryRows]);

  const openCreate = (parentCode = "PART_A") => {
    if (!personId) {
      setError("Select an employee first — new components are only for that person.");
      return;
    }
    setEditingId(null);
    const draft = blankForm(parentCode);
    draft.code = suggestComponentCode("New component", knownCodes);
    draft.sort_order =
      Math.max(
        0,
        ...personComponents.filter((c) => c.parent_code === parentCode).map((c) => c.sort_order || 0)
      ) + 5;
    setForm(draft);
    setModalOpen(true);
    setError("");
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      parent_code: row.parent_code || "PART_A",
      kind: row.kind || "custom",
      formula: row.formula || "",
      formula_label: row.formula_label || "",
      active: row.active !== false,
      show_on_profile: row.show_on_profile !== false,
      sort_order: row.sort_order || 0,
    });
    setModalOpen(true);
    setError("");
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!personId) {
      setError("Select an employee first.");
      return;
    }
    const code = normalizeComponentCode(form.code);
    const name = String(form.name || "").trim();
    if (!code) {
      setError("Enter a short code (e.g. CON for Conveyance).");
      return;
    }
    if (!name) {
      setError("Enter a component name.");
      return;
    }
    if (defaults.some((d) => d.code === code)) {
      setError(`${code} is a company default code. Choose another code for this person.`);
      return;
    }
    const clash = personComponents.find((c) => c.code === code && c.id !== editingId);
    if (clash) {
      setError(`This employee already has ${code}.`);
      return;
    }
    const formula = String(form.formula || "").trim();
    if (formula && !/^manual$/i.test(formula)) {
      const v = validateComponentFormula(formula, knownCodes.filter((c) => c !== code));
      if (!v.ok) {
        setError(v.error || "Invalid formula.");
        return;
      }
    }

    const now = new Date().toISOString();
    if (editingId) {
      await persistPerson(
        personComponents.map((c) =>
          c.id === editingId
            ? {
                ...c,
                code,
                name,
                parent_code: form.parent_code || "PART_A",
                kind: form.kind || "custom",
                formula: formula || "Manual",
                formula_label: form.formula_label || "",
                active: form.active !== false,
                show_on_profile: form.show_on_profile !== false,
                sort_order: Number(form.sort_order) || 0,
                updated_at: now,
              }
            : c
        )
      );
      setNotice(`Updated ${code} for this employee.`);
    } else {
      await persistPerson([
        ...personComponents,
        {
          id: newComponentId(),
          code,
          name,
          parent_code: form.parent_code || "PART_A",
          kind: form.kind || "custom",
          formula: formula || "Manual",
          formula_label: form.formula_label || "Person-specific",
          is_system: false,
          active: form.active !== false,
          show_on_profile: true,
          sort_order: Number(form.sort_order) || 55,
          employee_master_id: Number(personId) || personId,
          created_at: now,
          updated_at: now,
        },
      ]);
      setNotice(`${code} added for this employee — saved to database and shown on their CTC.`);
    }
    setModalOpen(false);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Remove ${row.code} from this employee’s CTC?`)) return;
    await persistPerson(personComponents.filter((c) => c.id !== row.id));
    setNotice(`Removed ${row.code} for this employee.`);
  };

  const step = !personId ? 1 : 2;

  return (
    <div className="space-y-3 max-w-5xl w-full mx-auto">
      <PageTaskHeader
        className="mb-0"
        title="Salary Components"
        subtitle="Company CTC defaults are fixed. Extra components are saved per employee in the database and appear on their CTC."
      />

      <SectionCard
        title="Employees with extra CTC components"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
        right={
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => refreshAllPersonRows(employees)}
            disabled={allLoading}
          >
            {allLoading ? "Loading…" : "Refresh"}
          </button>
        }
      >
        <p className="text-[11px] text-slate-600 mb-2">
          Shows every employee who has extras on their CTC profile (from the database and saved
          profiles). Click a row to manage that person.
        </p>
        <div className="relative mb-2 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="Search employee or component…"
            value={directoryQ}
            onChange={(e) => setDirectoryQ(e.target.value)}
          />
        </div>
        {allLoading && !directoryGroups.length ? (
          <p className="text-[11px] text-slate-500 py-2">Loading from employee CTC profiles…</p>
        ) : !directoryGroups.length ? (
          <p className="text-[11px] text-slate-500 py-2">
            No extras yet. Open an employee CTC profile, add components (or tick LTA / Food / VPI),
            then Save CTC — they will appear here.
          </p>
        ) : (
          <div className="overflow-auto max-h-80 rounded border border-slate-200">
            <table className="w-full text-[11px] min-w-[720px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2.5 py-2">Employee</th>
                  <th className="text-left px-2.5 py-2">Department</th>
                  <th className="text-left px-2.5 py-2">Components added</th>
                  <th className="text-right px-2.5 py-2 w-28">Open</th>
                </tr>
              </thead>
              <tbody>
                {directoryGroups.map((g) => (
                  <tr
                    key={String(g.employee_master_id)}
                    className="border-t border-slate-100 hover:bg-slate-50/80 align-top"
                  >
                    <td className="px-2.5 py-2">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => setPersonId(String(g.employee_master_id))}
                      >
                        <div className="font-semibold text-ink">
                          <span className="font-mono text-slate-500 mr-1.5">
                            {g.employee_code || "—"}
                          </span>
                          {g.employee_name}
                        </div>
                        {g.designation ? (
                          <div className="text-[10px] text-slate-500 mt-0.5">{g.designation}</div>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-2.5 py-2 text-slate-500">{g.department || "—"}</td>
                    <td className="px-2.5 py-2">
                      <ul className="space-y-1">
                        {g.components.map((c) => (
                          <li key={`${c.code}-${c.id}`} className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-mono font-semibold text-ink">{c.code}</span>
                            <span className="text-ink">{c.name}</span>
                            <span className="text-[10px] text-slate-400">
                              {c.parent_code === "PART_B" ? "Part B" : "Part A"}
                            </span>
                            {c.amount_monthly != null ? (
                              <span className="tabular-nums text-slate-600">
                                ₹{Number(c.amount_monthly).toLocaleString("en-IN")}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-2.5 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="text-accent hover:underline mr-2"
                        onClick={() => setPersonId(String(g.employee_master_id))}
                      >
                        Manage
                      </button>
                      <Link
                        to={`/app/admin/employee/master/${g.employee_master_id}?tab=ctc`}
                        className="text-accent hover:underline inline-flex items-center gap-0.5"
                      >
                        CTC
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {directoryGroups.length ? (
          <p className="text-[10px] text-slate-400 mt-2">
            {directoryGroups.length} employee{directoryGroups.length === 1 ? "" : "s"} ·{" "}
            {filteredDirectoryRows.length} component
            {filteredDirectoryRows.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </SectionCard>

      {/* Flow steps */}
      <ol className="flex flex-wrap gap-2 text-[11px]">
        <li
          className={`rounded-full px-3 py-1 border ${
            step === 1 ? "bg-accent text-white border-accent" : "bg-white text-slate-600 border-slate-200"
          }`}
        >
          1 · Select employee
        </li>
        <li
          className={`rounded-full px-3 py-1 border ${
            step >= 2 ? "bg-accent text-white border-accent" : "bg-slate-50 text-slate-400 border-slate-200"
          }`}
        >
          2 · Review defaults
        </li>
        <li
          className={`rounded-full px-3 py-1 border ${
            step >= 2 ? "bg-accent text-white border-accent" : "bg-slate-50 text-slate-400 border-slate-200"
          }`}
        >
          3 · Add for this person
        </li>
      </ol>

      <CollapsibleHelp label="how this works">
        <ol className="list-decimal pl-4 space-y-1">
          <li>Pick an employee (search by code or name).</li>
          <li>Defaults (BAS, HRA, SPA…) are company-wide — view only.</li>
          <li>
            Add extras for <strong>this person only</strong> (e.g. CON = BAS × 10%). They appear on that
            employee’s CTC profile, not everyone’s.
          </li>
        </ol>
      </CollapsibleHelp>

      {error ? (
        <p className="text-xs text-red-600 rounded border border-red-100 bg-red-50 px-2.5 py-1.5">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-xs text-emerald-800 rounded border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
          {notice}
        </p>
      ) : null}

      {/* Step 1 */}
      <SectionCard
        title="1 · Select employee"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
        right={
          selectedEmp ? (
            <StatusChip
              label={selectedEmp.employee_code || String(selectedEmp.id)}
              severity="info"
            />
          ) : null
        }
      >
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            className={`${inputCls} pl-7`}
            placeholder="Search employee code or name…"
            value={empQ}
            onChange={(e) => setEmpQ(e.target.value)}
          />
        </div>
        <div className="max-h-48 overflow-auto rounded border border-slate-200 divide-y divide-slate-100">
          {filteredEmployees.map((emp) => {
            const active = String(emp.id) === String(personId);
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => setPersonId(String(emp.id))}
                className={`w-full text-left px-2.5 py-2 text-[11px] flex items-start gap-2 hover:bg-slate-50 ${
                  active ? "bg-emerald-50/80" : "bg-white"
                }`}
              >
                <User className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${active ? "text-emerald-700" : "text-slate-400"}`} />
                <span className="min-w-0">
                  <span className="font-medium text-slate-900 block truncate">
                    <span className="font-mono mr-1.5">{emp.employee_code || emp.id}</span>
                    {emp.full_name || "—"}
                  </span>
                  <span className="text-slate-500 truncate block">
                    {[emp.designation, emp.department].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
              </button>
            );
          })}
          {!filteredEmployees.length ? (
            <p className="text-center text-xs text-slate-500 py-6">
              {empQ.trim().length < 2
                ? "Type at least 2 characters of a code or name. This list is Employee Master, not sample data."
                : "No employees match."}
            </p>
          ) : null}
        </div>
      </SectionCard>

      {!personId ? (
        <p className="text-xs text-slate-500 text-center py-4 rounded border border-dashed border-slate-200 bg-slate-50">
          Select an employee above to manage their salary components.
        </p>
      ) : (
        <>
          {/* Step 2 — defaults reference */}
          <SectionCard
            title="2 · Company CTC defaults (all employees)"
            className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
            right={
              <button
                type="button"
                className="text-[11px] text-accent hover:underline"
                onClick={() => setDefaultsOpen((v) => !v)}
              >
                {defaultsOpen ? "Hide" : "Show codes & formulas"}
              </button>
            }
          >
            <p className="text-[11px] text-slate-600 mb-2">
              These apply to everyone (BAS = Basic, HRA, SPA…). You cannot delete them here. Use step 3
              to add extras for{" "}
              <span className="font-medium text-slate-900">{selectedEmp?.full_name || "this employee"}</span>{" "}
              only.
            </p>
            {defaultsOpen ? (
              <div className="overflow-auto max-h-56 rounded border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="text-left px-2 py-1.5">Code</th>
                      <th className="text-left px-2 py-1.5">Name</th>
                      <th className="text-left px-2 py-1.5">Formula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defaultTree
                      .filter((r) => r.kind !== "group")
                      .map((row) => (
                        <tr key={row.code} className="border-t border-slate-100">
                          <td className="px-2 py-1 font-mono font-semibold">{row.code}</td>
                          <td className="px-2 py-1">{row.name}</td>
                          <td className="px-2 py-1 font-mono text-slate-600 truncate max-w-[18rem]">
                            {row.formula || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </SectionCard>

          {/* Step 3 — person components */}
          <SectionCard
            title={`3 · Components for ${selectedEmp?.full_name || "employee"}`}
            className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-2.5"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/app/admin/employee/master/${personId}?tab=ctc`}
                  className="text-[11px] text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  Open CTC profile
                  <ArrowRight className="h-3 w-3" />
                </Link>
                <button type="button" className={btnPrimary} onClick={() => openCreate("PART_A")}>
                  <Plus className="h-3.5 w-3.5" />
                  Add for this person
                </button>
              </div>
            }
          >
            <p className="text-[11px] text-slate-600 mb-2">
              Nest under PART_A (earnings/deductions) or PART_B (employer). Codes must be unique for this
              employee. Formula example: <span className="font-mono">BAS * 10%</span> or{" "}
              <span className="font-mono">Manual</span>.
            </p>

            {!personTree.length ? (
              <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center">
                <p className="text-xs text-slate-600 mb-3">
                  No person-specific components yet. Defaults still apply on their CTC.
                </p>
                <button type="button" className={btnPrimary} onClick={() => openCreate("PART_A")}>
                  <Plus className="h-3.5 w-3.5" />
                  Add first component
                </button>
              </div>
            ) : (
              <div className="overflow-auto max-h-[min(24rem,50vh)] rounded border border-slate-200">
                <table className="w-full text-[11px] min-w-[640px]">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-2 py-2">Code</th>
                      <th className="text-left px-2 py-2">Name</th>
                      <th className="text-left px-2 py-2">Under</th>
                      <th className="text-left px-2 py-2">Formula</th>
                      <th className="text-right px-2 py-2">Sample ₹</th>
                      <th className="text-right px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personTree.map((row) => {
                      let sample = null;
                      try {
                        sample = evalComponentFormula(row.formula, SAMPLE_VARS);
                      } catch {
                        sample = null;
                      }
                      return (
                        <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-2 py-1.5 font-mono font-semibold">
                            <span style={{ paddingLeft: `${(Number(row.depth) || 0) * 12}px` }}>
                              {row.code}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">{row.name}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-500">{row.parent_code || "—"}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-600 truncate max-w-[12rem]" title={row.formula}>
                            {row.formula || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {sample == null ? "—" : Number(sample).toLocaleString("en-IN")}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="text-accent hover:underline mr-2"
                              onClick={() => openEdit(row)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-slate-600 hover:underline mr-2"
                              onClick={() => openCreate(row.code)}
                            >
                              + Child
                            </button>
                            <button
                              type="button"
                              className="text-red-600 hover:underline inline-flex items-center gap-0.5"
                              onClick={() => handleDelete(row)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <Modal
        open={modalOpen}
        title={editingId ? "Edit person component" : "Add for this employee"}
        onClose={() => setModalOpen(false)}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="person-comp-form" className={btnPrimary}>
              Save for this person
            </button>
          </div>
        }
      >
        <form id="person-comp-form" className="space-y-3" onSubmit={handleSaveForm}>
          <p className="text-[11px] text-slate-600 rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5">
            Applies only to{" "}
            <span className="font-medium text-slate-900">
              {selectedEmp?.full_name || "selected employee"}
            </span>
            . Other employees are unchanged.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] uppercase text-slate-500 space-y-0.5">
              <span className="block">Code</span>
              <input
                className={`${inputCls} font-mono`}
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: normalizeComponentCode(e.target.value) }))
                }
                placeholder="CON"
              />
            </label>
            <label className="text-[10px] uppercase text-slate-500 space-y-0.5">
              <span className="block">Under parent</span>
              <select
                className={inputCls}
                value={form.parent_code || "PART_A"}
                onChange={(e) => setForm((f) => ({ ...f, parent_code: e.target.value }))}
              >
                {parentOptions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Name</span>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Conveyance"
            />
          </label>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Formula</span>
            <input
              className={`${inputCls} font-mono`}
              value={form.formula}
              onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))}
              placeholder="BAS * 10%"
            />
            <span className="text-[10px] normal-case text-slate-400 mt-0.5 block">
              Use default codes (BAS, HRA, GROSS…) or Manual for a typed amount on the profile.
            </span>
          </label>
          <label className="text-[10px] uppercase text-slate-500 space-y-0.5 block">
            <span className="block">Hint on profile</span>
            <input
              className={inputCls}
              value={form.formula_label}
              onChange={(e) => setForm((f) => ({ ...f, formula_label: e.target.value }))}
              placeholder="Optional note"
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
