import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Download,
  ExternalLink,
  Pencil,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { FormDateInput } from "../../../components/FormDateInput";
import {
  callingAttachmentStoragePath,
  fileLabelFromCallingAttachment,
  presignCallingMasterR2Get,
} from "../../../lib/callingMasterR2";
import { listSites } from "../../../lib/peopleAttendanceApi";
import { downloadRecruitmentIomExcel } from "../../../lib/siteIomExport";
import { supabase } from "../../../lib/supabase";
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
import {
  buildRecruitmentIomEntryFromCandidate,
  CALLING_MASTER_RECORDS_EVENT,
  emptyJoiningChecklistItem,
  emptyRecruitmentIomEntry,
  getChecklistItemFile,
  iomEntryStatusLabel,
  isIomConfirmed,
  JOINING_CHECKLIST_ITEMS,
  journeyStatusSeverity,
  normalizeJoiningChecklist,
  normalizeRecruitmentIomEntry,
} from "./callingMasterConfig";
import { CallingActionBar, CallingActionBtn } from "./CallingTableActions";
import { confirmIomEntry, loadIomCandidates, saveIomEntry } from "./callingMasterStorage";

function ChecklistDocLink({ file, onOpen }) {
  if (!file) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline shrink-0"
      onClick={() => void onOpen(file)}
      title={fileLabelFromCallingAttachment(file)}
    >
      <ExternalLink className="w-3 h-3" />
      Doc
    </button>
  );
}

function IomFieldLabel({ children, docLink = null }) {
  return (
    <span className="flex items-center justify-between gap-1 text-[10px] font-medium text-slate-500 leading-none">
      <span>{children}</span>
      {docLink}
    </span>
  );
}

function IomField({
  label,
  docLink = null,
  children,
  className = "",
}) {
  return (
    <label className={`flex flex-col gap-0.5 min-w-0 ${className}`.trim()}>
      <IomFieldLabel docLink={docLink}>{label}</IomFieldLabel>
      {children}
    </label>
  );
}

