import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Download,
  FilePlus2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { FormDateInput } from "../../../components/FormDateInput";
import { listSites } from "../../../lib/peopleAttendanceApi";
import { supabase } from "../../../lib/supabase";
import {
  cancelSiteIomDraft,
  confirmSiteIomEntry,
  deleteSiteIomDraft,
  emptySiteIomForm,
  formFromSiteIomEntry,
  listSiteIomEntries,
  loadActiveSiteNameForPerson,
  loadPersonSensitiveDetails,
  peekSharedEmployeeCode,
  saveSiteIomDraft,
  searchSitePeople,
  SITE_IOM_ENTRY_STATUSES,
  SITE_IOM_ROTATION_TYPES,
} from "../../../lib/siteIomApi";
import { downloadSiteIomExcel } from "../../../lib/siteIomExport";
import {
  DenseTable,
  FilterBar,
  Modal,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinyInput,
  TinySelect,
} from "../../adminOperations/components/AdminUi";

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusSeverity(status) {
  if (status === "confirmed") return "info";
  if (status === "cancelled") return "critical";
  return "warning";
}

export default function SiteIomPage() {
  const [records, setRecords] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fromDate, setFromDate] = useState(monthStartIso());
  const [toDate, setToDate] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptySiteIomForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [peopleHits, setPeopleHits] = useState([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [codeHint, setCodeHint] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listSiteIomEntries({
        fromDate: fromDate || null,
        toDate: toDate || null,
        status: statusFilter,
        rotationType: typeFilter,
        search,
      });
      setRecords(rows);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load Site Employee IOM.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, statusFilter, typeFilter, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSites(supabase);
        if (!cancelled) setSites(list || []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreate = async () => {
    setEditingId(null);
    setFormError("");
    setMessage("");
    setPeopleHits([]);
    setPeopleQuery("");
    const next = emptySiteIomForm({
      eventDate: todayIso(),
      dateOfJoining: todayIso(),
    });
    setForm(next);
    setModalOpen(true);
    try {
      const peek = await peekSharedEmployeeCode();
      setCodeHint(
        peek.lastUsed
          ? `Last used code: ${peek.lastUsed}. Suggested: ${peek.suggestedNext}`
          : `Suggested code: ${peek.suggestedNext}`
      );
      setForm((current) => ({
        ...current,
        employeeCode: peek.suggestedNext || current.employeeCode,
      }));
    } catch (err) {
      console.warn(err);
      setCodeHint("");
    }
  };

  const openEdit = (row) => {
    if (row.entryStatus !== "draft") return;
    setEditingId(row.id);
    setForm(formFromSiteIomEntry(row));
    setFormError("");
    setMessage("");
    setPeopleHits([]);
    setPeopleQuery(row.employeeName || "");
    setCodeHint("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptySiteIomForm());
    setFormError("");
  };

  const handleSiteChange = (siteId) => {
    const site = sites.find((s) => String(s.id) === String(siteId));
    setForm((current) => ({
      ...current,
      siteId: siteId || "",
      siteName: site?.site_name || "",
    }));
  };

  const handlePeopleSearch = async (value) => {
    setPeopleQuery(value);
    if (form.rotationType === "New") return;
    try {
      const hits = await searchSitePeople(value, 30);
      setPeopleHits(hits);
    } catch (err) {
      console.error(err);
      setPeopleHits([]);
    }
  };

  const selectPerson = async (person) => {
    setPeopleQuery(person.fullName);
    setPeopleHits([]);
    setForm((current) => ({
      ...current,
      personId: person.id,
      employeeCode: person.employeeCode,
      employeeName: person.fullName,
      designation: current.designation || person.designation,
      fatherName: current.fatherName || person.fatherName,
      contactNumber: current.contactNumber || person.phoneNo,
      dateOfJoining: current.dateOfJoining || person.joiningDate,
      pfNo: current.pfNo || person.pfNo,
      salaryAmount: current.salaryAmount || person.salaryBasic,
    }));
    try {
      const [sensitive, activeSite] = await Promise.all([
        loadPersonSensitiveDetails(person.id),
        loadActiveSiteNameForPerson(person.id),
      ]);
      setForm((current) => ({
        ...current,
        dateOfBirth: sensitive?.dateOfBirth || current.dateOfBirth,
        aadhaarNo: sensitive?.aadhaarNo || current.aadhaarNo,
        panNo: sensitive?.panNo || current.panNo,
        uanNo: sensitive?.uanNo || current.uanNo,
        bankAccountNo: sensitive?.bankAccountNo || current.bankAccountNo,
        ifscCode: sensitive?.ifscCode || current.ifscCode,
        bankName: sensitive?.bankName || current.bankName,
        siteName:
          current.rotationType === "Transferred"
            ? current.siteName
            : current.siteName || activeSite,
      }));
    } catch (err) {
      console.warn(err);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setFormError("");
    setMessage("");
    try {
      const saved = await saveSiteIomDraft(form, editingId);
      setMessage("Draft saved.");
      setModalOpen(false);
      setEditingId(null);
      await refresh();
      setRecords((prev) => {
        const without = prev.filter((r) => r.id !== saved.id);
        return [saved, ...without];
      });
    } catch (err) {
      console.error(err);
      setFormError(err?.message || "Unable to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmFromModal = async () => {
    setSaving(true);
    setFormError("");
    setMessage("");
    try {
      const draft = await saveSiteIomDraft(form, editingId);
      const confirmed = await confirmSiteIomEntry(draft.id);
      setMessage(
        confirmed.rotationType === "New"
          ? `Confirmed. Site employee ${confirmed.employeeCode} created.`
          : `Confirmed. Site employee record updated.`
      );
      setModalOpen(false);
      setEditingId(null);
      await refresh();
    } catch (err) {
      console.error(err);
      setFormError(err?.message || "Unable to confirm entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRow = async (row) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const confirmed = await confirmSiteIomEntry(row.id);
      setMessage(`Confirmed ${confirmed.employeeName} (${confirmed.rotationType}).`);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to confirm entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRow = async (row) => {
    setSaving(true);
    setError("");
    try {
      await cancelSiteIomDraft(row.id);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to cancel draft.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRow = async (row) => {
    setSaving(true);
    setError("");
    try {
      await deleteSiteIomDraft(row.id);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to delete draft.");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    setError("");
    try {
      const exportRows =
        statusFilter === "All"
          ? records.filter((r) => r.entryStatus === "confirmed")
          : records;
      if (!exportRows.length) {
        setError("No entries in range to export. Confirm drafts or widen the period.");
        return;
      }
      downloadSiteIomExcel(exportRows, { fromDate, toDate });
      setMessage("Excel downloaded.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to export Excel.");
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "eventDate",
        label: "Event date",
        widthClassName: "min-w-[110px]",
      },
      {
        key: "siteName",
        label: "Site",
        widthClassName: "min-w-[160px]",
      },
      {
        key: "employeeCode",
        label: "Emp code",
        widthClassName: "min-w-[90px]",
        render: (row) => row.employeeCode || "—",
      },
      {
        key: "employeeName",
        label: "Name",
        widthClassName: "min-w-[160px]",
      },
      {
        key: "designation",
        label: "Designation",
        widthClassName: "min-w-[130px]",
      },
      {
        key: "salaryAmount",
        label: "Salary",
        widthClassName: "min-w-[90px]",
        render: (row) => row.salaryAmount || "—",
      },
      {
        key: "rotationType",
        label: "Type",
        widthClassName: "min-w-[140px]",
      },
      {
        key: "entryStatus",
        label: "Status",
        widthClassName: "min-w-[110px]",
        render: (row) => (
          <StatusChip label={row.entryStatus} severity={statusSeverity(row.entryStatus)} />
        ),
      },
      {
        key: "actions",
        label: "Actions",
        widthClassName: "min-w-[260px]",
        render: (row) => {
          const isDraft = row.entryStatus === "draft";
          return (
            <div className="flex flex-wrap gap-1.5">
              {isDraft ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(row);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-accent text-accent hover:bg-accent/5 disabled:opacity-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleConfirmRow(row);
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Confirm
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 disabled:opacity-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCancelRow(row);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-rose-200 text-rose-700 disabled:opacity-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteRow(row);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-slate-500">History kept</span>
              )}
            </div>
          );
        },
      },
    ],
    [saving]
  );

  const isNew = form.rotationType === "New";

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full min-h-0 space-y-4">
      <PageTaskHeader
        title="Site Employee IOM"
        subtitle="Log new joiners and site changes as they happen. Confirm to update the site employee record; export the monthly memo as Excel when needed."
      >
        <button
          type="button"
          onClick={() => void openCreate()}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded bg-accent text-white"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          New entry
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <SectionCard title="IOM entries">
        <FilterBar>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            From
            <FormDateInput value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            To
            <FormDateInput value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              {SITE_IOM_ENTRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Type
            <TinySelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="All">All</option>
              {SITE_IOM_ROTATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Search
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <TinyInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, code, site…"
                className="pl-7 w-56"
              />
            </div>
          </label>
        </FilterBar>

        {error ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-xs text-emerald-700" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-3">
          {loading ? (
            <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>
          ) : (
            <DenseTable
              columns={columns}
              rows={records}
              rowKey="id"
              showSerialNumber
              frozenColumnCount={1}
              frozenColumnWidths={[110]}
            />
          )}
        </div>
      </SectionCard>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit IOM draft" : "New IOM entry"}
        widthClass="max-w-3xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              disabled={saving}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmFromModal()}
              className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Working…" : "Save & confirm"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {formError ? (
            <p className="text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-slate-600">
              Rotation type
              <TinySelect
                value={form.rotationType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setForm((current) => ({
                    ...emptySiteIomForm({
                      ...current,
                      rotationType: nextType,
                      personId: nextType === "New" ? null : current.personId,
                    }),
                  }));
                  setPeopleHits([]);
                }}
              >
                {SITE_IOM_ROTATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </TinySelect>
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Event date
              <FormDateInput
                value={form.eventDate}
                onChange={(e) => setField("eventDate", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600 sm:col-span-2">
              Site
              <TinySelect
                value={form.siteId}
                onChange={(e) => handleSiteChange(e.target.value)}
              >
                <option value="">Select site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.site_name}
                  </option>
                ))}
              </TinySelect>
            </label>
          </div>

          {!isNew ? (
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-slate-600">
                Existing site employee
                <TinyInput
                  value={peopleQuery}
                  onChange={(e) => void handlePeopleSearch(e.target.value)}
                  placeholder="Search by name or code…"
                />
              </label>
              {peopleHits.length ? (
                <ul className="max-h-36 overflow-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
                  {peopleHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        onClick={() => void selectPerson(p)}
                      >
                        <span className="font-medium text-slate-900">{p.fullName}</span>
                        <span className="text-slate-500"> · {p.employeeCode || "no code"}</span>
                        <span className="text-slate-500"> · {p.designation || "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-slate-600">
              Employee code
              <TinyInput
                value={form.employeeCode}
                onChange={(e) => setField("employeeCode", e.target.value)}
                disabled={!isNew}
                className="font-mono"
                placeholder={isNew ? "Suggested / editable" : "From employee"}
              />
              {isNew && codeHint ? (
                <span className="text-[10px] text-slate-500">{codeHint}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Employee name
              <TinyInput
                value={form.employeeName}
                onChange={(e) => setField("employeeName", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Designation
              <TinyInput
                value={form.designation}
                onChange={(e) => setField("designation", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Salary
              <TinyInput
                type="number"
                value={form.salaryAmount}
                onChange={(e) => setField("salaryAmount", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Father&apos;s name
              <TinyInput
                value={form.fatherName}
                onChange={(e) => setField("fatherName", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Contact number
              <TinyInput
                value={form.contactNumber}
                onChange={(e) => setField("contactNumber", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Date of joining
              <FormDateInput
                value={form.dateOfJoining}
                onChange={(e) => setField("dateOfJoining", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Date of birth
              <FormDateInput
                value={form.dateOfBirth}
                onChange={(e) => setField("dateOfBirth", e.target.value)}
              />
            </label>
          </div>

          <div className="rounded border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-950">
            Banking and ID fields are stored separately from the general site employee list.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-slate-600">
              Bank name
              <TinyInput
                value={form.bankName}
                onChange={(e) => setField("bankName", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Bank account no
              <TinyInput
                value={form.bankAccountNo}
                onChange={(e) => setField("bankAccountNo", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              IFSC
              <TinyInput
                value={form.ifscCode}
                onChange={(e) => setField("ifscCode", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              Aadhaar
              <TinyInput
                value={form.aadhaarNo}
                onChange={(e) => setField("aadhaarNo", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              PAN
              <TinyInput
                value={form.panNo}
                onChange={(e) => setField("panNo", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              UAN
              <TinyInput
                value={form.uanNo}
                onChange={(e) => setField("uanNo", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600">
              PF number
              <TinyInput
                value={form.pfNo}
                onChange={(e) => setField("pfNo", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-600 sm:col-span-2">
              Remarks
              <TinyInput
                value={form.remarks}
                onChange={(e) => setField("remarks", e.target.value)}
              />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
