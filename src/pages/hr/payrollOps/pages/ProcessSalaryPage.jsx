import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRightLeft,
  Columns3,
  Download,
  FileWarning,
  FolderPlus,
  IndianRupee,
  Landmark,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Drawer, Modal, SectionCard } from "../../../adminOperations/components/AdminUi";
import { EMP_EXTRAS, inr, shortSiteName } from "../payrollOpsData";
import { usePayrollOps } from "../payrollOpsScope";
import { CycleSelector, PayrollStatusChip } from "../PayrollOpsUi";

const MAIN_EXPORT_FIELDS = [
  { key: "code", label: "Emp Code" },
  { key: "name", label: "Name" },
  { key: "desig", label: "Designation" },
  { key: "workingDays", label: "Working Days" },
  { key: "salaryRate", label: "Salary Rate" },
  { key: "pDays", label: "P.Days" },
  { key: "wOffOt", label: "OT" },
  { key: "earnedBasic", label: "Earned Basic" },
  { key: "hra", label: "HRA @40%" },
  { key: "leave", label: "Leave Salary @5%" },
  { key: "other", label: "Other Allow." },
  { key: "gross", label: "Gross Salary" },
  { key: "pf", label: "PF" },
  { key: "esi", label: "ESI" },
  { key: "ptax", label: "P.Tax" },
  { key: "loan", label: "Loan" },
  { key: "lwf", label: "LWF" },
  { key: "canteen", label: "Canteen" },
  { key: "held", label: "Held" },
  { key: "totalDed", label: "Total Ded." },
  { key: "net", label: "Net Payable" },
];

function EditableCell({ value, onChange }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-[11px] tabular-nums outline-none focus:border-accent"
    />
  );
}

export default function PayrollOpsProcessSalaryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    sites,
    setSites,
    employeesBySite,
    setEmployeesBySite,
    extraSheets,
    setExtraSheets,
    processingSiteId,
    setProcessingSiteId,
    batchSiteIds,
    month,
    year,
    attendanceSyncedAt,
  } = usePayrollOps();

  const paramSite = searchParams.get("site");
  const siteId = paramSite && sites.some((s) => s.id === paramSite) ? paramSite : processingSiteId;
  const site = sites.find((s) => s.id === siteId) || sites[0];

  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState("main");
  const [sheetModal, setSheetModal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [status, setStatus] = useState(site?.status || "pending");
  const [customColumns, setCustomColumns] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(attendanceSyncedAt);
  const [openEmp, setOpenEmp] = useState(null);
  const [exportFields, setExportFields] = useState(MAIN_EXPORT_FIELDS.map((f) => f.key));
  const [exportSheets, setExportSheetsOn] = useState(true);

  useEffect(() => {
    if (site) {
      setStatus(site.status);
      setActiveTab("main");
      setProcessingSiteId(site.id);
    }
  }, [siteId, site, setProcessingSiteId]);

  const employees = employeesBySite[siteId] || [];
  const sheets = extraSheets[siteId] || [];
  const totalNet = employees.reduce((a, e) => a + e.net, 0);

  const setEmployees = (updater) =>
    setEmployeesBySite((cur) => ({
      ...cur,
      [siteId]: typeof updater === "function" ? updater(cur[siteId] || []) : updater,
    }));

  const update = (idx, field, val) => {
    setEmployees((cur) => {
      const next = [...cur];
      const emp = { ...next[idx], [field]: val };
      emp.totalDed = +(emp.pf + emp.esi + emp.ptax + emp.loan + emp.lwf + emp.canteen + emp.held).toFixed(2);
      emp.net = +(emp.gross - emp.totalDed).toFixed(2);
      next[idx] = emp;
      return next;
    });
  };

  const totals = useMemo(() => {
    const t = { gross: 0, pf: 0, esi: 0, ptax: 0, loan: 0, lwf: 0, canteen: 0, held: 0, totalDed: 0, net: 0 };
    employees.forEach((e) => {
      t.gross += e.gross;
      t.pf += e.pf;
      t.esi += e.esi;
      t.ptax += e.ptax;
      t.loan += e.loan;
      t.lwf += e.lwf;
      t.canteen += e.canteen;
      t.held += e.held;
      t.totalDed += e.totalDed;
      t.net += e.net;
    });
    return t;
  }, [employees]);

  const changeSite = (id) => {
    setProcessingSiteId(id);
    setSearchParams({ site: id });
  };

  const applyStatus = (next) => {
    setStatus(next);
    setSites((cur) => cur.map((s) => (s.id === siteId ? { ...s, status: next } : s)));
  };

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const activeFields = MAIN_EXPORT_FIELDS.filter((f) => exportFields.includes(f.key));
    const mainData = employees.map((e) => {
      const row = {};
      activeFields.forEach((f) => { row[f.label] = e[f.key]; });
      customColumns.forEach((c) => {
        if (exportFields.includes(`custom:${c.key}`)) row[c.label] = e.custom?.[c.key] ?? "";
      });
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainData), `${month.slice(0, 3)} ${year}`.slice(0, 31));
    if (exportSheets) {
      sheets.forEach((s) => {
        const data = s.rows.map((r) => Object.fromEntries(s.columns.map((c) => [c.label, r[c.key]])));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), s.name.slice(0, 31));
      });
    }
    XLSX.writeFile(wb, `${shortSiteName(site).replace(/\s+/g, "_")}_Salary_${month}_${year}.xlsx`);
    setExportOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={siteId}
              onChange={(e) => changeSite(e.target.value)}
              className="bg-transparent text-base font-semibold text-ink outline-none"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <PayrollStatusChip status={status} />
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">OC No. {site?.ocNo} · {site?.client} · {site?.location}</p>
        </div>
        <CycleSelector showPayDate payDate={payDate} setPayDate={setPayDate} />
      </div>

      {batchSiteIds.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info-border bg-info-soft px-3 py-2">
          <span className="text-[11px] font-semibold text-info">Queued for this run</span>
          {batchSiteIds.map((id) => {
            const s = sites.find((x) => x.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => changeSite(id)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  id === siteId ? "border-info bg-info text-white" : "border-info-border bg-white text-info"
                }`}
              >
                {shortSiteName(s)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2">
          <IndianRupee className="h-4 w-4 text-success" />
          <div>
            <p className="type-mono-caption">Net payable this cycle</p>
            <p className="text-sm font-bold tabular-nums text-ink">{inr(totalNet)}</p>
          </div>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => setExportOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold">
          <Columns3 className="h-3.5 w-3.5" /> Export
        </button>
        <button
          type="button"
          onClick={() => applyStatus(status === "held" ? "in-progress" : "held")}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold"
        >
          {status === "held" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {status === "held" ? "Release hold" : "Hold salary"}
        </button>
        <button type="button" onClick={() => applyStatus("processed")} className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-white">
          <Save className="h-3.5 w-3.5" /> Process & disburse
        </button>
      </div>

      <SectionCard
        title="Salary sheet"
        right={
          <button
            type="button"
            disabled={syncing}
            onClick={() => {
              setSyncing(true);
              setTimeout(() => {
                setLastSynced(new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
                setSyncing(false);
              }, 600);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : `Re-sync · ${lastSynced}`}
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("main")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${activeTab === "main" ? "bg-accent text-white" : "bg-surface-sunken text-ink"}`}
          >
            Main salary sheet
          </button>
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveTab(i)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${activeTab === i ? "bg-accent text-white" : "bg-surface-sunken text-ink"}`}
            >
              {s.name}
            </button>
          ))}
          <button type="button" onClick={() => setSheetModal(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-[11px] font-semibold text-ink-secondary">
            <Plus className="h-3 w-3" /> Add sheet
          </button>
        </div>

        {activeTab === "main" ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-max min-w-full text-[11px]">
              <thead className="bg-surface-sunken text-ink-muted">
                <tr>
                  {["Emp Code", "Name", "Desig", "WD", "Rate", "P.Days", "OT", "Basic", "HRA", "Leave", "Other", "Gross", "PF", "ESI", "P.Tax", "Loan", "LWF", "Canteen", "Held", "Ded.", ...customColumns.map((c) => c.label), "Net"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 text-right font-semibold first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {employees.map((e, idx) => (
                  <tr key={e.code} className="hover:bg-surface-sunken">
                    <td className="px-2 py-1.5 text-right tabular-nums">{e.code}</td>
                    <td className="px-2 py-1.5 text-left">
                      <button type="button" onClick={() => setOpenEmp(e)} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                        {e.name}
                        {e.transferred ? <ArrowRightLeft className="h-3 w-3" /> : null}
                        {e.dualDesignation ? <AlertTriangle className="h-3 w-3 text-warning" /> : null}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink-muted">{e.desig}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{e.workingDays}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(e.salaryRate)}</td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.pDays} onChange={(v) => update(idx, "pDays", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.wOffOt} onChange={(v) => update(idx, "wOffOt", v)} /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(e.earnedBasic)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(e.hra)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(e.leave)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(e.other)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{inr(e.gross)}</td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.pf} onChange={(v) => update(idx, "pf", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.esi} onChange={(v) => update(idx, "esi", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.ptax} onChange={(v) => update(idx, "ptax", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.loan} onChange={(v) => update(idx, "loan", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.lwf} onChange={(v) => update(idx, "lwf", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.canteen} onChange={(v) => update(idx, "canteen", v)} /></td>
                    <td className="px-2 py-1.5 text-right"><EditableCell value={e.held} onChange={(v) => update(idx, "held", v)} /></td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-critical">{inr(e.totalDed)}</td>
                    {customColumns.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-right">
                        <EditableCell
                          value={e.custom?.[c.key] || 0}
                          onChange={(v) =>
                            setEmployees((cur) => {
                              const next = [...cur];
                              next[idx] = { ...next[idx], custom: { ...(next[idx].custom || {}), [c.key]: v } };
                              return next;
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="bg-success-soft px-2 py-1.5 text-right font-bold tabular-nums text-success">{inr(e.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-sunken font-semibold">
                  <td colSpan={11} className="px-2 py-2 text-right">TOTAL</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.gross)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.pf)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.esi)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.ptax)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.loan)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.lwf)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.canteen)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.held)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totals.totalDed)}</td>
                  {customColumns.map((c) => <td key={c.key} />)}
                  <td className="bg-accent px-2 py-2 text-right tabular-nums text-white">{inr(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <ExtraSheet
            sheet={sheets[activeTab]}
            setSheet={(updater) =>
              setExtraSheets((cur) => {
                const list = [...(cur[siteId] || [])];
                list[activeTab] = typeof updater === "function" ? updater(list[activeTab]) : updater;
                return { ...cur, [siteId]: list };
              })
            }
          />
        )}
      </SectionCard>

      <NewSheetModal
        open={sheetModal}
        employees={employees}
        onClose={() => setSheetModal(false)}
        onCreate={(sheet) => {
          setExtraSheets((cur) => ({ ...cur, [siteId]: [...(cur[siteId] || []), sheet] }));
          setActiveTab(sheets.length);
          setSheetModal(false);
        }}
      />

      <Modal
        open={exportOpen}
        title="Choose columns to export"
        onClose={() => setExportOpen(false)}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setExportOpen(false)} className="h-8 rounded-md border border-border px-3 text-xs font-semibold">Cancel</button>
            <button type="button" onClick={exportXLSX} className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-white">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-1.5">
          {MAIN_EXPORT_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={exportFields.includes(f.key)}
                onChange={() => setExportFields((cur) => (cur.includes(f.key) ? cur.filter((x) => x !== f.key) : [...cur, f.key]))}
              />
              {f.label}
            </label>
          ))}
        </div>
        {sheets.length > 0 ? (
          <label className="mt-3 flex items-center gap-2 border-t border-divider pt-3 text-xs">
            <input type="checkbox" checked={exportSheets} onChange={(e) => setExportSheetsOn(e.target.checked)} />
            Include {sheets.length} additional sheet{sheets.length === 1 ? "" : "s"}
          </label>
        ) : null}
      </Modal>

      <EmployeeDrawer employee={openEmp} onClose={() => setOpenEmp(null)} />
    </div>
  );
}

function ExtraSheet({ sheet, setSheet }) {
  if (!sheet) return <p className="py-8 text-center text-xs text-ink-muted">No sheet selected.</p>;
  const updateCell = (r, key, val) => {
    setSheet((cur) => {
      const rows = [...cur.rows];
      rows[r] = { ...rows[r], [key]: val };
      return { ...cur, rows };
    });
  };
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[600px] text-[11px]">
          <thead className="bg-surface-sunken">
            <tr>
              {sheet.columns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-left font-semibold text-ink-muted">{c.label}</th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                {sheet.columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    {c.type === "number" ? (
                      <EditableCell value={row[c.key] || 0} onChange={(v) => updateCell(r, c.key, v)} />
                    ) : (
                      <input
                        value={row[c.key] || ""}
                        onChange={(e) => updateCell(r, c.key, e.target.value)}
                        className="w-full rounded border border-transparent px-1 py-0.5 text-[11px] outline-none focus:border-accent"
                      />
                    )}
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => setSheet((cur) => ({ ...cur, rows: cur.rows.filter((_, i) => i !== r) }))} className="text-ink-muted hover:text-critical">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => setSheet((cur) => ({ ...cur, rows: [...cur.rows, Object.fromEntries(cur.columns.map((c) => [c.key, c.type === "number" ? 0 : ""]))] }))}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-[11px] font-semibold text-ink-secondary"
      >
        <Plus className="h-3 w-3" /> Add row
      </button>
    </div>
  );
}

function NewSheetModal({ open, onClose, onCreate, employees }) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState([
    { key: "code", label: "Emp Code", type: "text" },
    { key: "name", label: "Name of Employee", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
  ]);

  return (
    <Modal
      open={open}
      title="Create additional sheet"
      onClose={onClose}
      widthClass="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-xs font-semibold">Cancel</button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) return;
              const rows = employees.map((e) => {
                const row = {};
                columns.forEach((c) => {
                  if (c.key === "code") row[c.key] = e.code;
                  else if (c.key === "name" || c.key === "name_of_employee") row[c.key] = e.name;
                  else row[c.key] = c.type === "number" ? 0 : "";
                });
                return row;
              });
              onCreate({ name: name.trim(), columns, rows });
              setName("");
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-white"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Create sheet
          </button>
        </div>
      }
    >
      <label className="mb-3 block text-[11px] font-semibold text-ink-muted">
        Sheet name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TPT Allowance" className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-xs" />
      </label>
      <p className="mb-2 text-[11px] font-semibold text-ink-muted">Columns</p>
      {columns.map((c, i) => (
        <div key={i} className="mb-1.5 flex gap-2">
          <input
            value={c.label}
            onChange={(e) =>
              setColumns((cur) =>
                cur.map((col, idx) =>
                  idx === i ? { ...col, label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_") } : col
                )
              )
            }
            className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-xs"
          />
          <select
            value={c.type}
            onChange={(e) => setColumns((cur) => cur.map((col, idx) => (idx === i ? { ...col, type: e.target.value } : col)))}
            className="h-8 rounded-md border border-gray-300 px-2 text-xs"
          >
            <option value="number">Number</option>
            <option value="text">Text</option>
          </select>
        </div>
      ))}
      <button type="button" onClick={() => setColumns((cur) => [...cur, { key: `field_${cur.length}`, label: "New column", type: "number" }])} className="mt-1 text-[11px] font-semibold text-accent">
        + Add column
      </button>
    </Modal>
  );
}

function EmployeeDrawer({ employee, onClose }) {
  const [tab, setTab] = useState("overview");
  useEffect(() => { setTab("overview"); }, [employee?.code]);
  const extra = EMP_EXTRAS[employee?.code] || { deductions: [], loans: [], advances: [], warnings: [], suspensions: [] };
  const tabs = [
    { id: "overview", label: "Overview", Icon: UserRound },
    { id: "deductions", label: "Deductions", Icon: Wallet, count: extra.deductions.length },
    { id: "loans", label: "Loans", Icon: Landmark, count: extra.loans.length },
    { id: "advances", label: "Advances", Icon: IndianRupee, count: extra.advances.length },
    { id: "warnings", label: "Warnings", Icon: FileWarning, count: extra.warnings.length },
    { id: "suspensions", label: "Suspensions", Icon: ShieldAlert, count: extra.suspensions.length },
  ];

  return (
    <Drawer open={Boolean(employee)} title={employee ? `${employee.name} · ${employee.code}` : "Employee"} onClose={onClose} widthClass="max-w-md">
      {employee ? (
        <div>
          <p className="mb-3 text-[11px] text-ink-muted">{employee.desig}</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${tab === t.id ? "bg-accent-soft text-ink" : "text-ink-muted"}`}
              >
                <t.Icon className="h-3 w-3" /> {t.label}
                {t.count > 0 ? <span className="rounded-full bg-info px-1 text-[10px] text-white">{t.count}</span> : null}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <dl className="divide-y divide-divider">
              {[
                ["Account number", employee.acc],
                ["IFSC", employee.ifsc],
                ["Working days", employee.workingDays],
                ["Present days", employee.pDays],
                ["Salary rate", inr(employee.salaryRate)],
                ["Gross", inr(employee.gross)],
                ["Net payable", inr(employee.net)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 text-xs">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {tab === "deductions" ? extra.deductions.length ? extra.deductions.map((d) => (
            <div key={d.label} className="mb-2 rounded-md border border-border p-2">
              <div className="flex justify-between text-xs font-semibold"><span>{d.label}</span><span className="text-critical">-{inr(d.amount)}</span></div>
              <p className="text-[11px] text-ink-muted">{d.month}</p>
            </div>
          )) : <p className="py-6 text-center text-xs text-ink-muted">No deductions on record.</p> : null}
          {tab === "loans" ? extra.loans.length ? extra.loans.map((l) => (
            <div key={l.disbursed} className="mb-2 rounded-md border border-border p-2 text-xs">
              <div className="flex justify-between font-semibold"><span>Loan · {inr(l.amount)}</span><span>{l.status}</span></div>
              <p className="mt-1 text-ink-secondary">Disbursed {l.disbursed} · EMI {inr(l.emi)}/mo</p>
              <p className="text-ink-secondary">Balance {inr(l.balance)}</p>
            </div>
          )) : <p className="py-6 text-center text-xs text-ink-muted">No loans on record.</p> : null}
          {tab === "advances" ? extra.advances.length ? extra.advances.map((a) => (
            <div key={a.date} className="mb-2 rounded-md border border-border p-2 text-xs">
              <div className="flex justify-between font-semibold"><span>{inr(a.amount)}</span><span>{a.recovered ? "Recovered" : "Pending recovery"}</span></div>
              <p className="text-[11px] text-ink-muted">Applied {a.date}</p>
            </div>
          )) : <p className="py-6 text-center text-xs text-ink-muted">No advance requests.</p> : null}
          {tab === "warnings" ? extra.warnings.length ? extra.warnings.map((w) => (
            <div key={w.date} className="mb-2 rounded-md border border-critical-border bg-critical-soft p-2 text-xs">
              <p className="font-semibold text-critical">{w.type}</p>
              <p className="mt-1">{w.reason}</p>
              <p className="mt-1 text-[11px] text-ink-muted">{w.date} · {w.issuedBy}</p>
            </div>
          )) : <p className="py-6 text-center text-xs text-ink-muted">No warning letters issued.</p> : null}
          {tab === "suspensions" ? extra.suspensions.length ? extra.suspensions.map((s) => (
            <div key={s.from} className="mb-2 rounded-md border border-critical-border bg-critical-soft p-2 text-xs">
              <p className="font-semibold">{s.from} → {s.to}</p>
              <p className="mt-1">{s.reason}</p>
              <p className="mt-1 text-[11px] text-ink-muted">Status: {s.status}</p>
            </div>
          )) : <p className="py-6 text-center text-xs text-ink-muted">No suspension record.</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
