import React, { useEffect, useMemo, useState } from "react";
import {
  Download,
  Edit3,
  Eye,
  FileText,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  deriveSiteCodeFromName,
  downloadOfferLetter,
  openOfferLetterPrintPreview,
} from "../../../lib/offerLetterDocuments";
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
import { CALLING_MASTER_RECORDS_EVENT } from "./callingMasterConfig";
import OfferDetailsFields, {
  emptyOfferDetailValues,
  offerDetailsFromCandidate,
} from "./OfferDetailsFields";
import {
  loadSelectedOfferCandidates,
  saveOfferAndAllocateCodes,
  saveSelectedOfferDetails,
} from "./callingMasterStorage";

function offerStatusLabel(row) {
  return String(row?.offerStatus || "").trim() === "Generated" ? "Generated" : "Not Generated";
}

function missingOfferFields(source) {
  const missing = [];
  if (!String(source.fatherName || "").trim()) missing.push("Father's Name");
  if (!String(source.addressLine || "").trim()) missing.push("Address");
  if (!String(source.addressDistrict || "").trim()) missing.push("District");
  if (!String(source.addressState || "").trim()) missing.push("State");
  if (!String(source.addressPincode || "").trim()) missing.push("Pincode");
  if (!source.joiningDate) missing.push("Date of Joining");
  if (!String(source.dutyPattern || "").trim()) missing.push("Duty Pattern");
  if (!String(source.siteFullName || "").trim()) missing.push("Site Name & Location");
  if (!String(source.siteCode || "").trim()) missing.push("Site Code");
  if (!String(source.designation || "").trim()) missing.push("Designation");
  if (source.salaryGross === "" || source.salaryGross == null) missing.push("Gross Salary");
  return missing;
}

function toOfferLetterPayload(row) {
  return {
    referenceNo: row.offerReferenceNo,
    offerDate: new Date().toISOString().slice(0, 10),
    salutation: row.offerSalutation || "Mr.",
    candidateName: row.candidateName,
    fatherName: row.fatherName,
    employeeCode: row.employeeCode,
    addressLine: row.addressLine,
    addressDistrict: row.addressDistrict,
    addressState: row.addressState,
    addressPincode: row.addressPincode,
    designation: row.designation,
    joiningDate: row.joiningDate,
    siteFullName: row.siteFullName,
    salaryGross: row.salaryGross,
    dutyPattern: row.dutyPattern,
  };
}

