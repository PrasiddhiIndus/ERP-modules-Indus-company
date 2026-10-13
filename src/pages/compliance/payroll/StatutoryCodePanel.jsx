import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileSpreadsheet, FileText, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "../../adminOperations/components/AdminUi";
import { toast } from "../../../lib/toast";
import { WageFormStep } from "./WageStatutoryForm";
import NominationDocument from "./NominationDocument";
import { OshIdentityCards, OshLeaveRegister } from "./OshSpecialForms";

function PackForm({ form, header, rows, onHeader, onRows, readOnly = false }) {
  const shared = { form, header, rows, onHeader, onRows, readOnly };
  if (form.kind === "nomination") return <NominationDocument {...shared} />;
  if (form.kind === "identity") return <OshIdentityCards {...shared} />;
  if (form.kind === "leave") return <OshLeaveRegister {...shared} />;
  return <WageFormStep {...shared} />;
}

const PAGE_SIZE = 10;

function filled(part) {
  if (!part) return false;
  const headerFilled = Object.values(part.header || {}).some((value) => String(value || "").trim());
  const rowFilled = (part.rows || []).some((row) => Object.values(row).some((value) => String(value || "").trim()));
  return headerFilled || rowFilled;
}

function packSearchText(pack, forms) {
  const bits = [];
  forms.forEach((form) => {
    const part = pack.forms?.[form.id];
    if (!part) return;
    bits.push(...Object.values(part.header || {}));
    (part.rows || []).forEach((row) => {
      bits.push(row.name, row.employeeName, row.memberName, row.nominee, row.code, row.uan);
    });
  });
  return bits.join(" ").toLowerCase();
}

function summarize(pack, forms) {
  const first = forms[0];
  const header = pack.forms?.[first?.id]?.header || {};
  const rows = pack.forms?.[first?.id]?.rows || [];
  const count = rows.filter((row) => Object.values(row).some((value) => String(value || "").trim())).length;
  return {
    establishment: header.establishment || header.contractor || "—",
    employer: header.employer || header.principal || header.employeeName || "—",
    reference: header.lin || header.pfCode || header.esicCode || header.contractorLin || header.uan || "—",
    count,
  };
}

