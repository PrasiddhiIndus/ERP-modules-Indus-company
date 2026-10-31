import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, FilePlus2, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { IEV_OC_DEPARTMENT } from "./ocDepartment";
import { toast } from "../../../lib/toast";
import { deleteOc, friendlyOcError, listOcs } from "./ocApi";
import { formatIndianAmount, formatOcDate } from "./ocModel";
import OcCreationForm from "./OcCreationForm";

/**
 * PO At Glance: list of entries, and the form for one entry (?oc=<id> or ?oc=new).
 * IEV Costing by default; `department` (ocDepartment.js) switches to another department's records.
 */
export default function OcCreationTab({ department = IEV_OC_DEPARTMENT }) {
  const { userProfile, accessibleModules } = useAuth();
  const canEdit = department.canEdit(userProfile, accessibleModules);
  const canDelete = department.canDelete(userProfile, accessibleModules);
  const [params, setParams] = useSearchParams();
  const openId = params.get("oc");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const open = (id) => setParams(id ? { oc: id } : {}, { replace: false });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listOcs(department));
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not load PO At Glance entries.", department));
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    if (!openId) refresh();
  }, [openId, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.oc_no, r.client_name, r.po_wo_no].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [rows, query]);

  const handleDelete = async (row) => {
    const name = row.oc_no ? `PO At Glance for OC No. ${row.oc_no}` : `PO At Glance for ${row.client_name} (OC No. pending)`;
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await deleteOc(row.id, department);
      toast.success(`${name} deleted.`);
      refresh();
    } catch (e) {
      toast.error(friendlyOcError(e, "Could not delete this PO At Glance.", department));
    }
  };

  if (openId) {
    return (
      <OcCreationForm
        department={department}
        ocId={openId === "new" ? null : openId}
        canEdit={canEdit}
        onBack={() => open(null)}
        onSaved={(id) => openId === "new" && setParams({ oc: id }, { replace: true })}
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">PO At Glance</h3>
          <p className="text-sm text-slate-500">{department.listSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search OC no., client, PO/WO"
              className="w-64 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </div>
          {canEdit && (
            <button type="button" onClick={() => open("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
              <FilePlus2 className="h-4 w-4" /> New PO At Glance
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-500">
          {rows.length
            ? "Nothing matches your search."
            : canEdit
              ? "No PO At Glance entries yet. Use New PO At Glance to create the first one."
              : "No PO At Glance entries yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">OC No.</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">PO/WO No.</th>
                <th className="px-4 py-2 text-right">Contract value</th>
                <th className="px-4 py-2">Delivery</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => open(r.id)} className="cursor-pointer hover:bg-red-50/40">
                  <td className="px-4 py-2 font-mono text-xs text-slate-900">
                    {r.oc_no || <span className="rounded-full bg-amber-50 px-2 py-0.5 font-sans text-[11px] text-amber-700">Pending (Finance)</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{formatOcDate(r.oc_date) || "—"}</td>
                  <td className="px-4 py-2 text-slate-900">{r.client_name}</td>
                  <td className="px-4 py-2 text-slate-600">{r.po_wo_no}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                    {r.currency === "INR" ? "₹" : `${r.currency} `}{formatIndianAmount(r.contract_value)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{formatOcDate(r.delivery_date)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r.id);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        {canEdit ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {canEdit ? "Edit" : "View"}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={`Delete ${r.oc_no || r.client_name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(r);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
