import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, FilePlus2, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toast";
import { confirmDialog } from "../../../lib/dialog";
import { CM_PO_CATEGORIES, COMMERCIAL_OC_DEPARTMENT, cmCategoryLabel, cmCategoryStages } from "./cmOcDepartment";
import { formatCmDate } from "./cmOcModel";
import { deleteCmOc, friendlyCmError, listCmOcs, listCmSignedSlots } from "./cmOcApi";
import CommercialPoForm from "./CommercialPoForm";

/**
 * Commercial PO At Glance: list of entries, and the form for one entry (?oc=<id> or ?oc=new).
 * ?category=<FIRE|SAFETY|FT_RENTAL|FT_CREW_RENTAL> filters the list and presets the category of a new PO.
 */
export default function CommercialPoList() {
  const { userProfile, accessibleModules } = useAuth();
  const canEdit = COMMERCIAL_OC_DEPARTMENT.canEdit(userProfile, accessibleModules);
  const canDelete = COMMERCIAL_OC_DEPARTMENT.canDelete(userProfile, accessibleModules);
  const [params, setParams] = useSearchParams();
  const openId = params.get("oc");
  const categoryParam = params.get("category") || "";
  const category = CM_PO_CATEGORIES.some((c) => c.value === categoryParam) ? categoryParam : "";
  const [rows, setRows] = useState([]);
  const [signed, setSigned] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // The category filter stays in the URL while a PO is open, so Back returns to the same filtered list.
  const withCategory = (extra = {}) => (category ? { category, ...extra } : extra);
  const open = (id) => setParams(withCategory(id ? { oc: id } : {}), { replace: false });
  const setCategory = (value) => setParams(value ? { category: value } : {}, { replace: true });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCmOcs();
      setRows(list);
      setSigned(await listCmSignedSlots(list.map((r) => r.id)).catch(() => ({})));
    } catch (e) {
      toast.error(friendlyCmError(e, "Could not load PO At Glance entries."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!openId) refresh();
  }, [openId, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!category || r.po_category === category)
      && (!q || [r.oc_no, r.client_name, r.po_wo_no].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [rows, query, category]);

  const handleDelete = async (row) => {
    const name = row.oc_no ? `PO At Glance for OC No. ${row.oc_no}` : `PO At Glance for ${row.client_name} (OC No. pending)`;
    if (!(await confirmDialog({ title: "Delete PO at a glance", message: `Delete ${name}? This cannot be undone.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await deleteCmOc(row.id);
      toast.success(`${name} deleted.`);
      refresh();
    } catch (e) {
      toast.error(friendlyCmError(e, "Could not delete this PO At Glance."));
    }
  };

  if (openId) {
    return (
      <CommercialPoForm
        ocId={openId === "new" ? null : openId}
        defaultCategory={category}
        canEdit={canEdit}
        onBack={() => open(null)}
        onSaved={(id) => openId === "new" && setParams(withCategory({ oc: id }), { replace: true })}
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">PO At Glance</h3>
          <p className="text-sm text-slate-500">{COMMERCIAL_OC_DEPARTMENT.listSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="PO Category"
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
          >
            <option value="">All categories</option>
            {CM_PO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search OC no., customer, WO"
              className="w-64 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </div>
          {canEdit && (
            <button type="button" onClick={() => open("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
              <FilePlus2 className="h-4 w-4" /> New PO At Glance{category ? ` (${cmCategoryLabel(category)})` : ""}
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
            ? category && !query.trim()
              ? `No ${cmCategoryLabel(category)} POs yet.`
              : "Nothing matches your search or category."
            : canEdit
              ? "No PO At Glance entries yet. Use New PO At Glance to create the first one."
              : "No PO At Glance entries yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">OC No.</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">WO No.</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Mobilization</th>
                <th className="px-4 py-2">Approval</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const stages = cmCategoryStages(r.po_category);
                const mine = new Set(signed[r.id] || []);
                const done = stages.filter((s) => mine.has(s.slot)).length;
                const next = stages.find((s) => !mine.has(s.slot));
                const range = [formatCmDate(r.duration_from), formatCmDate(r.duration_to)].filter(Boolean).join(" – ");
                return (
                  <tr key={r.id} onClick={() => open(r.id)} className="cursor-pointer hover:bg-red-50/40">
                    <td className="px-4 py-2 font-mono text-xs text-slate-900">
                      {r.oc_no || <span className="rounded-full bg-amber-50 px-2 py-0.5 font-sans text-[11px] text-amber-700">Pending (Finance)</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatCmDate(r.oc_date) || "—"}</td>
                    <td className="px-4 py-2 text-slate-900">{r.client_name}</td>
                    <td className="px-4 py-2 text-slate-600">{r.po_wo_no}</td>
                    <td className="px-4 py-2 text-slate-600">{cmCategoryLabel(r.po_category) || <span className="text-amber-700">Not set</span>}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {r.duration_text || "—"}
                      {range && <span className="block text-[11px] text-slate-400">{range}</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatCmDate(r.mobilization_date) || "—"}</td>
                    <td className="px-4 py-2">
                      {stages.length ? (
                        <>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            !next ? "bg-emerald-50 text-emerald-700" : done ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"
                          }`}
                          >
                            {next ? `${done}/${stages.length} signed` : "Approved"}
                          </span>
                          {next && <span className="block pt-0.5 text-[11px] text-slate-500">Next: {next.label}</span>}
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