function IomFormSection({ title, children, className = "" }) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-slate-50/80 p-3 min-w-0 ${className}`.trim()}
    >
      <h4 className="text-[11px] font-semibold text-slate-800 mb-2 pb-1.5 border-b border-slate-200">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">{children}</div>
    </section>
  );
}

function IomEntryForm({
  entryForm,
  setEntryField,
  handleSiteChange,
  sites,
  joiningChecklist,
  confirmed,
  selectedRow,
  onOpenFile,
  onSave,
  onConfirm,
  saving,
}) {
  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-[11px]">
        <span className="text-slate-500">
          Rotation: <strong className="text-slate-800">New</strong>
        </span>
        {selectedRow?.iomReferenceNo ? (
          <span className="text-slate-500">
            IOM ref: <strong className="font-mono text-slate-800">{selectedRow.iomReferenceNo}</strong>
          </span>
        ) : null}
        <span className="text-slate-500 ml-auto">
          {confirmed
            ? "Confirmed — still editable. Save to update details."
            : "Open — edit, Save anytime, then Confirm to allocate the reference."}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <IomFormSection title="Employment & site">
          <IomField label="Event date" className="col-span-2">
            <FormDateInput
              value={entryForm.eventDate}
              onChange={(e) => setEntryField("eventDate", e.target.value)}
              compact
            />
          </IomField>
          <IomField label="Site" className="col-span-2">
            <TinySelect
              value={entryForm.siteId}
              onChange={(e) => handleSiteChange(e.target.value)}
            >
              <option value="">Select site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_name}
                </option>
              ))}
            </TinySelect>
          </IomField>
          <IomField label="Site code">
            <TinyInput
              value={entryForm.siteCode}
              onChange={(e) => setEntryField("siteCode", e.target.value.toUpperCase())}
              className="font-mono"
            />
          </IomField>
          <IomField label="Emp code">
            <TinyInput
              value={entryForm.employeeCode}
              onChange={(e) => setEntryField("employeeCode", e.target.value)}
              className="font-mono"
            />
          </IomField>
          <IomField label="Designation">
            <TinyInput
              value={entryForm.designation}
              onChange={(e) => setEntryField("designation", e.target.value)}
            />
          </IomField>
          <IomField label="Salary (gross)">
            <TinyInput
              type="number"
              value={entryForm.salaryAmount}
              onChange={(e) => setEntryField("salaryAmount", e.target.value)}
            />
          </IomField>
          <IomField label="DOJ" className="col-span-2">
            <FormDateInput
              value={entryForm.dateOfJoining}
              onChange={(e) => setEntryField("dateOfJoining", e.target.value)}
              compact
            />
          </IomField>
        </IomFormSection>

        <IomFormSection title="Personal & KYC">
          <IomField label="Name" className="col-span-2">
            <TinyInput
              value={entryForm.employeeName}
              onChange={(e) => setEntryField("employeeName", e.target.value)}
            />
          </IomField>
          <IomField label="Father's name" className="col-span-2">
            <TinyInput
              value={entryForm.fatherName}
              onChange={(e) => setEntryField("fatherName", e.target.value)}
            />
          </IomField>
          <IomField label="Contact no.">
            <TinyInput
              value={entryForm.contactNumber}
              onChange={(e) => setEntryField("contactNumber", e.target.value)}
            />
          </IomField>
          <IomField label="DOB">
            <FormDateInput
              value={entryForm.dateOfBirth}
              onChange={(e) => setEntryField("dateOfBirth", e.target.value)}
              compact
            />
          </IomField>
          <IomField
            label="Aadhaar"
            docLink={
              <ChecklistDocLink
                file={getChecklistItemFile(joiningChecklist.aadhaar)}
                onOpen={onOpenFile}
              />
            }
          >
            <TinyInput
              value={entryForm.aadhaarNo}
              onChange={(e) => setEntryField("aadhaarNo", e.target.value)}
            />
          </IomField>
          <IomField
            label="PAN"
            docLink={
              <ChecklistDocLink file={getChecklistItemFile(joiningChecklist.pan)} onOpen={onOpenFile} />
            }
          >
            <TinyInput
              value={entryForm.panNo}
              onChange={(e) => setEntryField("panNo", e.target.value.toUpperCase())}
            />
          </IomField>
          <IomField label="UAN">
            <TinyInput
              value={entryForm.uanNo}
              onChange={(e) => setEntryField("uanNo", e.target.value)}
            />
          </IomField>
          <IomField label="PF no.">
            <TinyInput
              value={entryForm.pfNo}
              onChange={(e) => setEntryField("pfNo", e.target.value)}
            />
          </IomField>
        </IomFormSection>

        <IomFormSection title="Bank details">
          <IomField
            label="Bank name"
            className="col-span-2"
            docLink={
              <ChecklistDocLink
                file={getChecklistItemFile(joiningChecklist.bankDetails)}
                onOpen={onOpenFile}
              />
            }
          >
            <TinyInput
              value={entryForm.bankName}
              onChange={(e) => setEntryField("bankName", e.target.value)}
            />
          </IomField>
          <IomField label="Account no." className="col-span-2">
            <TinyInput
              value={entryForm.bankAccountNo}
              onChange={(e) => setEntryField("bankAccountNo", e.target.value)}
            />
          </IomField>
          <IomField label="IFSC code" className="col-span-2">
            <TinyInput
              value={entryForm.ifscCode}
              onChange={(e) => setEntryField("ifscCode", e.target.value.toUpperCase())}
            />
          </IomField>
        </IomFormSection>
      </div>

      <IomField label="Remarks">
        <TinyInput
          value={entryForm.remarks}
          onChange={(e) => setEntryField("remarks", e.target.value)}
        />
      </IomField>

      <div className="flex flex-wrap justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => void onSave()}
          className="h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!confirmed ? (
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
            disabled={saving}
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? "Confirming…" : "Confirm"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function CallingMasterIomPage() {
  const [records, setRecords] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [docsRow, setDocsRow] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [entryForm, setEntryForm] = useState(emptyRecruitmentIomEntry());
  const [saving, setSaving] = useState(false);

  const selectedRow = useMemo(
    () => records.find((r) => r.id === selectedId) || null,
    [records, selectedId]
  );
  const confirmed = isIomConfirmed(selectedRow);
  const joiningChecklist = useMemo(
    () => normalizeJoiningChecklist(selectedRow?.joiningChecklist),
    [selectedRow]
  );

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [next, siteRows] = await Promise.all([
        loadIomCandidates(),
        listSites(supabase).catch(() => []),
      ]);
      setRecords(next);
      setSites(siteRows || []);
      // Keep current selection if still present; never auto-open Confirmed (or any row).
      setSelectedId((current) => {
        if (current && next.some((r) => r.id === current)) return current;
        return null;
      });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load IOM entries.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onRecords = () => {
      refresh();
    };
    window.addEventListener(CALLING_MASTER_RECORDS_EVENT, onRecords);
    return () => window.removeEventListener(CALLING_MASTER_RECORDS_EVENT, onRecords);
  }, []);

  const openEntryForRow = (row) => {
    if (!row?.id) return;
    setSelectedId(row.id);
    setEntryForm(buildRecruitmentIomEntryFromCandidate(row, sites));
    setError("");
    setMessage("");
  };

  const closeEntryPanel = () => {
    setSelectedId(null);
    setEntryForm(emptyRecruitmentIomEntry());
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((row) => {
      const locked = isIomConfirmed(row);
      if (statusFilter === "Confirmed" && !locked) return false;
      if (statusFilter === "Open" && locked) return false;
      if (!q) return true;
      const hay = [
        row.candidateName,
        row.designation,
        row.employeeCode,
        row.iomReferenceNo,
        row.siteFullName,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const setEntryField = (key, value) => {
    setEntryForm((current) => ({ ...current, [key]: value }));
  };

  const handleSiteChange = (siteId) => {
    const site = sites.find((s) => String(s.id) === String(siteId));
    setEntryForm((current) => ({
      ...current,
      siteId: siteId || "",
      siteName: site?.site_name || current.siteName,
    }));
  };

  const handleOpenFile = async (file) => {
    const path = callingAttachmentStoragePath(file);
    if (!path) return;
    try {
      const url = await presignCallingMasterR2Get(path);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) setError("Allow pop-ups to open the document in a new tab.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to open document.");
    }
  };

  const handleSaveOpen = async () => {
    if (!selectedRow) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const normalized = normalizeRecruitmentIomEntry(entryForm);
      const saved = await saveIomEntry(selectedRow.id, normalized);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setEntryForm(buildRecruitmentIomEntryFromCandidate(saved, sites));
      setSelectedId(saved.id);
      setMessage(
        isIomConfirmed(saved)
          ? "Saved. Confirmed IOM details updated."
          : "Saved. You can keep editing, then Confirm when ready."
      );
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save IOM entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedRow || confirmed) return;
    const normalized = normalizeRecruitmentIomEntry(entryForm);
    if (!normalized.siteId) {
      setError("Select a site from the master list.");
      return;
    }
    if (!normalized.employeeName) {
      setError("Employee name is required.");
      return;
    }
    if (!normalized.siteCode && !selectedRow.siteCode) {
      setError("Site code is required for the IOM reference number.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await confirmIomEntry({
        ...selectedRow,
        siteCode: normalized.siteCode || selectedRow.siteCode,
        iomEntryPayload: normalized,
      });
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setEntryForm(buildRecruitmentIomEntryFromCandidate(saved, sites));
      setSelectedId(saved.id);
      setMessage("IOM confirmed. You can still edit and Save any details.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to confirm IOM entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = () => {
    setError("");
    try {
      if (!filtered.length) {
        setError("No IOM entries to export.");
        return;
      }
      const exportRows = filtered.map((row) => {
        const entry = buildRecruitmentIomEntryFromCandidate(row, sites);
        return {
          ...entry,
          iomReferenceNo: row.iomReferenceNo || "",
          entryStatus: iomEntryStatusLabel(row),
        };
      });
      downloadRecruitmentIomExcel(exportRows);
      setMessage("Excel downloaded.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to export Excel.");
    }
  };

  const checklistView = useMemo(() => {
    if (!docsRow) return normalizeJoiningChecklist({});
    return normalizeJoiningChecklist(docsRow.joiningChecklist);
  }, [docsRow]);

  const columns = [
    {
      key: "candidateName",
      label: "Candidate",
      widthClassName: "w-[168px] min-w-[168px] max-w-[168px]",
      render: (row) => (
        <button
          type="button"
          className={`block max-w-full truncate text-left font-medium hover:underline ${
            row.id === selectedId ? "text-accent" : "text-accent/90 hover:text-accent"
          }`}
          title={row.candidateName || "—"}
          onClick={(e) => {
            e.stopPropagation();
            openEntryForRow(row);
          }}
        >
          {row.candidateName || "—"}
        </button>
      ),
    },
    {
      key: "designation",
      label: "Designation",
      widthClassName: "w-[140px] min-w-[140px] max-w-[140px]",
      render: (row) => (
        <span className="block truncate" title={row.designation || undefined}>
          {row.designation || "—"}
        </span>
      ),
    },
    {
      key: "employeeCode",
      label: "Emp Code",
      widthClassName: "w-[96px] min-w-[96px] max-w-[96px]",
      render: (row) => row.employeeCode || "—",
    },
    {
      key: "iomReferenceNo",
      label: "IOM Ref",
      widthClassName: "w-[180px] min-w-[180px] max-w-[180px]",
      render: (row) => (
        <span className="block truncate" title={row.iomReferenceNo || undefined}>
          {row.iomReferenceNo || "—"}
        </span>
      ),
    },
    {
      key: "iomStatus",
      label: "Status",
      widthClassName: "w-[100px] min-w-[100px] max-w-[100px]",
      render: (row) => {
        const label = iomEntryStatusLabel(row);
        return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "w-[148px] min-w-[148px] max-w-[148px]",
      cellClassName: "align-middle",
      render: (row) => (
        <CallingActionBar>
          <CallingActionBtn
            icon={Pencil}
            label="Edit"
            tone="accent"
            onClick={() => openEntryForRow(row)}
          />
          <CallingActionBtn
            icon={ClipboardList}
            label="Docs"
            iconOnly
            title="Docs"
            onClick={() => setDocsRow(row)}
          />
        </CallingActionBar>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="IOM"
        subtitle="One entry per candidate after the joining checklist is complete. Confirm allocates the reference and adds the New row to Site Employee IOM. Export the list to Excel when needed."
      >
        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export to Excel
        </button>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <SectionCard title="IOM entries">
        <FilterBar>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Search
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <TinyInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, IOM ref…"
                className="pl-7 w-56"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Open">Open</option>
              <option value="Confirmed">Confirmed</option>
            </TinySelect>
          </label>
        </FilterBar>

        {error && !docsRow ? (
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
              rows={filtered}
              rowKey="id"
              showSerialNumber
              frozenColumnCount={1}
              frozenColumnWidths={[158]}
              density="comfortable"
              onRowClick={(row) => openEntryForRow(row)}
              activeRowId={selectedId}
            />
          )}
        </div>
      </SectionCard>

      {selectedRow ? (
        <SectionCard
          title={
            confirmed
              ? `IOM entry — ${selectedRow.candidateName}`
              : `Open IOM entry — ${selectedRow.candidateName}`
          }
          right={
            <div className="flex items-center gap-2">
              <StatusChip
                label={iomEntryStatusLabel(selectedRow)}
                severity={journeyStatusSeverity(iomEntryStatusLabel(selectedRow))}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                onClick={closeEntryPanel}
                title="Close form"
              >
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </div>
          }
        >
          <IomEntryForm
            entryForm={entryForm}
            setEntryField={setEntryField}
            handleSiteChange={handleSiteChange}
            sites={sites}
            joiningChecklist={joiningChecklist}
            confirmed={confirmed}
            selectedRow={selectedRow}
            onOpenFile={handleOpenFile}
            onSave={handleSaveOpen}
            onConfirm={handleConfirm}
            saving={saving}
          />
        </SectionCard>
      ) : null}

      <Modal
        open={Boolean(docsRow)}
        onClose={() => setDocsRow(null)}
        title={docsRow ? `Pre-joining documents — ${docsRow.candidateName}` : "Checklist"}
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setDocsRow(null)}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
            >
              Close
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-500 mb-3">Documents collected at joining.</p>
        <ul className="space-y-2">
          {JOINING_CHECKLIST_ITEMS.map((item) => {
            const entry = checklistView[item.key] || emptyJoiningChecklistItem();
            const file = entry.file;
            return (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-800">{item.label}</span>
                    <StatusChip
                      label={entry.received ? "Received" : "Pending"}
                      severity={entry.received ? "info" : "warning"}
                    />
                  </div>
                  {file ? (
                    <p
                      className="mt-1 text-[11px] text-slate-500 truncate"
                      title={fileLabelFromCallingAttachment(file)}
                    >
                      {fileLabelFromCallingAttachment(file)}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">No document on file</p>
                  )}
                </div>
                {file ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-accent hover:bg-slate-50"
                    onClick={() => void handleOpenFile(file)}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
