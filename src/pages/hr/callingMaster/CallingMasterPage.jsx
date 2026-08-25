import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Edit3,
  Eye,
  FileSpreadsheet,
  Filter,
  ListChecks,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import FormDateInput from "../../../components/FormDateInput";
import {
  callingAttachmentStoragePath,
  fileLabelFromCallingAttachment,
  presignCallingMasterR2Get,
  uploadCallingMasterFileToR2,
} from "../../../lib/callingMasterR2";
import {
  DenseTable,
  FilterBar,
  Modal,
  PageTaskHeader,
  SectionCard,
  StatusChip,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import {
  CALLING_MASTER_EXPORT_HEADERS,
  CALLING_MASTER_FIELDS,
  CALLING_MASTER_FILTER_KEYS,
  CALLING_MASTER_SEARCH_KEYS,
  CALLING_MASTER_TABLE_COLUMNS,
  CALLING_PIPELINE_TABS,
  journeyStatusSeverity,
} from "./callingMasterConfig";
import { isReferralCandidate, normalizePipelineStatus, offerResponseLabel } from "./callingMasterApi";
import {
  deleteCallingMasterRecords,
  loadCallingMasterRecords,
  saveSelectedOfferDetails,
  updateCallingMasterPipelineStatus,
  upsertCallingMasterRecord,
} from "./callingMasterStorage";
import { useCallingMasterDropdowns } from "./useCallingMasterDropdowns";
import OfferDetailsFields, { emptyOfferDetailValues } from "./OfferDetailsFields";
import { CallingActionBar, CallingActionBtn, CallingActionHint } from "./CallingTableActions";
import { deriveSiteCodeFromName } from "../../../lib/offerLetterDocuments";
import { pushToast } from "../../../lib/toast";

const ACTION_COLUMN_WIDTH = {
  Calling: 120,
  Shortlisted: 248,
  Selected: 168,
};

const FROZEN_DATA_WIDTHS = [104, 118, 168]; // Date, Calling By, Candidate Name

function TruncateText({ value, empty = "—" }) {
  const text = value == null || value === "" ? "" : String(value);
  if (!text) return <span className="text-slate-400">{empty}</span>;
  return (
    <span className="block max-w-full truncate" title={text}>
      {text}
    </span>
  );
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const EMPTY_FILTERS = {
  callDate: "",
  callingBy: "",
  homeState: "",
  workingState: "",
  fireCourse: "",
  industryWorked: "",
  siteSuitable: "",
  currentlyWorking: "",
};

const NUMERIC_FIELD_RULES = {
  yearCompleted: { label: "Year Completed", allowDecimal: false, min: 1950, max: 2100 },
  heightCm: { label: "Height", allowDecimal: false, min: 1, max: 300 },
  weightKg: { label: "Weight", allowDecimal: true, min: 0, max: 500 },
  salaryGross: { label: "Salary", allowDecimal: true, min: 0, max: 1000000 },
  totalExperience: { label: "Experience", allowDecimal: true, min: 0, max: 60 },
  drivingLicenseYear: { label: "Driving License Year", allowDecimal: false, min: 1950, max: 2100 },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyFormValues() {
  return {
    id: "",
    callDate: todayIso(),
    callingBy: "",
    candidateName: "",
    phoneNumber: "",
    cvSubmitted: "",
    academicQualification: "",
    fireCourse: "",
    yearCompleted: "",
    heightCm: "",
    weightKg: "",
    homeState: "",
    homeTown: "",
    currentlyWorking: "",
    designation: "",
    company: "",
    workingState: "",
    contractor: "",
    industryWorked: "",
    salaryGross: "",
    facilitiesProvided: "",
    totalExperience: "",
    hmvLmv: "",
    drivingLicenseYear: "",
    remarks: "",
    siteSuitable: "",
    attachments: [],
    hiringStatus: "Calling",
    ...emptyOfferDetailValues(),
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDateDisplay(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatNumberDisplay(value) {
  if (value == null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : value;
}

function matchesSearch(record, search) {
  if (!search.trim()) return true;
  const query = normalizeText(search);
  return CALLING_MASTER_SEARCH_KEYS.some((key) => normalizeText(record[key]).includes(query));
}

function matchesFilters(record, filters) {
  return CALLING_MASTER_FILTER_KEYS.every((key) => {
    const wanted = normalizeText(filters[key]);
    if (!wanted) return true;
    if (key === "callDate") return String(record[key] || "") === filters[key];
    return normalizeText(record[key]) === wanted;
  });
}

function compareValues(a, b) {
  const left = a ?? "";
  const right = b ?? "";
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (left !== "" && right !== "" && Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    return leftNum - rightNum;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function sortRows(rows, sortConfig) {
  const next = [...rows];
  next.sort((a, b) => {
    const result = compareValues(a[sortConfig.key], b[sortConfig.key]);
    return sortConfig.direction === "asc" ? result : -result;
  });
  return next;
}

function buildExportRows(rows) {
  return rows.map((row) => {
    const exportRow = {};
    CALLING_MASTER_EXPORT_HEADERS.forEach(({ key, label }) => {
      if (key === "attachments") {
        const files = Array.isArray(row.attachments) ? row.attachments : [];
        exportRow[label] = files
          .map((item) => callingAttachmentStoragePath(item) || fileLabelFromCallingAttachment(item))
          .filter(Boolean)
          .join("; ");
        return;
      }
      exportRow[label] = row[key] ?? "";
    });
    return exportRow;
  });
}

function validateCallingMasterForm(values, existingRows) {
  const errors = {};
  const cleanPhone = String(values.phoneNumber || "").replace(/\D/g, "");

  if (!values.candidateName.trim()) errors.candidateName = "Candidate name is required.";
  if (!cleanPhone) errors.phoneNumber = "Mobile number is required.";
  else if (!/^\d{10}$/.test(cleanPhone)) errors.phoneNumber = "Mobile number must be exactly 10 digits.";

  const heightRaw = String(values.heightCm || "").trim();
  if (heightRaw) {
    if (!/^\d+$/.test(heightRaw)) {
      errors.heightCm = "Height must be a whole number (no decimals).";
    }
  }
  const duplicate = existingRows.find(
    (row) => String(row.id) !== String(values.id) && String(row.phoneNumber || "").replace(/\D/g, "") === cleanPhone
  );
  if (duplicate) {
    errors.phoneNumber = "This mobile number already exists in Calling Master.";
  }

  Object.entries(NUMERIC_FIELD_RULES).forEach(([key, rule]) => {
    const raw = String(values[key] || "").trim();
    if (!raw) return;
    const pattern = rule.allowDecimal ? /^\d+(\.\d+)?$/ : /^\d+$/;
    if (!pattern.test(raw)) {
      errors[key] = `${rule.label} must be numeric.`;
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      errors[key] = `${rule.label} must be numeric.`;
      return;
    }
    if (rule.min != null && numeric < rule.min) {
      errors[key] = `${rule.label} must be ${rule.min} or more.`;
      return;
    }
    if (rule.max != null && numeric > rule.max) {
      errors[key] = `${rule.label} must be ${rule.max} or less.`;
    }
  });

  return errors;
}

function FormField({ field, value, error, onChange, selectOptions }) {
  const options = selectOptions?.[field.optionsKey] || [];
  const inputClassName = `box-border h-10 w-full min-w-0 rounded-lg border px-3 text-sm shadow-sm focus:outline-none focus:ring-2 ${
    error ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:ring-blue-100"
  }`;

  let control = null;
  if (field.type === "date") {
    control = (
      <FormDateInput
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        className={inputClassName}
      />
    );
  } else if (field.type === "select") {
    control = (
      <select
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        className={`${inputClassName} bg-white`}
      >
        <option value="">{field.placeholder || `Select ${field.label}`}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "textarea") {
    control = (
      <textarea
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        placeholder={field.placeholder}
        rows={4}
        className={`box-border w-full min-w-0 rounded-lg border px-3 py-2.5 text-sm shadow-sm resize-y focus:outline-none focus:ring-2 ${
          error ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:ring-blue-100"
        }`}
      />
    );
  } else {
    const integerOnly = field.key === "heightCm" || field.key === "yearCompleted" || field.key === "drivingLicenseYear" || field.key === "phoneNumber";
    control = (
      <input
        type={field.type === "number" || integerOnly ? "text" : field.type}
        inputMode={field.type === "number" || integerOnly || field.key === "phoneNumber" ? "numeric" : undefined}
        value={value}
        maxLength={field.maxLength}
        onChange={(event) => {
          let next = event.target.value;
          if (field.key === "phoneNumber") next = String(next || "").replace(/\D/g, "").slice(0, 10);
          else if (field.key === "heightCm") next = String(next || "").replace(/[^\d]/g, "").slice(0, 3);
          onChange(field.key, next);
        }}
        placeholder={field.placeholder}
        className={inputClassName}
      />
    );
  }

  return (
    <label className={`flex min-w-0 flex-col ${field.fullWidth ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <span className="mb-1.5 block truncate text-xs font-medium text-slate-700" title={field.label}>
        {field.label}
        {field.required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {control}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-20 rounded-card border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="rounded-card border border-slate-200 bg-white p-4">
        <div className="mb-4 h-10 rounded-lg bg-slate-100" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-12 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CallingMasterPage() {
  const { options: selectOptions } = useCallingMasterDropdowns();
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortConfig, setSortConfig] = useState({ key: "callDate", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [formValues, setFormValues] = useState(createEmptyFormValues());
  const [formErrors, setFormErrors] = useState({});
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [pipelineTab, setPipelineTab] = useState("Calling");
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const loadRecords = (showLoader = true) => {
    if (showLoader) setLoading(true);
    loadCallingMasterRecords()
      .then((next) => {
        setRecords(next);
      })
      .catch((err) => {
        setRecords([]);
        pushToast("Unable to load candidates", err.message || "Please try again.", "warning");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRecords(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageRecords = useMemo(() => {
    // Calling is the master register — shortlisted / selected / rejected rows stay visible here.
    if (pipelineTab === "Calling") return records;
    return records.filter((record) => normalizePipelineStatus(record.hiringStatus) === pipelineTab);
  }, [records, pipelineTab]);

  const filteredRows = useMemo(() => {
    const searched = stageRecords.filter((record) => matchesSearch(record, search));
    const filtered = searched.filter((record) => matchesFilters(record, filters));
    const sourced = filtered.filter((record) => {
      if (sourceFilter === "Referral") return isReferralCandidate(record);
      if (sourceFilter === "Calling") return !isReferralCandidate(record);
      return true;
    });
    return sortRows(sourced, sortConfig);
  }, [stageRecords, search, filters, sortConfig, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [pipelineTab]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const summary = useMemo(() => {
    const workingCount = stageRecords.filter((row) => row.currentlyWorking === "Yes").length;
    const immediateCount = stageRecords.filter((row) => row.siteSuitable === "Immediate").length;
    const cvSubmittedCount = stageRecords.filter((row) => row.cvSubmitted === "Yes").length;
    const uniqueStates = new Set(stageRecords.map((row) => row.homeState).filter(Boolean)).size;
    const summaryLabel =
      pipelineTab === "Shortlisted"
        ? "Shortlisted"
        : pipelineTab === "Selected"
          ? "Selected"
          : "Calling records";
    return [
      { label: `Total ${summaryLabel}`, value: stageRecords.length, sub: `${pipelineTab} register` },
      { label: "Currently Working", value: workingCount, sub: "Useful for fast screening" },
      { label: "CV Submitted", value: cvSubmittedCount, sub: "Ready for recruiter review" },
      { label: "Immediate Fit", value: immediateCount, sub: `${uniqueStates} home states covered` },
    ];
  }, [stageRecords, pipelineTab]);

  const hasFiltersApplied = Boolean(search.trim() || Object.values(filters).some(Boolean));
  const noResults = !loading && stageRecords.length > 0 && filteredRows.length === 0;
  const emptyState = !loading && stageRecords.length === 0;

  const registerTitle =
    pipelineTab === "Shortlisted"
      ? "Shortlisted Register"
      : pipelineTab === "Selected"
        ? "Selected Register"
        : "Calling Register";

  const pageTitle =
    pipelineTab === "Shortlisted" ? "Shortlisted" : pipelineTab === "Selected" ? "Selected" : "Calling";

  const pageSubtitle =
    pipelineTab === "Shortlisted"
      ? "Shortlisted from Calling. Choose Selected or Rejected for each record."
      : pipelineTab === "Selected"
        ? "Candidates marked Selected from the Shortlisted register. Enter offer letter details here (Edit), then use Offer Generation to view, edit, or download the letter."
        : "Master calling register. Shortlisted records remain here as well.";

  const emptyTitle =
    pipelineTab === "Shortlisted"
      ? "No shortlisted candidates yet"
      : pipelineTab === "Selected"
        ? "No selected candidates yet"
        : "No calling records yet";

  const emptyMessage =
    pipelineTab === "Shortlisted"
      ? "Use Shortlist on the Calling register to add candidates here. They also remain in Calling."
      : pipelineTab === "Selected"
        ? "Use Selected on the Shortlisted register to move candidates here."
        : "Start by adding your first calling record from today’s screening sheet.";

  const resetForm = () => {
    setFormValues(createEmptyFormValues());
    setFormErrors({});
    setFormMode("create");
    setPendingFiles([]);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (row) => {
    if (!row?.id) return;
    setFormMode("edit");
    const merged = {
      ...createEmptyFormValues(),
      ...row,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
    };
    if (pipelineTab === "Selected" || normalizePipelineStatus(row.hiringStatus) === "Selected") {
      merged.dutyPattern = merged.dutyPattern || "26";
      merged.siteFullName = merged.siteFullName || merged.siteSuitable || "";
      merged.siteCode =
        merged.siteCode || deriveSiteCodeFromName(merged.siteSuitable || merged.siteFullName);
      merged.addressState = merged.addressState || merged.homeState || "";
      merged.offerSalutation = merged.offerSalutation || "Mr.";
    }
    setFormValues(merged);
    setFormErrors({});
    setPendingFiles([]);
    setFormOpen(true);
  };

  const openDelete = (row, event) => {
    event?.stopPropagation?.();
    if (!row?.id) return;
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const openFilesPreview = async (row, event) => {
    event?.stopPropagation?.();
    const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
    if (!attachments.length) {
      pushToast("No files", "This candidate has no uploaded files yet.", "warning");
      return;
    }
    let openedAny = false;
    for (const attachment of attachments) {
      const path = callingAttachmentStoragePath(attachment);
      if (!path) continue;
      try {
        const url = await presignCallingMasterR2Get(path);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          pushToast("Open blocked", "Allow pop-ups to open the file in a new tab.", "warning");
          return;
        }
        openedAny = true;
      } catch (err) {
        pushToast("Open failed", err.message || "Unable to open file.", "warning");
      }
    }
    if (!openedAny) {
      pushToast("Open failed", "File path is missing.", "warning");
    }
  };

  const handlePipelineStatusChange = async (row, nextStatus, event) => {
    event?.stopPropagation?.();
    if (!row?.id) return;
    try {
      setStatusUpdatingId(row.id);
      await updateCallingMasterPipelineStatus(row.id, nextStatus);
      await loadRecords(false);
      const toastTitle =
        nextStatus === "Selected"
          ? "Moved to Selected"
          : nextStatus === "Rejected"
            ? "Marked Rejected"
            : "Marked Shortlisted";
      const toastMessage =
        nextStatus === "Selected"
          ? `${row.candidateName || "Candidate"} is now in Selected.`
          : nextStatus === "Rejected"
            ? `${row.candidateName || "Candidate"} left Shortlisted and remains in Calling.`
            : `${row.candidateName || "Candidate"} is shortlisted and still listed in Calling.`;
      pushToast(toastTitle, toastMessage, "success");
    } catch (err) {
      pushToast("Status update failed", err.message || "Unable to update status.", "warning");
    } finally {
      setStatusUpdatingId("");
    }
  };

  const toggleSort = (key) => {
    setSortConfig((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const desktopColumns = useMemo(() => {
    const actionWidthClass =
      pipelineTab === "Shortlisted"
        ? "w-[248px] min-w-[248px] max-w-[248px]"
        : pipelineTab === "Selected"
          ? "w-[168px] min-w-[168px] max-w-[168px]"
          : "w-[120px] min-w-[120px] max-w-[120px]";

    const actionColumn = {
      key: "__rowActions",
      label: "Actions",
      headerClassName: actionWidthClass,
      cellClassName: actionWidthClass,
      render: (row) => {
        const busy = statusUpdatingId === row.id;
        const status = normalizePipelineStatus(row.hiringStatus);

        return (
          <CallingActionBar edge="start">
            <CallingActionBtn
              icon={Edit3}
              label="Edit"
              iconOnly
              onClick={() => openEdit(row)}
            />
            <CallingActionBtn
              icon={Trash2}
              label="Delete"
              iconOnly
              tone="danger"
              onClick={(event) => openDelete(row, event)}
            />

            {pipelineTab === "Selected" ? (
              (() => {
                const label = offerResponseLabel(row);
                if (label === "Not Generated") return null;
                return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
              })()
            ) : null}

            {pipelineTab === "Calling" ? (
              status === "Calling" || status === "Rejected" ? (
                <CallingActionBtn
                  icon={ListChecks}
                  label="Shortlist"
                  iconOnly
                  title="Mark Shortlisted"
                  disabled={busy}
                  onClick={(event) => void handlePipelineStatusChange(row, "Shortlisted", event)}
                />
              ) : (
                <CallingActionHint>{status}</CallingActionHint>
              )
            ) : null}

            {pipelineTab === "Shortlisted" ? (
              <>
                <CallingActionBtn
                  icon={UserCheck}
                  label="Selected"
                  tone="success"
                  disabled={busy}
                  onClick={(event) => void handlePipelineStatusChange(row, "Selected", event)}
                />
                <CallingActionBtn
                  icon={UserX}
                  label="Rejected"
                  tone="danger"
                  disabled={busy}
                  onClick={(event) => void handlePipelineStatusChange(row, "Rejected", event)}
                />
              </>
            ) : null}
          </CallingActionBar>
        );
      },
    };

    const dataColumns = CALLING_MASTER_TABLE_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      headerClassName: column.widthClassName,
      cellClassName: column.widthClassName,
      headerRender: () => (
        <button
          type="button"
          onClick={() => toggleSort(column.key)}
          className="inline-flex max-w-full items-center gap-1 text-left"
          title={column.label}
        >
          <span className="truncate">{column.label}</span>
          <span className="shrink-0 text-[10px] text-slate-400">
            {sortConfig.key === column.key ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      ),
      render: (row) => {
        if (column.key === "candidateName") {
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate">{row.candidateName || "—"}</span>
              {isReferralCandidate(row) ? <StatusChip label="Referral" severity="info" /> : null}
            </span>
          );
        }
        if (column.key === "callDate") return formatDateDisplay(row.callDate);
        if (column.key === "cvSubmitted") {
          return (
            <StatusChip
              label={row.cvSubmitted || "Pending"}
              severity={row.cvSubmitted === "Yes" ? "info" : "warning"}
            />
          );
        }
        if (column.key === "currentlyWorking") {
          return (
            <StatusChip
              label={row.currentlyWorking || "Unknown"}
              severity={row.currentlyWorking === "Yes" ? "info" : "warning"}
            />
          );
        }
        if (column.key === "siteSuitable") {
          const severity =
            row.siteSuitable === "Immediate"
              ? "info"
              : row.siteSuitable === "Not suitable"
                ? "critical"
                : "warning";
          return <StatusChip label={row.siteSuitable || "Review"} severity={severity} />;
        }
        if (column.key === "attachments") {
          const count = Array.isArray(row.attachments) ? row.attachments.length : 0;
          if (!count) return <span className="text-slate-400">—</span>;
          return (
            <button
              type="button"
              onClick={(event) => openFilesPreview(row, event)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent"
              title={`Preview ${count} file(s)`}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{count}</span>
            </button>
          );
        }
        if (["salaryGross", "heightCm", "weightKg", "totalExperience"].includes(column.key)) {
          return formatNumberDisplay(row[column.key]);
        }
        return <TruncateText value={row[column.key]} />;
      },
    }));
    return [actionColumn, ...dataColumns];
  }, [pipelineTab, sortConfig, statusUpdatingId]);

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setSourceFilter("All");
    setPage(1);
  };

  const handleFormValueChange = (key, value) => {
    if (key === "phoneNumber") {
      value = String(value || "").replace(/\D/g, "").slice(0, 10);
    }
    if (key === "heightCm") {
      value = String(value || "").replace(/[^\d]/g, "").slice(0, 3);
    }
    setFormValues((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextValues = {
      ...formValues,
      phoneNumber: String(formValues.phoneNumber || "").replace(/\D/g, ""),
      heightCm: String(formValues.heightCm || "").replace(/[^\d]/g, ""),
    };
    const errors = validateCallingMasterForm(nextValues, records);
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      pushToast("Form validation pending", "Please correct the highlighted fields.", "warning");
      return;
    }

    try {
      setUploadingFiles(true);
      const candidateKey = nextValues.id || nextValues.phoneNumber || `draft-${Date.now()}`;
      const uploaded = [];
      for (const file of pendingFiles) {
        const result = await uploadCallingMasterFileToR2({ file, candidateKey });
        const storagePath = result.filePath || result.objectKey;
        uploaded.push({
          filePath: storagePath,
          objectKey: storagePath,
          bucket: result.bucket || "indus-erp-uploads",
          fileName: result.fileName || file.name,
          contentType: result.contentType || file.type || "",
          uploadedAt: new Date().toISOString(),
        });
      }

      const saved = await upsertCallingMasterRecord({
        ...nextValues,
        hiringStatus: normalizePipelineStatus(nextValues.hiringStatus),
        attachments: [...(Array.isArray(nextValues.attachments) ? nextValues.attachments : []), ...uploaded],
      });

      const isSelectedContext =
        pipelineTab === "Selected" || normalizePipelineStatus(saved.hiringStatus) === "Selected";
      if (isSelectedContext && formMode === "edit") {
        await saveSelectedOfferDetails({
          id: saved.id,
          offerSalutation: nextValues.offerSalutation,
          fatherName: nextValues.fatherName,
          addressLine: nextValues.addressLine,
          addressDistrict: nextValues.addressDistrict,
          addressState: nextValues.addressState,
          addressPincode: nextValues.addressPincode,
          joiningDate: nextValues.joiningDate,
          dutyPattern: nextValues.dutyPattern,
          siteFullName: nextValues.siteFullName,
          siteCode: nextValues.siteCode,
          designation: nextValues.designation,
          salaryGross: nextValues.salaryGross,
        });
        await loadRecords(false);
      } else {
        await loadRecords(false);
      }

      setFormOpen(false);
      setPendingFiles([]);
      pushToast(
        formMode === "edit" ? "Calling record updated" : "Calling record added",
        isSelectedContext && formMode === "edit"
          ? `${saved.candidateName} offer details saved on Selected.`
          : `${saved.candidateName} is ready in Calling.`,
        "success"
      );
    } catch (err) {
      if (/already exists|mobile number/i.test(err.message || "")) {
        setFormErrors((current) => ({ ...current, phoneNumber: err.message }));
      }
      pushToast("Save failed", err.message || "Unable to save candidate.", "warning");
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    const name = deleteTarget.candidateName || "Candidate";
    try {
      await deleteCallingMasterRecords([deleteTarget.id]);
      await loadRecords(false);
      setDeleteTarget(null);
      setDeleteOpen(false);
      pushToast("Record removed", `${name} deleted from ${pipelineTab}.`, "success");
    } catch (err) {
      pushToast("Delete failed", err.message || "Unable to delete candidate.", "warning");
    }
  };

  const handleExport = () => {
    const exportRows = buildExportRows(filteredRows);
    if (!exportRows.length) {
      pushToast("Nothing to export", "Apply different filters or add records first.", "warning");
      return;
    }
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, pipelineTab);
    XLSX.writeFile(workbook, `recruitment-${pipelineTab.toLowerCase()}-${todayIso()}.xlsx`);
    pushToast("Excel exported", `Current ${pipelineTab} view downloaded successfully.`, "success");
  };

  return (
    <div className="space-y-4">
      <PageTaskHeader title={pageTitle} subtitle={pageSubtitle}>
        {pipelineTab === "Calling" ? (
          <button type="button" onClick={openCreate} className="erp-btn-primary rounded-control px-3.5 py-2 inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Calling
          </button>
        ) : null}
        <button type="button" onClick={handleExport} className="erp-btn-secondary rounded-control px-3.5 py-2 inline-flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Export Excel
        </button>
        <button type="button" onClick={() => loadRecords(true)} className="erp-btn-secondary rounded-control px-3.5 py-2 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </PageTaskHeader>

      <div className="flex flex-wrap gap-2">
        {CALLING_PIPELINE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setPipelineTab(tab.key)}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors ${
              pipelineTab === tab.key
                ? "border-accent bg-accent text-white"
                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className="rounded-card border border-border bg-surface px-4 py-3.5 shadow-card">
                <p className="type-mono-caption">{item.label}</p>
                <p className="mt-1.5 text-2xl font-semibold text-ink">{item.value}</p>
                <p className="mt-1 text-xs text-ink-muted">{item.sub}</p>
              </div>
            ))}
          </div>

          <SectionCard
            title={registerTitle}
            right={
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{filteredRows.length} result(s)</span>
              </div>
            }
          >
            <div className="space-y-4">
              <FilterBar>
                <label className="min-w-[14rem] flex-1">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Search</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Search mobile, candidate, company, designation"
                      className="box-border h-8 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm"
                    />
                  </div>
                </label>

                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Date</span>
                  <FormDateInput
                    value={filters.callDate}
                    onChange={(event) => handleFilterChange("callDate", event.target.value)}
                    className="box-border h-8 min-w-[11rem] rounded-lg border border-slate-200 bg-white"
                  />
                </label>

                <label className="min-w-0">
                  <span className="mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Source
                  </span>
                  <TinySelect
                    value={sourceFilter}
                    onChange={(event) => {
                      setSourceFilter(event.target.value);
                      setPage(1);
                    }}
                    className="box-border min-w-[10rem] rounded-lg border-slate-200 bg-white text-sm"
                  >
                    <option value="All">All</option>
                    <option value="Calling">Calling</option>
                    <option value="Referral">Referral</option>
                  </TinySelect>
                </label>

                {[
                  ["callingBy", "Calling By"],
                  ["homeState", "Home State"],
                  ["workingState", "Working State"],
                  ["fireCourse", "Fire Course"],
                  ["industryWorked", "Industry Worked"],
                  ["siteSuitable", "Site Suitable"],
                  ["currentlyWorking", "Currently Working"],
                ].map(([key, label]) => (
                  <label key={key} className="min-w-0">
                    <span className="mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-slate-500" title={label}>
                      {label}
                    </span>
                    <TinySelect
                      value={filters[key]}
                      onChange={(event) => handleFilterChange(key, event.target.value)}
                      className="box-border min-w-[10rem] rounded-lg border-slate-200 bg-white text-sm"
                    >
                      <option value="">All</option>
                      {(selectOptions[key] || []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </TinySelect>
                  </label>
                ))}

                <div className="ml-auto flex flex-wrap items-end gap-2">
                  <button type="button" onClick={clearFilters} className="erp-btn-secondary inline-flex h-8 items-center gap-2 rounded-control px-3">
                    <Filter className="h-4 w-4" />
                    Clear
                  </button>
                </div>
              </FilterBar>

              {emptyState ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
                  <h3 className="text-base font-semibold text-slate-900">{emptyTitle}</h3>
                  <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
                  {pipelineTab === "Calling" ? (
                    <button type="button" onClick={openCreate} className="erp-btn-primary mt-4 rounded-control px-4 py-2">
                      Add first calling record
                    </button>
                  ) : null}
                </div>
              ) : noResults ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
                  <h3 className="text-base font-semibold text-slate-900">No matching records</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Try changing search text or filters to see more records.
                  </p>
                  {hasFiltersApplied ? (
                    <button type="button" onClick={clearFilters} className="erp-btn-secondary mt-4 rounded-control px-4 py-2">
                      Reset filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="hidden min-w-0 lg:block">
                    <DenseTable
                      columns={desktopColumns}
                      rows={pagedRows}
                      rowKey="id"
                      frozenColumnCount={4}
                      frozenColumnWidths={[
                        ACTION_COLUMN_WIDTH[pipelineTab] || ACTION_COLUMN_WIDTH.Calling,
                        ...FROZEN_DATA_WIDTHS,
                      ]}
                      stickyHeader
                      scrollMaxHeight="calc(100dvh - 26rem)"
                      serialOffset={(page - 1) * pageSize}
                    />
                  </div>

                  <div className="grid gap-3 lg:hidden">
                    {pagedRows.map((row) => {
                      const status = normalizePipelineStatus(row.hiringStatus);
                      const canShortlist =
                        pipelineTab === "Calling" && (status === "Calling" || status === "Rejected");
                      const showShortlistActions = pipelineTab === "Shortlisted";
                      return (
                        <div
                          key={row.id}
                          className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-base font-semibold text-slate-900" title={row.candidateName || "Unnamed candidate"}>
                                <span className="truncate">{row.candidateName || "Unnamed candidate"}</span>
                                {isReferralCandidate(row) ? <StatusChip label="Referral" severity="info" /> : null}
                              </p>
                              <p className="mt-1 truncate text-sm text-slate-500" title={`${row.designation || "Designation pending"}${row.company ? ` · ${row.company}` : ""}`}>
                                {row.designation || "Designation pending"}
                                {row.company ? ` · ${row.company}` : ""}
                              </p>
                            </div>
                            <CallingActionBar edge="start" className="max-w-[min(100%,18rem)] shrink-0 !flex-wrap justify-end">
                              <CallingActionBtn icon={Edit3} label="Edit" iconOnly onClick={() => openEdit(row)} />
                              <CallingActionBtn
                                icon={Trash2}
                                label="Delete"
                                iconOnly
                                tone="danger"
                                onClick={(event) => openDelete(row, event)}
                              />
                              {pipelineTab === "Selected" ? (
                                (() => {
                                  const label = offerResponseLabel(row);
                                  if (label === "Not Generated") return null;
                                  return <StatusChip label={label} severity={journeyStatusSeverity(label)} />;
                                })()
                              ) : null}
                              {canShortlist ? (
                                <CallingActionBtn
                                  icon={ListChecks}
                                  label="Shortlist"
                                  iconOnly
                                  title="Mark Shortlisted"
                                  disabled={statusUpdatingId === row.id}
                                  onClick={(event) => void handlePipelineStatusChange(row, "Shortlisted", event)}
                                />
                              ) : null}
                              {showShortlistActions ? (
                                <>
                                  <CallingActionBtn
                                    icon={UserCheck}
                                    label="Selected"
                                    tone="success"
                                    disabled={statusUpdatingId === row.id}
                                    onClick={(event) => void handlePipelineStatusChange(row, "Selected", event)}
                                  />
                                  <CallingActionBtn
                                    icon={UserX}
                                    label="Rejected"
                                    tone="danger"
                                    disabled={statusUpdatingId === row.id}
                                    onClick={(event) => void handlePipelineStatusChange(row, "Rejected", event)}
                                  />
                                </>
                              ) : null}
                              {pipelineTab === "Calling" && !canShortlist ? (
                                <CallingActionHint>{status}</CallingActionHint>
                              ) : null}
                              <StatusChip
                                label={row.siteSuitable || "Review"}
                                severity={row.siteSuitable === "Immediate" ? "info" : "warning"}
                              />
                            </CallingActionBar>
                          </div>
                          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                            <div className="min-w-0 truncate">
                              <span className="font-medium text-slate-800">Mobile:</span> {row.phoneNumber || "—"}
                            </div>
                            <div className="min-w-0 truncate">
                              <span className="font-medium text-slate-800">Date:</span> {formatDateDisplay(row.callDate)}
                            </div>
                            <div className="min-w-0 truncate" title={row.callingBy || undefined}>
                              <span className="font-medium text-slate-800">Calling By:</span> {row.callingBy || "—"}
                            </div>
                            <div className="min-w-0 truncate" title={row.workingState || undefined}>
                              <span className="font-medium text-slate-800">Current State:</span> {row.workingState || "—"}
                            </div>
                            <div className="min-w-0 truncate" title={row.homeState || undefined}>
                              <span className="font-medium text-slate-800">Home State:</span> {row.homeState || "—"}
                            </div>
                            <div className="min-w-0 truncate">
                              <span className="font-medium text-slate-800">Experience:</span> {row.totalExperience || "—"}
                            </div>
                          </div>
                          {Array.isArray(row.attachments) && row.attachments.length ? (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={(event) => openFilesPreview(row, event)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Preview files ({row.attachments.length})
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-slate-500">
                      Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TinySelect
                        value={String(pageSize)}
                        onChange={(event) => {
                          setPageSize(Number(event.target.value));
                          setPage(1);
                        }}
                        className="rounded-lg border-slate-200 bg-white text-sm"
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option} / page
                          </option>
                        ))}
                      </TinySelect>
                      <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        className="erp-btn-secondary rounded-control px-3 py-2 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-slate-600">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page === totalPages}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                        className="erp-btn-secondary rounded-control px-3 py-2 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </SectionCard>
        </>
      )}

      <Modal
        open={formOpen}
        title={
          formMode === "edit"
            ? pipelineTab === "Selected"
              ? "Edit Selected"
              : "Edit Calling"
            : "Add Calling"
        }
        onClose={() => setFormOpen(false)}
        widthClass="max-w-5xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {pipelineTab === "Selected"
                ? "Offer details are saved with this Selected candidate for letter generation."
                : "Mobile number must be unique for active calling records."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="erp-btn-secondary rounded-control px-4 py-2">
                Cancel
              </button>
              <button
                type="submit"
                form="calling-master-form"
                disabled={uploadingFiles}
                className="erp-btn-primary rounded-control px-4 py-2 disabled:opacity-50"
              >
                {uploadingFiles ? "Uploading…" : formMode === "edit" ? "Save Changes" : "Create Calling"}
              </button>
            </div>
          </div>
        }
      >
        <form id="calling-master-form" onSubmit={handleSubmit} className="space-y-5">
          {CALLING_MASTER_FIELDS.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.section} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-slate-900">{section.section}</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {section.fields.map((field) => (
                    <FormField
                      key={field.key}
                      field={field}
                      value={formValues[field.key]}
                      error={formErrors[field.key]}
                      onChange={handleFormValueChange}
                      selectOptions={selectOptions}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {pipelineTab === "Selected" && formMode === "edit" ? (
            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Offer letter details</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fill these for the Offer of Employment letter. Generate the Word file from Offer Generation.
                </p>
              </div>
              <OfferDetailsFields
                values={formValues}
                onChange={handleFormValueChange}
                showRegisterSummary
                candidateName={formValues.candidateName}
                siteSuitable={formValues.siteSuitable}
              />
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-slate-900">Attachments</h3>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Upload multiple files (CV, certificates, photos). Files are stored securely with the candidate record.
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (!files.length) return;
                setPendingFiles((current) => [...current, ...files]);
                event.target.value = "";
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
            />

            {(formValues.attachments?.length || pendingFiles.length) ? (
              <ul className="mt-4 space-y-2">
                {(formValues.attachments || []).map((item) => {
                  const path = callingAttachmentStoragePath(item);
                  return (
                  <li
                    key={path || item.fileName}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-800">{fileLabelFromCallingAttachment(item)}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={async () => {
                          try {
                            const url = await presignCallingMasterR2Get(path);
                            window.open(url, "_blank", "noopener,noreferrer");
                          } catch (err) {
                            pushToast("Open failed", err.message || "Unable to open file.", "warning");
                          }
                        }}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-rose-600 hover:underline"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            attachments: (current.attachments || []).filter(
                              (row) => callingAttachmentStoragePath(row) !== path
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                  );
                })}
                {pendingFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-800">{file.name} <span className="text-slate-400">(pending)</span></span>
                    <button
                      type="button"
                      className="text-xs font-medium text-rose-600 hover:underline"
                      onClick={() => setPendingFiles((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No attachments yet.</p>
            )}
          </section>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete Record"
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
              className="erp-btn-secondary rounded-control px-4 py-2"
            >
              Cancel
            </button>
            <button type="button" onClick={handleDelete} className="rounded-control bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
              Delete
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Delete {deleteTarget?.candidateName || "this candidate"} from {pipelineTab}? Active records will be marked inactive.
        </p>
      </Modal>
    </div>
  );
}
