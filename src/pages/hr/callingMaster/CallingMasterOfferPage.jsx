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
import { CALLING_MASTER_RECORDS_EVENT, journeyStatusSeverity } from "./callingMasterConfig";
import { CallingActionBar, CallingActionBtn, CallingActionMenu } from "./CallingTableActions";
import OfferDetailsFields, {
  emptyOfferDetailValues,
  offerDetailsFromCandidate,
} from "./OfferDetailsFields";
import {
  loadSelectedOfferCandidates,
  peekOfferEmployeeCodeSuggestion,
  saveOfferAndAllocateCodes,
  saveSelectedOfferDetails,
} from "./callingMasterStorage";
import { hasOfferLetterBeenGenerated, isReferralCandidate, isValidOfferEmployeeCode, offerResponseLabel } from "./callingMasterApi";

function offerStatusLabel(row) {
  const status = String(row?.offerStatus || "").trim();
  if (status === "Accepted" || status === "Declined" || status === "Expired") return status;
  if (hasOfferLetterBeenGenerated(row) || status === "Generated") return "Generated";
  return "Not Generated";
}

function canDownloadOfferLetter(row) {
  return hasOfferLetterBeenGenerated(row) && Boolean(String(row?.offerReferenceNo || "").trim());
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
  const [sourceFilter, setSourceFilter] = useState("All");
  const [modalMode, setModalMode] = useState(null); // 'view' | 'edit' | null
  const [activeRow, setActiveRow] = useState(null);
  const [form, setForm] = useState(emptyOfferDetailValues());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateRow, setGenerateRow] = useState(null);
  const [generateDetails, setGenerateDetails] = useState(null);
  const [employeeCodeInput, setEmployeeCodeInput] = useState("");
  const [lastUsedCode, setLastUsedCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [peekLoading, setPeekLoading] = useState(false);

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
      if (statusFilter !== "All") {
        if (statusFilter === "Generated") {
          if (status !== "Generated" && offerResponseLabel(row) !== "Awaiting response") return false;
          if (["Accepted", "Declined", "Expired"].includes(status)) return false;
        } else if (status !== statusFilter) {
          return false;
        }
      }
      if (sourceFilter === "Referral" && !isReferralCandidate(row)) return false;
      if (sourceFilter === "Calling" && isReferralCandidate(row)) return false;
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
  }, [records, search, statusFilter, sourceFilter]);

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
      if (!canDownloadOfferLetter(row)) {
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
      if (!canDownloadOfferLetter(row)) {
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

  const closeGenerateModal = () => {
    setGenerateOpen(false);
    setGenerateRow(null);
    setGenerateDetails(null);
    setEmployeeCodeInput("");
    setLastUsedCode("");
    setCodeError("");
    setPeekLoading(false);
  };

  const openGenerateModal = async (row) => {
    setError("");
    setCodeError("");
    const details = offerDetailsFromCandidate(row);
    if (!details.siteCode) {
      details.siteCode = deriveSiteCodeFromName(row.siteSuitable || row.siteFullName);
    }
    const missing = missingOfferFields(details);
    if (missing.length) {
      setError(
        `Offer details incomplete on Selected register. Missing: ${missing.join(", ")}. Open Edit on Selected or Edit here to fill them.`
      );
      return;
    }

    const existing = String(row.employeeCode || "").trim();
    setGenerateRow(row);
    setGenerateDetails(details);
    setGenerateOpen(true);

    if (existing) {
      setEmployeeCodeInput(existing);
      setLastUsedCode("");
      return;
    }

    setPeekLoading(true);
    try {
      const peek = await peekOfferEmployeeCodeSuggestion();
      setLastUsedCode(peek.lastUsed || "");
      setEmployeeCodeInput(peek.suggestedNext || "");
    } catch (err) {
      console.error(err);
      setCodeError(err?.message || "Unable to load employee code suggestion.");
      setEmployeeCodeInput("");
    } finally {
      setPeekLoading(false);
    }
  };

  const validateEmployeeCodeInput = (value, alreadyAssigned) => {
    const code = String(value || "").trim();
    if (alreadyAssigned) return "";
    if (!code) return "Employee code is required.";
    if (!isValidOfferEmployeeCode(code)) {
      return "Employee code must contain only letters and numbers.";
    }
    return "";
  };

  const handleConfirmGenerate = async () => {
    if (!generateRow || !generateDetails) return;
    const alreadyAssigned = Boolean(String(generateRow.employeeCode || "").trim());
    const validationError = validateEmployeeCodeInput(employeeCodeInput, alreadyAssigned);
    if (validationError) {
      setCodeError(validationError);
      return;
    }

    setSaving(true);
    setCodeError("");
    setError("");
    try {
      const saved = await saveOfferAndAllocateCodes({
        ...generateRow,
        ...generateDetails,
        siteCode: String(generateDetails.siteCode || "").trim().toUpperCase(),
        requestedEmployeeCode: alreadyAssigned ? undefined : String(employeeCodeInput).trim(),
      });
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      await downloadOfferLetter(toOfferLetterPayload(saved));
      closeGenerateModal();
    } catch (err) {
      console.error(err);
      const message = err?.message || "Unable to generate offer letter.";
      if (/already taken/i.test(message)) {
        setCodeError(message);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLetter = async (row) => {
    await openGenerateModal(row);
  };

  const columns = [
    {
      key: "candidateName",
      label: "Candidate",
      widthClassName: "w-[168px] min-w-[168px] max-w-[168px]",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-medium" title={row.candidateName || undefined}>
            {row.candidateName || "—"}
          </span>
          {isReferralCandidate(row) ? <StatusChip label="Referral" severity="info" /> : null}
        </span>
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
      key: "siteSuitable",
      label: "Site",
      widthClassName: "w-[156px] min-w-[156px] max-w-[156px]",
      render: (row) => {
        const text = row.siteFullName || row.siteSuitable || "—";
        return (
          <span className="block truncate" title={text === "—" ? undefined : text}>
            {text}
          </span>
        );
      },
    },
    {
      key: "salaryGross",
      label: "Gross Salary",
      widthClassName: "w-[110px] min-w-[110px] max-w-[110px]",
      render: (row) => (row.salaryGross === "" || row.salaryGross == null ? "—" : row.salaryGross),
    },
    {
      key: "employeeCode",
      label: "Emp Code",
      widthClassName: "w-[96px] min-w-[96px] max-w-[96px]",
      render: (row) => row.employeeCode || "—",
    },
    {
      key: "offerReferenceNo",
      label: "Reference No",
      widthClassName: "w-[180px] min-w-[180px] max-w-[180px]",
      render: (row) => (
        <span className="block truncate" title={row.offerReferenceNo || undefined}>
          {row.offerReferenceNo || "—"}
        </span>
      ),
    },
    {
      key: "offerStatus",
      label: "Offer Status",
      widthClassName: "w-[140px] min-w-[140px] max-w-[140px]",
      render: (row) => {
        const status = offerStatusLabel(row);
        const response = offerResponseLabel(row);
        const label =
          status === "Accepted" || status === "Declined" || status === "Expired"
            ? status
            : status === "Generated"
              ? response
              : status;
        return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
      },
    },
    {
      key: "actions",
      label: "Actions",
      widthClassName: "w-[248px] min-w-[248px] max-w-[248px]",
      cellClassName: "align-middle",
      render: (row) => {
        const generated = canDownloadOfferLetter(row);
        return (
          <CallingActionBar>
            <CallingActionBtn icon={Eye} label="View" iconOnly onClick={() => openModal(row, "view")} />
            <CallingActionBtn icon={Edit3} label="Edit" iconOnly onClick={() => openModal(row, "edit")} />
            <CallingActionBtn
              icon={FileText}
              label={generated ? "Regenerate" : "Generate"}
              tone="accent"
              disabled={saving}
              onClick={() => void handleGenerateLetter(row)}
            />
            <CallingActionMenu
              items={[
                {
                  key: "print",
                  label: "Print",
                  icon: Printer,
                  disabled: !generated,
                  onClick: () => handlePreview(row),
                },
                {
                  key: "download",
                  label: "Download",
                  icon: Download,
                  disabled: !generated,
                  onClick: () => void handleDownload(row),
                },
              ]}
            />
          </CallingActionBar>
        );
      },
    },
  ];

  const isView = modalMode === "view";
  const isEdit = modalMode === "edit";
  const generateAlreadyAssigned = Boolean(String(generateRow?.employeeCode || "").trim());

  return (
    <div className="space-y-4">
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
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
              <option value="Expired">Expired</option>
            </TinySelect>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Source
            <TinySelect value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Calling">Calling</option>
              <option value="Referral">Referral</option>
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
              frozenColumnWidths={[168]}
              density="comfortable"
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

      <Modal
        open={generateOpen}
        onClose={closeGenerateModal}
        title={
          generateRow
            ? `Generate offer — ${generateRow.candidateName}`
            : "Generate offer"
        }
        widthClass="max-w-md"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closeGenerateModal}
              className="h-8 px-3 text-xs rounded border border-slate-300 bg-white"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmGenerate()}
              className="h-8 px-3 text-xs rounded bg-accent text-white disabled:opacity-50"
              disabled={saving || peekLoading}
            >
              {saving ? "Generating…" : "Confirm & generate"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {codeError ? (
            <p className="text-red-600" role="alert">
              {codeError}
            </p>
          ) : null}

          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
            <p className="font-medium text-slate-900">{generateRow?.candidateName || "—"}</p>
            <p>Designation: {generateDetails?.designation || "—"}</p>
            <p>Site: {generateDetails?.siteFullName || generateRow?.siteSuitable || "—"}</p>
          </div>

          {generateAlreadyAssigned ? (
            <p className="text-slate-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Already assigned — editing will not change the code unless you clear it from the database.
            </p>
          ) : lastUsedCode ? (
            <p className="text-slate-500">
              Last used code: <span className="font-mono text-slate-800">{lastUsedCode}</span>
            </p>
          ) : peekLoading ? (
            <p className="text-slate-500">Loading code suggestion…</p>
          ) : (
            <p className="text-slate-500">No employee code has been assigned yet.</p>
          )}

          <label className="flex flex-col gap-1 text-slate-600">
            Employee Code
            <TinyInput
              value={employeeCodeInput}
              onChange={(e) => {
                setEmployeeCodeInput(e.target.value);
                setCodeError("");
              }}
              disabled={generateAlreadyAssigned || peekLoading}
              placeholder="e.g. 9976"
              className="font-mono"
            />
            {!generateAlreadyAssigned ? (
              <span className="text-[10px] text-slate-500">
                Suggested next code is pre-filled. You can edit it before generating.
              </span>
            ) : null}
          </label>
        </div>
      </Modal>
    </div>
  );
}