export default function CallingMasterOfferPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modalMode, setModalMode] = useState(null); // 'view' | 'edit' | null
  const [activeRow, setActiveRow] = useState(null);
  const [form, setForm] = useState(emptyOfferDetailValues());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadSelectedOfferCandidates();
      setRecords(next);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load selected candidates.");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((row) => {
      const status = offerStatusLabel(row);
      if (statusFilter !== "All" && status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.candidateName,
        row.designation,
        row.siteSuitable,
        row.siteFullName,
        row.employeeCode,
        row.offerReferenceNo,
        row.phoneNumber,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  const openModal = (row, mode) => {
    const details = offerDetailsFromCandidate(row);
    if (!details.siteCode) {
      details.siteCode = deriveSiteCodeFromName(row.siteSuitable || row.siteFullName);
    }
    setActiveRow(row);
    setForm(details);
    setFormError("");
    setModalMode(mode);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveRow(null);
    setForm(emptyOfferDetailValues());
    setFormError("");
  };

  const handleFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleDownload = async (row) => {
    setError("");
    try {
      if (offerStatusLabel(row) !== "Generated") {
        throw new Error("Generate the offer letter first.");
      }
      await downloadOfferLetter(toOfferLetterPayload(row));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to download offer letter.");
    }
  };

  const handlePreview = (row) => {
    setError("");
    try {
      if (offerStatusLabel(row) !== "Generated") {
        throw new Error("Generate the offer letter first.");
      }
      openOfferLetterPrintPreview(toOfferLetterPayload(row));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to preview offer letter.");
    }
  };

  const handleSaveEdit = async () => {
    if (!activeRow) return;
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...activeRow,
        ...form,
        siteCode: String(form.siteCode || "").trim().toUpperCase(),
      };
      const saved = await saveSelectedOfferDetails(payload);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      closeModal();
    } catch (err) {
      console.error(err);
      setFormError(err?.message || "Unable to save offer details.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLetter = async (row) => {
    setError("");
    setSaving(true);
    try {
      const details = offerDetailsFromCandidate(row);
      if (!details.siteCode) {
        details.siteCode = deriveSiteCodeFromName(row.siteSuitable || row.siteFullName);
      }
      const missing = missingOfferFields(details);
      if (missing.length) {
        throw new Error(
          `Offer details incomplete on Selected register. Missing: ${missing.join(", ")}. Open Edit on Selected or Edit here to fill them.`
        );
      }
      const saved = await saveOfferAndAllocateCodes({
        ...row,
        ...details,
        siteCode: String(details.siteCode || "").trim().toUpperCase(),
      });
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      await downloadOfferLetter(toOfferLetterPayload(saved));
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to generate offer letter.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "candidateName", label: "Candidate", widthClassName: "min-w-[160px]" },
    { key: "designation", label: "Designation", widthClassName: "min-w-[130px]" },
    {
      key: "siteSuitable",
      label: "Site",
      widthClassName: "min-w-[140px]",
      render: (row) => row.siteFullName || row.siteSuitable || "—",
    },
    {
      key: "salaryGross",
      label: "Gross Salary",
      widthClassName: "min-w-[110px]",
      render: (row) => (row.salaryGross === "" || row.salaryGross == null ? "—" : row.salaryGross),
    },
    {
      key: "employeeCode",
      label: "Emp Code",
      widthClassName: "min-w-[90px]",
      render: (row) => row.employeeCode || "—",
    },
    {
      key: "offerReferenceNo",
      label: "Reference No",
      widthClassName: "min-w-[180px]",
      render: (row) => row.offerReferenceNo || "—",
    },
    {
      key: "offerStatus",
      label: "Offer Status",
      widthClassName: "min-w-[120px]",
      render: (row) => {
        const status = offerStatusLabel(row);
        return (
          <StatusChip label={status} severity={status === "Generated" ? "info" : "warning"} />
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "min-w-[320px]",
      render: (row) => {
        const generated = offerStatusLabel(row) === "Generated";
        return (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                openModal(row, "view");
              }}
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                openModal(row, "edit");
              }}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              type="button"
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-accent text-accent hover:bg-accent/5 disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                void handleGenerateLetter(row);
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              {generated ? "Regenerate" : "Generate letter"}
            </button>
            <button
              type="button"
              disabled={!generated}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(row);
              }}
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              type="button"
              disabled={!generated}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700 disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(row);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        );
      },
    },
  ];

  const isView = modalMode === "view";
  const isEdit = modalMode === "edit";

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full min-h-0 space-y-4">
      <PageTaskHeader
        title="Offer Generation"
        subtitle="View or edit offer details for Selected candidates, then generate the Word letter. Enter new offer fields on Candidates → Selected."
      >
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <SectionCard title="Selected candidates">
        <FilterBar>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Search
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <TinyInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, site, code…"
                className="pl-7 w-56"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Offer status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Not Generated">Not Generated</option>
              <option value="Generated">Generated</option>
            </TinySelect>
          </label>
        </FilterBar>

        {error ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {error}
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
              frozenColumnWidths={[160]}
            />
          )}
        </div>
      </SectionCard>

      <Modal
        open={Boolean(modalMode)}
        onClose={closeModal}
        title={
          activeRow
            ? `${isView ? "View" : "Edit"} offer — ${activeRow.candidateName}`
            : "Offer details"
        }
        widthClass="max-w-2xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              disabled={saving}
            >
              {isView ? "Close" : "Cancel"}
            </button>
            {isEdit ? (
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save details"}
              </button>
            ) : null}
            {isView && activeRow ? (
              <button
                type="button"
                onClick={() => openModal(activeRow, "edit")}
                className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              >
                Edit
              </button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3">
          {formError ? (
            <p className="text-xs text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
          {activeRow?.employeeCode || activeRow?.offerReferenceNo ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 font-mono">
              {activeRow.employeeCode ? <div>Emp Code: {activeRow.employeeCode}</div> : null}
              {activeRow.offerReferenceNo ? <div>Ref: {activeRow.offerReferenceNo}</div> : null}
            </div>
          ) : null}
          <OfferDetailsFields
            values={form}
            onChange={handleFieldChange}
            readOnly={isView}
            showRegisterSummary
            candidateName={activeRow?.candidateName}
            siteSuitable={activeRow?.siteSuitable}
          />
        </div>
      </Modal>
    </div>
  );
}
