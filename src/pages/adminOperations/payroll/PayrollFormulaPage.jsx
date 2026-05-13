import React, { useMemo, useState, useCallback } from "react";
import { SectionCard, Badge } from "../components/AdminUi";
import {
  PAYROLL_ENTRY_COLUMNS,
  PAYROLL_ATTENDANCE_FORMULA_DOCS,
  getEntryFormulaExcelSample,
  ENTRY_ALLOWANCE_FORMULA_KEYS,
} from "./attendanceSheetExcel";
import {
  loadPayrollPackages,
  savePayrollPackages,
  PAYROLL_PACKAGE_TOGGLE_KEYS,
  PAYROLL_FORMULA_LABEL_BY_KEY,
  resolvePayrollPackageColumnKeys,
} from "./payrollPackages";

function newPackageId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pkg-${Date.now()}`;
}

const TOGGLE_GROUPS = [
  {
    title: "Wages (editable)",
    keys: PAYROLL_PACKAGE_TOGGLE_KEYS.filter((k) => ["grossWages", "pfBasic", "basic"].includes(k)),
  },
  {
    title: "Earned — prorated by P. Days",
    keys: PAYROLL_PACKAGE_TOGGLE_KEYS.filter(
      (k) => k === "pfBasicEarned" || k === "basicEarned" || ENTRY_ALLOWANCE_FORMULA_KEYS.has(k)
    ),
  },
  {
    title: "Summary & deductions",
    keys: PAYROLL_PACKAGE_TOGGLE_KEYS.filter((k) =>
      ["grossWagesEarned", "pfAmount", "esic", "professionalTax", "loan", "salaryAdvance", "held", "totalDeduction", "netSalary", "bank", "paid", "diff", "remarks"].includes(k)
    ),
  },
];

export default function PayrollFormulaPage() {
  const [packagesState, setPackagesState] = useState(() => loadPayrollPackages());
  const [activeId, setActiveId] = useState(() => packagesState.packages[0]?.id || "");
  const [draftName, setDraftName] = useState("");
  const [draftKeys, setDraftKeys] = useState(() => new Set(PAYROLL_PACKAGE_TOGGLE_KEYS));

  const activePackage = useMemo(
    () => packagesState.packages.find((p) => p.id === activeId) || packagesState.packages[0],
    [packagesState.packages, activeId]
  );

  React.useEffect(() => {
    if (!activePackage) return;
    setDraftName(activePackage.name);
    setDraftKeys(new Set(activePackage.selectedKeys?.length ? activePackage.selectedKeys : PAYROLL_PACKAGE_TOGGLE_KEYS));
  }, [activePackage?.id, activePackage?.name, activePackage?.selectedKeys]);

  const resolvedPreview = useMemo(() => resolvePayrollPackageColumnKeys(Array.from(draftKeys)), [draftKeys]);

  const persist = useCallback((next) => {
    setPackagesState(next);
    savePayrollPackages(next);
  }, []);

  const toggleKey = (key) => {
    setDraftKeys((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const selectAllToggles = () => setDraftKeys(new Set(PAYROLL_PACKAGE_TOGGLE_KEYS));
  const clearToggles = () => setDraftKeys(new Set());

  const saveActivePackage = () => {
    const keys = Array.from(draftKeys);
    persist({
      packages: packagesState.packages.map((p) =>
        p.id === activePackage.id ? { ...p, name: draftName.trim() || p.name, selectedKeys: keys } : p
      ),
    });
  };

  const createPackage = () => {
    const id = newPackageId();
    const p = { id, name: "New package", selectedKeys: [...PAYROLL_PACKAGE_TOGGLE_KEYS] };
    persist({ packages: [...packagesState.packages, p] });
    setActiveId(id);
  };

  const deleteActivePackage = () => {
    if (packagesState.packages.length <= 1) return;
    const next = packagesState.packages.filter((p) => p.id !== activePackage.id);
    persist({ packages: next });
    setActiveId(next[0].id);
  };

  const formulaColumns = useMemo(() => PAYROLL_ENTRY_COLUMNS.filter((c) => c.source === "formula"), []);

  return (
    <div className="space-y-4 max-w-5xl">
      <p className="text-xs text-gray-600">
        Define <strong>packages</strong> of salary columns and formulas. On the{" "}
        <strong>Entry sheet</strong> tab, pick a package to show only those columns and to export Excel with matching formulas. Master
        columns and <strong>P. Days</strong> are always included.
      </p>

      <SectionCard
        title="Formula packages"
        right={<Badge tone="bg-violet-50 text-violet-900 border border-violet-100">Stored in this browser</Badge>}
      >
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1 text-[11px] text-gray-600 min-w-[200px]">
            Package to edit
            <select
              value={activePackage?.id || ""}
              onChange={(e) => setActiveId(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
            >
              {packagesState.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={createPackage}
            className="h-9 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium"
          >
            New package
          </button>
          <button
            type="button"
            onClick={deleteActivePackage}
            disabled={packagesState.packages.length <= 1}
            className="h-9 px-3 rounded-lg border border-red-200 text-red-700 text-xs font-medium disabled:opacity-40"
          >
            Delete package
          </button>
        </div>

        <label className="block text-[11px] font-medium text-gray-700 mb-1">Package name</label>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          className="w-full max-w-md h-9 rounded-lg border border-gray-300 px-2 text-sm mb-4"
        />

        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={selectAllToggles} className="text-xs text-blue-700 underline">
            Select all optional columns
          </button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={clearToggles} className="text-xs text-blue-700 underline">
            Clear optional columns
          </button>
        </div>

        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          {TOGGLE_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold text-gray-800 mb-2">{group.title}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {group.keys.map((key) => {
                  const col = PAYROLL_ENTRY_COLUMNS.find((c) => c.key === key);
                  const label = col?.header || key;
                  const hint = PAYROLL_FORMULA_LABEL_BY_KEY[key] || "";
                  return (
                    <label
                      key={key}
                      className="flex items-start gap-2 rounded-md border border-white bg-white px-2.5 py-2 shadow-sm cursor-pointer hover:border-blue-200"
                    >
                      <input
                        type="checkbox"
                        checked={draftKeys.has(key)}
                        onChange={() => toggleKey(key)}
                        className="mt-0.5 rounded border-gray-300 text-[#1F3A8A]"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-gray-900">{label}</span>
                        {hint ? <span className="block text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-600">
            Resolved column count: <strong>{resolvedPreview.length}</strong> (includes auto-added prerequisites).
          </p>
          <button type="button" onClick={saveActivePackage} className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
            Save package
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Attendance register — summary columns">
        <p className="text-xs text-gray-600 mb-3">
          After the day band, each row gets these formulas. Day column letters depend on month length.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2 font-semibold border-b border-gray-200">Column</th>
                <th className="text-left px-3 py-2 font-semibold border-b border-gray-200">Meaning</th>
                <th className="text-left px-3 py-2 font-semibold border-b border-gray-200">Excel pattern</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {PAYROLL_ATTENDANCE_FORMULA_DOCS.map((row) => (
                <tr key={row.header}>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.header}</td>
                  <td className="px-3 py-2 text-gray-600">{row.description}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-purple-900 whitespace-pre-wrap break-all">{row.excelPattern}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Entry sheet — formula columns (full layout reference)">
        <p className="text-xs text-gray-600 mb-3">
          Proration uses <span className="font-mono">DAY(EOMONTH(DATE(year,month,1),0))</span> in exported Excel. Samples use January 2026.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2 font-semibold border-b border-gray-200">Column</th>
                <th className="text-left px-3 py-2 font-semibold border-b border-gray-200">Type</th>
                <th className="text-left px-3 py-2 font-semibold border-b border-gray-200">Sample formula (row 5)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {formulaColumns.map((col) => {
                const sample = getEntryFormulaExcelSample(col.key, 5, 2026, 1);
                const isAllowance = ENTRY_ALLOWANCE_FORMULA_KEYS.has(col.key);
                return (
                  <tr key={col.key}>
                    <td className="px-3 py-2 font-medium text-gray-900">{col.header}</td>
                    <td className="px-3 py-2">
                      {isAllowance ? (
                        <Badge tone="bg-emerald-50 text-emerald-800 border border-emerald-100">Proration</Badge>
                      ) : (
                        <Badge tone="bg-purple-50 text-purple-800 border border-purple-100">Derived</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-purple-900 break-all">{sample || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