export default function StatutoryCodePanel({
  title,
  subtitle,
  searchPlaceholder,
  modalTitle,
  forms,
  listPacks,
  createPack,
  savePack,
  deletePack,
  exportExcel,
  exportPdf,
}) {
  const [packs, setPacks] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyKey, setBusyKey] = useState("");

  const refresh = useCallback(async () => {
    const rows = await Promise.resolve(listPacks());
    setPacks(Array.isArray(rows) ? rows : []);
  }, [listPacks]);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    refresh()
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.warning("Could not load saved forms");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return packs;
    return packs.filter((pack) => packSearchText(pack, forms).includes(needle));
  }, [packs, query, forms]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const runExport = async (pack, kind) => {
    const key = `${pack.id}:${kind}`;
    setBusyKey(key);
    try {
      if (kind === "pdf") exportPdf(pack, forms);
      else await exportExcel(pack, forms);
      toast.success(kind === "pdf" ? "PDF downloaded" : "Excel downloaded");
    } catch (error) {
      console.error(error);
      toast.warning(kind === "pdf" ? "Could not create the PDF" : "Could not create the Excel file");
    } finally {
      setBusyKey("");
    }
  };

  const remove = async (pack) => {
    const label = summarize(pack, forms).establishment;
    if (!window.confirm(`Delete the saved forms for ${label === "—" ? "this record" : label}?`)) return;
    await deletePack(pack.id);
    toast.success("Saved forms deleted");
    if (currentPage > 1 && pageRows.length === 1) setPage(currentPage - 1);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(createPack())}
          className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 text-sm text-white hover:opacity-90 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Form</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Filters</p>
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPage(1);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-600 px-3 text-sm text-white hover:bg-gray-700"
            >
              <Filter className="h-4 w-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <h3 className="text-lg font-semibold text-gray-900">Saved forms ({filtered.length})</h3>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="whitespace-nowrap text-sm text-gray-500">
              Showing {filtered.length ? startIndex + 1 : 0}–{Math.min(startIndex + PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="h-8 rounded-lg border border-gray-300 px-3 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="whitespace-nowrap px-2 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="h-8 rounded-lg border border-gray-300 px-3 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                {["Establishment", "Employer", "LIN / code", "Entries", "Saved", "Actions"].map((heading) => (
                  <th
                    key={heading}
                    className={`whitespace-nowrap border-b border-gray-200 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${
                      heading === "Actions" || heading === "Entries" ? "text-right" : "text-left"
                    }`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((pack) => {
                  const summary = summarize(pack, forms);
                  const saved = pack.savedAt
                    ? new Date(pack.savedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                    : "—";
                  return (
                    <tr key={pack.id} className="hover:bg-gray-50">
                      <td className="border-b border-gray-100 px-3 py-2.5 font-medium text-gray-900">{summary.establishment}</td>
                      <td className="border-b border-gray-100 px-3 py-2.5 text-gray-900">{summary.employer}</td>
                      <td className="border-b border-gray-100 px-3 py-2.5 text-gray-900">{summary.reference}</td>
                      <td className="border-b border-gray-100 px-3 py-2.5 text-right tabular-nums text-gray-900">{summary.count}</td>
                      <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2.5 text-gray-500">{saved}</td>
                      <td className="border-b border-gray-100 px-3 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <RowIcon title="View" onClick={() => setViewing(pack)}>
                            <Eye className="h-4 w-4" />
                          </RowIcon>
                          <RowIcon title="Edit" onClick={() => setEditing(JSON.parse(JSON.stringify(pack)))}>
                            <Pencil className="h-4 w-4" />
                          </RowIcon>
                          <RowIcon title="Export PDF" disabled={busyKey === `${pack.id}:pdf`} onClick={() => runExport(pack, "pdf")}>
                            <FileText className="h-4 w-4" />
                          </RowIcon>
                          <RowIcon title="Export Excel" disabled={busyKey === `${pack.id}:xlsx`} onClick={() => runExport(pack, "xlsx")}>
                            <FileSpreadsheet className="h-4 w-4" />
                          </RowIcon>
                          <RowIcon title="Delete" danger onClick={() => remove(pack)}>
                            <Trash2 className="h-4 w-4" />
                          </RowIcon>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-500">
                    {loadingList
                      ? "Loading saved forms…"
                      : query.trim()
                        ? "No forms match this search."
                        : "No saved forms yet. Use Form to add one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PackModal
        title={modalTitle}
        forms={forms}
        pack={editing}
        savePack={savePack}
        onClose={() => setEditing(null)}
        onSaved={() => {
          refresh();
          setEditing(null);
        }}
      />
      <ViewModal title={modalTitle} forms={forms} pack={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function RowIcon({ title, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-50 ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function PackModal({ title, forms, pack, savePack, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState({});

  React.useEffect(() => {
    if (!pack) return;
    setDraft(JSON.parse(JSON.stringify(pack)));
    setStep(0);
    const initial = {};
    forms.forEach((form) => {
      if (filled(pack.forms?.[form.id])) initial[form.id] = true;
    });
    setDone(initial);
  }, [pack, forms]);

  if (!pack || !draft || draft.id !== pack.id) return null;
  const form = forms[step];
  const current = draft.forms[form.id] || { header: {}, rows: [] };

  const updatePart = (patch) => {
    setDraft({
      ...draft,
      forms: { ...draft.forms, [form.id]: { ...current, ...patch } },
    });
  };

  const go = (nextStep) => {
    if (nextStep < 0 || nextStep >= forms.length) return;
    if (filled(current)) setDone((prev) => ({ ...prev, [form.id]: true }));
    const nextForm = forms[nextStep];
    const next = draft.forms[nextForm.id] || { header: {}, rows: [] };
    const header = { ...next.header };
    let changed = false;
    Object.keys(current.header || {}).forEach((key) => {
      if (key in header && !String(header[key] || "").trim() && String(current.header[key] || "").trim()) {
        header[key] = current.header[key];
        changed = true;
      }
    });
    if (changed) {
      setDraft({
        ...draft,
        forms: { ...draft.forms, [nextForm.id]: { ...next, header } },
      });
    }
    setStep(nextStep);
  };

  const save = async () => {
    const first = forms[0];
    const required = first.header[0];
    const value = draft.forms[first.id]?.header?.[required?.key];
    if (!String(value || "").trim()) {
      toast.warning(`Enter ${required?.label || "the establishment"} on ${first.button}`);
      setStep(0);
      return;
    }
    await savePack(draft);
    toast.success("Forms saved");
    onSaved();
  };

  return (
    <Modal
      open={Boolean(pack)}
      title={title}
      onClose={onClose}
      widthClass="max-w-5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {forms.length > 1 ? (
          <button type="button" className="erp-btn-secondary h-10 rounded-lg px-4 text-sm disabled:opacity-40" disabled={step === 0} onClick={() => go(step - 1)}>
            Previous
          </button>
          ) : <span />}
          <div className="flex flex-wrap justify-end gap-2">
            {step < forms.length - 1 ? (
              <button type="button" className="erp-btn-primary h-10 rounded-lg px-4 text-sm" onClick={() => go(step + 1)}>
                Next
              </button>
            ) : null}
            <button type="button" className="erp-btn-primary h-10 rounded-lg px-4 text-sm" onClick={save}>
              Save
            </button>
          </div>
        </div>
      }
    >
      {forms.length > 1 ? <div className="mb-4 flex flex-wrap gap-1 border-b border-divider" role="tablist">
        {forms.map((item, index) => {
          const active = index === step;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go(index)}
              className={`-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-sm font-medium sm:px-3 ${
                active ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {done[item.id] ? (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-success text-[10px] text-white">✓</span>
              ) : (
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${active ? "bg-accent text-white" : "bg-surface-sunken text-ink-muted"}`}>
                  {index + 1}
                </span>
              )}
              {item.button}
            </button>
          );
        })}
      </div> : null}
      <PackForm
        key={`${draft.id}-${form.id}`}
        form={form}
        header={current.header}
        rows={current.rows}
        onHeader={(header) => updatePart({ header })}
        onRows={(rows) => updatePart({ rows })}
      />
    </Modal>
  );
}

function ViewModal({ title, forms, pack, onClose }) {
  return (
    <Modal open={Boolean(pack)} title={title} onClose={onClose} widthClass="max-w-5xl">
      {pack ? (
        <div className="space-y-8">
          {forms.map((form) => {
            const part = pack.forms?.[form.id] || { header: {}, rows: [] };
            return (
              <PackForm
                key={form.id}
                form={form}
                header={part.header || {}}
                rows={part.rows || []}
                onHeader={() => {}}
                onRows={() => {}}
                readOnly
              />
            );
          })}
        </div>
      ) : null}
    </Modal>
  );
}
