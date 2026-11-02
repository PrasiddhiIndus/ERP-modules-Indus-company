import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock, History, Loader2, Pencil, RefreshCw, Search, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { amFinance } from "../../projects/oc/ocApi";
import { formatIndianAmount, formatOcDate } from "../../projects/oc/ocModel";
import { FINANCE_PO_DEPARTMENTS, financePoDepartment } from "./financePoDepartments";
import { friendlyFinancePoError, listFinancePoOcHistory, listFinancePos, setFinancePoOcNo } from "./financePoApi";

const PAGE_SIZES = [25, 50, 100];
const OC_STATUS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending OC" },
  { key: "entered", label: "OC Entered" },
];

const rowKey = (r) => `${r.department}:${r.id}`;
const money = (r) => `${r.currency === "INR" ? "₹" : `${r.currency} `}${formatIndianAmount(r.contract_value)}`;

function approval(r) {
  const signed = (r.signed_slots || []).length;
  const total = r.total_slots || financePoDepartment(r.department).slots.length;
  return { signed, total, done: total > 0 && signed >= total };
}

const SORTERS = {
  po_wo_no: (r) => String(r.po_wo_no || "").toLowerCase(),
  department: (r) => financePoDepartment(r.department).label,
  po_date: (r) => r.po_date || "",
  client_name: (r) => String(r.client_name || "").toLowerCase(),
  contract_value: (r) => Number(r.contract_value) || 0,
  approval: (r) => approval(r).signed / (approval(r).total || 1),
  oc_no: (r) => String(r.oc_no || "").toLowerCase(),
};

function DeptBadge({ department }) {
  const d = financePoDepartment(department);
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${d.badge}`}>{d.label}</span>;
}

function SortTh({ id, label, sort, onSort, className = "" }) {
  const active = sort.key === id;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button type="button" onClick={() => onSort(id)} className="inline-flex items-center gap-1 uppercase hover:text-slate-800">
        {label} <Icon className={`h-3 w-3 ${active ? "text-slate-700" : "text-slate-300"}`} />
      </button>
    </th>
  );
}

function OcDialog({ row, onClose, onSaved }) {
  const dept = financePoDepartment(row.department);
  const [ocNo, setOcNo] = useState(row.oc_no || "");
  const [ocDate, setOcDate] = useState(row.oc_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    listFinancePoOcHistory(row.department, row.id)
      .then((h) => alive && setHistory(h))
      .catch((e) => {
        console.warn("[Master PO At Glance] history", e);
        if (alive) setHistory([]);
      });
    return () => { alive = false; };
  }, [row.department, row.id]);

  const trimmed = ocNo.trim();
  const validation = !trimmed ? "OC No. is required." : trimmed.length > 80 ? "OC No. must be 80 characters or fewer." : "";
  const unchanged = trimmed === (row.oc_no || "") && (ocDate || null) === (row.oc_date || null);

  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current || validation || unchanged) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const res = await setFinancePoOcNo({
        department: row.department, id: row.id, ocNo: trimmed, ocDate, expectedUpdatedAt: row.updated_at,
      });
      toast.success(`OC No. ${res.oc_no} saved for ${dept.label} PO ${row.po_wo_no}.`);
      onSaved({ ...row, oc_no: res.oc_no, oc_date: res.oc_date, updated_at: res.updated_at });
    } catch (err) {
      setError(friendlyFinancePoError(err, "Could not save the OC No."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{row.oc_no ? "Update OC No." : "Enter OC No."}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Only the OC No. and OC date change. The PO, its approvals and signatures stay as they are.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <dt className="text-slate-500">Department</dt><dd><DeptBadge department={row.department} /></dd>
            <dt className="text-slate-500">PO/WO No.</dt><dd className="font-mono font-semibold text-slate-900">{row.po_wo_no}</dd>
            <dt className="text-slate-500">Client</dt><dd className="text-slate-800">{row.client_name || "—"}</dd>
            <dt className="text-slate-500">Value</dt><dd className="tabular-nums text-slate-800">{money(row)}</dd>
          </dl>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">OC No. <span className="text-red-600">*</span></span>
            <input
              autoFocus
              value={ocNo}
              maxLength={80}
              onChange={(e) => { setOcNo(e.target.value); setError(""); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              placeholder="Enter OC number"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">OC date</span>
            <input
              type="date"
              value={ocDate || ""}
              onChange={(e) => setOcDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </label>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"><History className="h-3.5 w-3.5" /> OC No. history</p>
            {history === null ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400">No changes recorded from this page yet.</p>
            ) : (
              <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-slate-600">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="font-mono">{h.old_oc_no || "—"}</span> → <span className="font-mono font-medium text-slate-800">{h.new_oc_no}</span>
                    <span className="text-slate-400"> · {h.changed_by_name || "Unknown"} · {new Date(h.changed_at).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            type="submit"
            disabled={saving || !!validation || unchanged}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? "Saving…" : "Save OC No."}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Finance → Master PO At Glance: every department's PO At Glance records in one list, read from each
 * department's own tables (no copies), where Finance fills or updates the OC No.
 */
export default function MasterPoAtGlance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isFinance, setIsFinance] = useState(false);
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "po_date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [fin, list] = await Promise.all([amFinance(), listFinancePos()]);
      setIsFinance(fin);
      setRows(list);
    } catch (e) {
      setLoadError(friendlyFinancePoError(e, "Could not load POs."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setPage(1); }, [dept, status, query, pageSize]);

  const counts = useMemo(() => {
    const byDept = Object.fromEntries(FINANCE_PO_DEPARTMENTS.map((d) => [d.key, 0]));
    let pending = 0;
    for (const r of rows) {
      byDept[r.department] = (byDept[r.department] || 0) + 1;
      if (!r.oc_no) pending += 1;
    }
    return { total: rows.length, pending, entered: rows.length - pending, byDept };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (dept !== "all" && r.department !== dept) return false;
      if (status === "pending" && r.oc_no) return false;
      if (status === "entered" && !r.oc_no) return false;
      if (!q) return true;
      return [r.po_wo_no, r.oc_no, r.client_name, r.project_description, r.cost_center_tally, financePoDepartment(r.department).label]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
    const get = SORTERS[sort.key];
    const mul = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const x = get(a), y = get(b);
      return x < y ? -mul : x > y ? mul : 0;
    });
  }, [rows, dept, status, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const onSaved = (updated) => {
    setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(updated) ? { ...r, ...updated } : r)));
    setLastSaved(rowKey(updated));
    setEditing(null);
  };

  const chip = (active) =>
    `rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="min-h-screen bg-slate-50 finance-module">
      <div className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <h1 className="text-xl font-bold text-gray-900">Master PO At Glance</h1>
        <p className="mt-0.5 text-xs text-gray-500">Finance · POs from every department · OC No. entry</p>
      </div>

      <div className="mx-auto max-w-[1600px] space-y-3 px-4 py-4 sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total POs", value: counts.total, cls: "text-slate-900" },
            { label: "Pending OC entry", value: counts.pending, cls: "text-amber-700" },
            { label: "OC entered", value: counts.entered, cls: "text-emerald-700" },
            ...FINANCE_PO_DEPARTMENTS.map((d) => ({ label: d.label, value: counts.byDept[d.key] || 0, cls: "text-slate-900" })),
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${c.cls}`}>{loading ? "–" : c.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                aria-label="Filter by department"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              >
                <option value="all">All Departments</option>
                {FINANCE_PO_DEPARTMENTS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5" role="group" aria-label="OC status">
                {OC_STATUS.map((s) => (
                  <button key={s.key} type="button" className={chip(status === s.key)} onClick={() => setStatus(s.key)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search PO, OC, client, department"
                  className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 lg:w-72"
                />
              </div>
              <button type="button" onClick={refresh} disabled={loading} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading POs…</div>
          ) : loadError ? (
            <div className="p-12 text-center text-sm">
              <p className="text-red-700">{loadError}</p>
              <button type="button" onClick={refresh} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">Try again</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {rows.length ? "No POs match these filters." : "No POs yet. POs created in any department's PO At Glance appear here."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-semibold tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 uppercase">Sr.</th>
                      <SortTh id="po_wo_no" label="PO/WO No." sort={sort} onSort={onSort} />
                      <SortTh id="department" label="Department" sort={sort} onSort={onSort} />
                      <SortTh id="po_date" label="PO Date" sort={sort} onSort={onSort} />
                      <SortTh id="client_name" label="Client" sort={sort} onSort={onSort} />
                      <SortTh id="contract_value" label="PO Amount" sort={sort} onSort={onSort} className="text-right" />
                      <SortTh id="approval" label="Approval" sort={sort} onSort={onSort} />
                      <SortTh id="oc_no" label="OC No." sort={sort} onSort={onSort} />
                      <th className="px-3 py-2 uppercase">OC Status</th>
                      <th className="px-3 py-2 text-right uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((r, i) => {
                      const a = approval(r);
                      const d = financePoDepartment(r.department);
                      const signedLabels = d.slots.filter((s) => r.signed_slots?.includes(s.slot)).map((s) => s.label);
                      const pendingLabels = d.slots.filter((s) => !r.signed_slots?.includes(s.slot)).map((s) => s.label);
                      return (
                        <tr key={rowKey(r)} className={lastSaved === rowKey(r) ? "bg-emerald-50/60" : "hover:bg-slate-50"}>
                          <td className="px-3 py-1.5 tabular-nums text-slate-500">{(current - 1) * pageSize + i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-900">{r.po_wo_no || "—"}</td>
                          <td className="px-3 py-1.5"><DeptBadge department={r.department} /></td>
                          <td className="px-3 py-1.5 text-slate-600">{formatOcDate(r.po_date) || "—"}</td>
                          <td className="max-w-[16rem] truncate px-3 py-1.5 text-slate-900" title={r.project_description || ""}>{r.client_name || "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{r.contract_value == null ? "—" : money(r)}</td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`text-xs ${a.done ? "text-emerald-700" : "text-slate-600"}`}
                              title={[signedLabels.length && `Signed: ${signedLabels.join(", ")}`, pendingLabels.length && `Pending: ${pendingLabels.join(", ")}`].filter(Boolean).join("\n")}
                            >
                              {a.done ? "All signed" : `${a.signed}/${a.total} signed`}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-900">
                            {r.oc_no || "—"}
                            {r.oc_date && <span className="ml-1 font-sans text-[11px] text-slate-400">{formatOcDate(r.oc_date)}</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.oc_no ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Entered</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Clock className="h-3.5 w-3.5" /> Pending</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {isFinance && (
                              <button
                                type="button"
                                onClick={() => setEditing(r)}
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                  r.oc_no ? "text-slate-600 hover:bg-slate-100" : "bg-red-600 text-white hover:bg-red-700"
                                }`}
                              >
                                <Pencil className="h-3.5 w-3.5" /> {r.oc_no ? "Edit OC" : "Enter OC"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded border border-slate-300 px-1.5 py-1" aria-label="Rows per page">
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Prev</button>
                  <span>Page {current} of {pages}</span>
                  <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {editing && <OcDialog row={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}
