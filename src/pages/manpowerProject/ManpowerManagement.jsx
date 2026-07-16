import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import {
  Search,
  Plus,
  FileText,
  X,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  MessageSquare,
  Download,
  Upload,
  Filter,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  Loader2,
  Eye,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { COMMERCIAL_MT_APPROVER_MODULE_KEYS, userCanApproveInModules } from "../../config/roles";
import ManpowerEnquiryFormPanel from "./components/ManpowerEnquiryFormPanel";
import ManpowerEnquiryPreviewModal, {
  statusTone,
  verticalTone,
} from "./components/ManpowerEnquiryPreviewModal";
import ManpowerEnquiryDashboard from "./ManpowerEnquiryDashboard";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import FormDateInput from "../../components/FormDateInput";

import {
  buildAuthorizationValue,
  extractWorkflowMeta,
  formatInquiryCellValue,
  getExcelInquiryFields,
  INQUIRY_DB_COLUMNS,
  INQUIRY_LIST_DISPLAY_COLUMNS,
  INQUIRY_TABLE_COLUMNS,
  MODE_OF_SUBMISSION_OPTIONS,
  VERTICAL_OPTIONS,
  parseAuthorizationMeta,
} from "./utils/manpowerEnquiryExcelFields";
import {
  applyInquiryFilters,
  EMPTY_INQUIRY_FILTERS,
  getInquiryFilterOptions,
  hasActiveInquiryFilters,
  INQUIRY_PAGE_SIZE_OPTIONS,
  INQUIRY_STATUS_OPTIONS,
  sortInquiries,
} from "./utils/manpowerInquiryList";
import {
  commitManpowerInquiryImport,
  downloadManpowerInquiryImportTemplate,
  exportManpowerInquiriesToExcel,
  previewManpowerInquiryImport,
} from "./utils/manpowerInquiryImportExport";
import {
  fetchCommercialAssigneeOptions,
  mergeAssignedToOptions,
} from "./utils/commercialInquiryAssignees";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SORT = { key: "receivedDate", dir: "desc" };
const MANPOWER_BASE = "/app/commercial/manpower-training/manpower-management";
const ACTION_COL_WIDTH = 168;
const tableMinWidth =
  INQUIRY_LIST_DISPLAY_COLUMNS.reduce((sum, col) => sum + col.width, 0) + ACTION_COL_WIDTH;
const INQUIRY_MULTILINE_COLUMNS = new Set(["descriptionOfWork", "remarks", "furtherAction"]);
const STICKY_ACTION_CELL =
  "manpower-inquiry-action-cell sticky right-0 border-l border-slate-200 bg-white shadow-[-5px_0_8px_-4px_rgba(15,23,42,0.12)] group-hover:bg-purple-50/80";
const STICKY_ACTION_HEAD =
  "manpower-inquiry-action-head sticky right-0 top-0 border-l border-purple-100 shadow-[-5px_0_8px_-4px_rgba(15,23,42,0.1)]";

function getRejectionRemark(row) {
  const { meta } = parseAuthorizationMeta(row.authorization_to);
  return String(meta.rejectionRemark || "").trim();
}

function getListRowFields(row) {
  const excel = getExcelInquiryFields(row);
  return {
    ...excel,
    enquiryNumber: row?.enquiry_number || "",
    status: row?.status || "Pending",
  };
}

function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (currentPage >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((page, idx) => {
    if (idx > 0 && page - sorted[idx - 1] > 1) items.push("…");
    items.push(page);
  });
  return items;
}

const IMPORT_PREVIEW_COLUMNS = [
  { key: "srNo", label: "Sr. No.", width: "72px" },
  { key: "clientName", label: "Client Name" },
  { key: "modeOfSubmission", label: "Mode of Submission" },
  { key: "vertical", label: "Vertical" },
  { key: "location", label: "Location" },
];

function ImportPreviewDialog({ preview, confirming, onConfirm, onCancel }) {
  const readyItems = (preview.items || []).filter((item) => item.status === "ready");
  const invalidItems = (preview.items || []).filter((item) => item.status === "invalid");
  const canImport = preview.readyCount > 0 && !preview.fileError;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-4 py-4 sm:px-5">
          <div className="rounded-lg bg-amber-100 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Confirm Inquiry Import</h2>
            <p className="mt-0.5 text-xs text-slate-600">Review rows before adding them to Manpower Management.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-lg p-2 text-slate-600 hover:bg-amber-100 disabled:opacity-50"
            aria-label="Close import preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-500">File</span>
              <p className="font-medium text-slate-900 truncate" title={preview.fileName}>{preview.fileName}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-500">Header row (Excel)</span>
              <p className="font-medium text-slate-900">Row {preview.headerRowNumber}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <span className="text-emerald-700">Ready to import</span>
              <p className="font-semibold text-emerald-800">{preview.readyCount} row(s)</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="text-amber-700">Will be skipped</span>
              <p className="font-semibold text-amber-800">{preview.skipCount} row(s)</p>
            </div>
          </div>

          {preview.fileError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
              <p className="font-medium">File issue</p>
              <p className="mt-1">{preview.fileError}</p>
            </div>
          ) : null}

          {readyItems.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Rows to import</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {IMPORT_PREVIEW_COLUMNS.map((col) => (
                        <th key={col.key} className="px-2 py-2 text-left font-semibold text-slate-700" style={col.width ? { width: col.width } : undefined}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {readyItems.map((item, index) => (
                      <tr key={`${item.rowNumber}-${index}`} className="bg-white">
                        <td className="px-2 py-2 text-slate-600 tabular-nums">{index + 1}</td>
                        <td className="px-2 py-2 font-medium text-slate-900">{item.row.clientName || "—"}</td>
                        <td className="px-2 py-2 text-slate-700">{item.row.modeOfSubmission || "—"}</td>
                        <td className="px-2 py-2 text-slate-700">{item.row.vertical || "—"}</td>
                        <td className="px-2 py-2 text-slate-700">{item.row.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {invalidItems.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Rows with errors (will be skipped)</h3>
              <ul className="space-y-2 text-xs">
                {invalidItems.map((item) => (
                  <li key={item.rowNumber} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-800">
                    <span className="font-semibold">Excel row {item.rowNumber}</span>
                    {item.row.clientName ? (
                      <span className="text-red-700"> · {item.row.clientName}</span>
                    ) : null}
                    <ul className="mt-1 list-disc pl-4 text-red-700">
                      {item.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.emptyCount > 0 ? (
            <p className="text-xs text-slate-500">{preview.emptyCount} empty row(s) ignored.</p>
          ) : null}

          <p className="text-xs text-slate-500">
            {canImport
              ? `This will create ${preview.readyCount} new pending inquiry record(s). Existing records are not changed.`
              : "Fix the file errors above or use the Template download, then try again."}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming || !canImport}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {confirming ? "Importing…" : `Import ${preview.readyCount} row(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const ManpowerManagement = () => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDashboardView = location.pathname === `${MANPOWER_BASE}/dashboard`;
  const { user, userProfile, accessibleModules } = useAuth();
  const canApproveEnquiries = userCanApproveInModules(
    userProfile,
    accessibleModules,
    COMMERCIAL_MT_APPROVER_MODULE_KEYS
  );

  const [enquiries, setEnquiries] = useState([]);
  const [listError, setListError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_INQUIRY_FILTERS);
  const [sortConfig, setSortConfig] = useState(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importConfirming, setImportConfirming] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const importFileRef = useRef(null);
  const [commercialAssigneeOptions, setCommercialAssigneeOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, row: null, remark: "", error: "", submitting: false });
  const [remarkDialog, setRemarkDialog] = useState({ open: false, row: null, remark: "" });
  const [previewRow, setPreviewRow] = useState(null);

  const fetchEnquiries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("manpower_enquiries")
        .select(INQUIRY_DB_COLUMNS.join(", "))
        .order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        setListError(error.message || String(error));
        setEnquiries([]);
      } else {
        setListError(null);
        setEnquiries(data || []);
      }
    } catch (e) {
      console.error(e);
      setListError(e?.message || String(e));
      setEnquiries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, []);

  useEffect(() => {
    const loadCommercialAssignees = async () => {
      try {
        const options = await fetchCommercialAssigneeOptions(supabase);
        setCommercialAssigneeOptions(options);
      } catch (err) {
        console.error("Failed to load Commercial assignees for filter:", err);
      }
    };
    loadCommercialAssignees();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditingId(null);
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (routeId && routeId !== "list" && routeId !== "internal-quotation" && routeId !== "quotation" && routeId !== "configuration" && routeId !== "dashboard") {
      setEditingId(routeId);
      setShowForm(true);
    } else {
      setEditingId(null);
    }
  }, [routeId]);

  const filterOptions = useMemo(() => getInquiryFilterOptions(enquiries), [enquiries]);

  const filtered = useMemo(
    () => applyInquiryFilters(enquiries, { searchQuery, filters }, formatDateDdMmYyyy),
    [enquiries, searchQuery, filters]
  );

  const sorted = useMemo(() => sortInquiries(filtered, sortConfig), [filtered, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters, sortConfig, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const clearFilters = () => {
    setFilters(EMPTY_INQUIRY_FILTERS);
    setSearchQuery("");
  };

  const handleExport = async () => {
    if (!sorted.length) {
      alert("No inquiries to export for the current search and filters.");
      return;
    }
    setExportBusy(true);
    try {
      const updatedBy =
        userProfile?.username || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
      await exportManpowerInquiriesToExcel(sorted, formatDateDdMmYyyy, { updatedBy });
    } catch (error) {
      console.error(error);
      alert(error?.message || "Export failed.");
    } finally {
      setExportBusy(false);
    }
  };

  const formatImportResultMessage = (result) => {
    if (result.stage === "insert") {
      const detail = result.errors?.[0]?.message || result.message || "Database insert failed.";
      return `Import failed while saving to database: ${detail}`;
    }
    if (result.stage === "prepare") {
      const detail = result.errors?.[0]?.message || result.message || "Could not prepare enquiry numbers.";
      return `Import failed while preparing enquiry numbers: ${detail}`;
    }
    if (result.imported > 0) {
      const skipParts = [];
      if (result.skipped > 0) skipParts.push(`${result.skipped} row(s) skipped`);
      const rowErrorText = (result.errors || [])
        .map((e) => (e.rowNumber ? `Row ${e.rowNumber}: ${e.message}` : e.message))
        .join("; ");
      if (rowErrorText) skipParts.push(rowErrorText);
      const suffix = skipParts.length ? ` (${skipParts.join(" — ")})` : "";
      return `Imported ${result.imported} inquiry(s).${suffix}`;
    }
    const rowErrorText = (result.errors || [])
      .map((e) => (e.rowNumber ? `Row ${e.rowNumber}: ${e.message}` : e.message))
      .join("; ");
    return result.message || rowErrorText || "No inquiries were imported.";
  };

  const closeImportPreview = () => {
    if (importConfirming) return;
    setImportPreview(null);
    if (importFileRef.current) importFileRef.current.value = "";
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    setImportBusy(true);
    setImportMessage("");
    try {
      const preview = await previewManpowerInquiryImport(file);
      setImportPreview(preview);
    } catch (error) {
      console.error(error);
      setImportMessage(error?.message || "Could not read the import file.");
      if (importFileRef.current) importFileRef.current.value = "";
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.readyCount) return;
    setImportConfirming(true);
    setImportMessage("");
    try {
      const result = await commitManpowerInquiryImport(importPreview, supabase, user?.id);
      setImportPreview(null);
      if (importFileRef.current) importFileRef.current.value = "";

      if (result.stage === "insert" || result.stage === "prepare") {
        const stageLabel = result.stage === "insert" ? "database save" : "enquiry number preparation";
        const detail = result.errors?.[0]?.message || result.message;
        setImportMessage(`Import failed during ${stageLabel}: ${detail}`);
      } else {
        setImportMessage(formatImportResultMessage(result));
        if (result.imported > 0) await fetchEnquiries();
      }
    } catch (error) {
      console.error(error);
      setImportMessage(error?.message || "Import failed.");
    } finally {
      setImportConfirming(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    navigate(isDashboardView ? `${MANPOWER_BASE}/dashboard` : MANPOWER_BASE, { replace: true });
  };

  const openNew = () => {
    setEditingId(null);
    setShowForm(true);
    navigate(isDashboardView ? `${MANPOWER_BASE}/dashboard` : MANPOWER_BASE, { replace: true });
  };

  const openEdit = (enquiryId) => {
    setPreviewRow(null);
    setEditingId(enquiryId);
    setShowForm(true);
    navigate(`${MANPOWER_BASE}/${enquiryId}`, { replace: false });
  };

  const openPreview = (row) => {
    setPreviewRow(row);
  };

  const afterSave = () => {
    closeForm();
    fetchEnquiries();
  };

  const handleApprove = async (rowId) => {
    if (!canApproveEnquiries) return;
    try {
      const { data: currentRow, error: rowError } = await supabase
        .from("manpower_enquiries")
        .select("id, authorization_to")
        .eq("id", rowId)
        .single();
      if (rowError) throw rowError;

      const currentParsed = parseAuthorizationMeta(currentRow?.authorization_to);
      let ifslNumber = currentParsed.meta.ifslNumber || "";

      if (!ifslNumber) {
        const { data: allRows, error: allError } = await supabase
          .from("manpower_enquiries")
          .select("authorization_to");
        if (allError) throw allError;

        const year = new Date().getFullYear();
        let maxSequence = 0;

        (allRows || []).forEach((row) => {
          const { meta } = parseAuthorizationMeta(row.authorization_to);
          const val = String(meta.ifslNumber || "");
          const match = val.match(/^(?:IFSL|IFSPL)\/ENQ\/(\d{4})\/(\d{4})$/);
          if (match && Number(match[1]) === year) {
            maxSequence = Math.max(maxSequence, Number(match[2]));
          }
        });

        ifslNumber = `IFSPL/ENQ/${year}/${String(maxSequence + 1).padStart(4, "0")}`;
      }

      const approvedAt = currentParsed.meta.approvedAt || currentParsed.meta.convertedAt || new Date().toISOString();
      const nextMeta = {
        ...extractWorkflowMeta(currentParsed.meta || {}),
        ifslNumber,
        approvedAt,
        convertedAt: approvedAt,
      };
      delete nextMeta.rejectionRemark;
      delete nextMeta.rejectedAt;

      const { error } = await supabase
        .from("manpower_enquiries")
        .update({
          status: "Approved",
          authorization_to: buildAuthorizationValue(nextMeta, currentParsed.rawText),
        })
        .eq("id", rowId);
      if (error) throw error;
      navigate("/app/manpower/internal-quotation", { replace: false });
    } catch (error) {
      console.error(error);
    }
    fetchEnquiries();
  };

  const openRejectDialog = (row) => {
    if (!canApproveEnquiries) return;
    setRejectDialog({ open: true, row, remark: getRejectionRemark(row), error: "", submitting: false });
  };

  const closeRejectDialog = () => {
    if (rejectDialog.submitting) return;
    setRejectDialog({ open: false, row: null, remark: "", error: "", submitting: false });
  };

  const submitReject = async () => {
    if (!canApproveEnquiries || !rejectDialog.row) return;
    const remark = rejectDialog.remark.trim();
    if (!remark) {
      setRejectDialog((prev) => ({ ...prev, error: "Please enter rejection remark." }));
      return;
    }

    setRejectDialog((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      const currentParsed = parseAuthorizationMeta(rejectDialog.row.authorization_to);
      const nextMeta = {
        ...extractWorkflowMeta(currentParsed.meta || {}),
        rejectionRemark: remark,
        rejectedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("manpower_enquiries")
        .update({
          status: "Rejected",
          authorization_to: buildAuthorizationValue(nextMeta, currentParsed.rawText),
        })
        .eq("id", rejectDialog.row.id);
      if (error) throw error;

      setRejectDialog({ open: false, row: null, remark: "", error: "", submitting: false });
      fetchEnquiries();
    } catch (error) {
      console.error(error);
      setRejectDialog((prev) => ({ ...prev, submitting: false, error: error?.message || "Failed to reject enquiry." }));
    }
  };

  const openRemarkDialog = (row) => {
    const remark = getRejectionRemark(row);
    if (!remark) return;
    setRemarkDialog({ open: true, row, remark });
  };

  const handleDelete = async (rowId) => {
    if (!confirm("Delete this enquiry?")) return;
    const { error } = await supabase.from("manpower_enquiries").delete().eq("id", rowId);
    if (error) console.error(error);
    fetchEnquiries();
  };

  const pageItems = buildPageItems(currentPage, totalPages);
  const sortLabel =
    INQUIRY_LIST_DISPLAY_COLUMNS.find((c) => c.id === sortConfig.key)?.label ||
    INQUIRY_TABLE_COLUMNS.find((c) => c.id === sortConfig.key)?.label ||
    sortConfig.key;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-4 md:px-6 lg:py-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Enquiry Master List</h1>
              <p className="mt-1 text-sm text-slate-600 sm:text-base">
                {isDashboardView
                  ? "Dashboard analytics, charts, and filtered summaries for manpower enquiries."
                  : "Track and manage commercial manpower, fire tender and training enquiries."}
              </p>
              {listError && !isDashboardView && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Could not load enquiries. Please refresh and try again. If the problem continues, contact your administrator.
                </p>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 sm:px-4"
              >
                <Plus className="h-4 w-4" />
                <span>Add Enquiry</span>
              </button>
              {!isDashboardView && (
                <>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exportBusy || !sorted.length}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4 text-emerald-600" />
                    {exportBusy ? "Exporting…" : "Export"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadManpowerInquiryImportTemplate()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4 text-slate-500" />
                    Template
                  </button>
                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    disabled={importBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 text-blue-600" />
                    {importBusy ? "Reading…" : "Import"}
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleImportFile(e.target.files?.[0])}
                  />
                </>
              )}
            </div>
          </div>
        </div>

          {isDashboardView ? (
            <div className="p-4 sm:p-6">
            <ManpowerEnquiryDashboard embedded />
            </div>
          ) : (
          <div className="space-y-4 p-4 sm:p-6">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Enquiry No, Client Name, Location, Description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                    showFilters ? "border-purple-300 bg-purple-50 text-purple-800" : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </button>
                {(hasActiveInquiryFilters(filters) || searchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Vertical</span>
                  <select
                    value={filters.vertical}
                    onChange={(e) => setFilters((prev) => ({ ...prev, vertical: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All</option>
                    {VERTICAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Mode of Submission</span>
                  <select
                    value={filters.modeOfSubmission}
                    onChange={(e) => setFilters((prev) => ({ ...prev, modeOfSubmission: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All</option>
                    {MODE_OF_SUBMISSION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Assigned To</span>
                  <select
                    value={filters.enquiryAssignedTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, enquiryAssignedTo: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All</option>
                    {mergeAssignedToOptions(commercialAssigneeOptions, filters.enquiryAssignedTo).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Status</span>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All</option>
                    {[...new Set([...INQUIRY_STATUS_OPTIONS, ...filterOptions.status])].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Received From</span>
                  <FormDateInput
                    value={filters.receivedFrom}
                    onChange={(e) => setFilters((prev) => ({ ...prev, receivedFrom: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block font-medium">Received To</span>
                  <FormDateInput
                    value={filters.receivedTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, receivedTo: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span className="font-medium text-slate-800">Total Enquiries: {sorted.length}</span>
              {sortConfig.key ? (
                <span className="text-xs text-slate-500">
                  Sorted by {sortLabel} ({sortConfig.dir})
                </span>
              ) : null}
            </div>

            {importMessage ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  importMessage.toLowerCase().includes("failed") || importMessage.toLowerCase().includes("no inquiries")
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-blue-200 bg-blue-50 text-blue-900"
                }`}
              >
                {importMessage}
              </div>
            ) : null}
          </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-purple-600" />
              <p className="mt-2 text-sm">Loading enquiries…</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <FileText className="mx-auto mb-2 h-10 w-10 text-slate-400" />
              <p className="text-base font-medium text-slate-700">{enquiries.length === 0 ? "No enquiries yet" : "No matches"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {enquiries.length === 0 ? "Use Add Enquiry to create the first record." : "Try another search or filter."}
              </p>
            </div>
          ) : (
            <div
              className="manpower-inquiry-table-scroll overflow-auto max-h-[min(68vh,720px)]"
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(124, 58, 237, 0.35) #f8fafc" }}
            >
              <style>{`
                .manpower-inquiry-table-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
                .manpower-inquiry-table-scroll::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
                .manpower-inquiry-table-scroll::-webkit-scrollbar-thumb { background: rgba(124, 58, 237, 0.35); border-radius: 4px; }
                .manpower-inquiry-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124, 58, 237, 0.55); }
                .manpower-inquiry-table { border-collapse: separate; border-spacing: 0; }
                .manpower-inquiry-table tbody td {
                  overflow: hidden;
                  vertical-align: middle;
                  box-sizing: border-box;
                }
                .manpower-inquiry-table thead th {
                  position: sticky;
                  top: 0;
                  z-index: 10;
                  overflow: visible;
                  vertical-align: middle;
                  box-sizing: border-box;
                  background-color: #faf5ff !important;
                  background-image: linear-gradient(90deg, #f5f3ff 0%, #faf5ff 100%) !important;
                  box-shadow: 0 1px 0 0 #e9d5ff;
                }
                .manpower-inquiry-table thead th.manpower-inquiry-action-head {
                  z-index: 20;
                  background-color: #faf5ff !important;
                  background-image: linear-gradient(90deg, #f5f3ff 0%, #faf5ff 100%) !important;
                  box-shadow: -5px 0 8px -4px rgba(15, 23, 42, 0.1), 0 1px 0 0 #e9d5ff;
                }
                .manpower-inquiry-table tbody td {
                  position: relative;
                  z-index: 0;
                }
                .manpower-inquiry-table tbody td.manpower-inquiry-action-cell {
                  z-index: 1;
                }
              `}</style>
                <table className="manpower-inquiry-table w-full text-xs" style={{ minWidth: tableMinWidth, tableLayout: "fixed" }}>
                  <colgroup>
                    {INQUIRY_LIST_DISPLAY_COLUMNS.map((col) => (
                      <col key={col.id} style={{ width: col.width }} />
                    ))}
                    <col style={{ width: ACTION_COL_WIDTH }} />
                  </colgroup>
                  <thead className="border-b border-purple-100">
                    <tr>
                      {INQUIRY_LIST_DISPLAY_COLUMNS.map((col) => {
                        const isSorted = sortConfig.key === col.id;
                        const SortIcon = isSorted ? (sortConfig.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                        return (
                          <th
                            key={col.id}
                            className={`max-w-0 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-700 align-middle ${
                              col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(col.id)}
                              className={`max-w-full inline-flex items-center gap-1 hover:text-purple-700 ${
                                col.align === "center" ? "justify-center w-full" : col.align === "right" ? "justify-end w-full" : ""
                              }`}
                              title={`Sort by ${col.label}`}
                            >
                              <span className="truncate">{col.label}</span>
                              <SortIcon className={`w-3.5 h-3.5 shrink-0 ${isSorted ? "text-purple-600" : "text-gray-400"}`} />
                            </button>
                          </th>
                        );
                      })}
                      <th className={`px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 align-middle ${STICKY_ACTION_HEAD}`}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginated.map((e) => {
                      const rejectionRemark = getRejectionRemark(e);
                      const fields = getListRowFields(e);
                      return (
                        <tr key={e.id} className="group transition-colors hover:bg-purple-50/40">
                          {INQUIRY_LIST_DISPLAY_COLUMNS.map((col) => {
                            const raw = fields[col.id];
                            const display = formatInquiryCellValue(raw, col.valueType === "chip" || col.valueType === "status" ? "text" : col.valueType, formatDateDdMmYyyy);
                            const alignClass =
                              col.align === "center"
                                ? "text-center"
                                : col.align === "right"
                                  ? "text-right"
                                  : "text-left";
                            const typeClass =
                              col.valueType === "number" || col.valueType === "currency" ? "tabular-nums" : "";
                            const cellTitle = display === "—" ? undefined : display;
                            const isMultiline = INQUIRY_MULTILINE_COLUMNS.has(col.id);
                            return (
                              <td
                                key={col.id}
                                className={`max-w-0 px-3 py-3 align-middle text-xs text-slate-700 ${alignClass} ${typeClass}`}
                              >
                                {col.valueType === "chip" ? (
                                  display === "—" ? (
                                    <span className="text-slate-400">—</span>
                                  ) : (
                                    <span className={`inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-medium ${verticalTone(display)}`} title={cellTitle}>
                                      {display}
                                    </span>
                                  )
                                ) : col.valueType === "status" ? (
                                  display === "—" ? (
                                    <span className="text-slate-400">—</span>
                                  ) : (
                                    <span className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusTone(display)}`} title={cellTitle}>
                                      {display}
                                    </span>
                                  )
                                ) : col.id === "enquiryNumber" ? (
                                  <span className="block truncate font-medium text-purple-700 leading-snug" title={cellTitle}>
                                    {display}
                                  </span>
                                ) : isMultiline ? (
                                  <span
                                    className="block whitespace-normal break-words line-clamp-2 leading-snug text-left"
                                    title={cellTitle}
                                  >
                                    {display}
                                  </span>
                                ) : (
                                  <span className={`block truncate leading-snug ${alignClass}`} title={cellTitle}>
                                    {display}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className={`px-2 py-3 align-middle ${STICKY_ACTION_CELL}`}>
                            <div className="flex justify-center items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openPreview(e)}
                                title="Preview"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-purple-200 bg-white text-purple-600 hover:bg-purple-50 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {canApproveEnquiries ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(e.id)}
                                    title="Approve"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openRejectDialog(e)}
                                    title="Regret with remark"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : null}
                              {rejectionRemark ? (
                                <button
                                  type="button"
                                  onClick={() => openRemarkDialog(e)}
                                  title="View regret remark"
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-sky-200 bg-white text-sky-600 hover:bg-sky-50 transition-colors"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openEdit(e.id)}
                                title="Edit"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-amber-200 bg-white text-amber-600 hover:bg-amber-50 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(e.id)}
                                title="Delete"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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

        {!loading && sorted.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length} entries
              </span>
              <label className="inline-flex items-center gap-2">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {INQUIRY_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              {pageItems.map((item, idx) =>
                item === "…" ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    className={`min-w-[32px] rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      currentPage === item
                        ? "border-purple-600 bg-purple-50 text-purple-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Last
              </button>
            </div>
          </div>
        )}
          </div>
          )}
      </div>
      </div>

      {importPreview ? (
        <ImportPreviewDialog
          preview={importPreview}
          confirming={importConfirming}
          onConfirm={handleConfirmImport}
          onCancel={closeImportPreview}
        />
      ) : null}

      {previewRow ? (
        <ManpowerEnquiryPreviewModal
          row={previewRow}
          onClose={() => setPreviewRow(null)}
          onEdit={openEdit}
        />
      ) : null}

      {rejectDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Regret Enquiry</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {rejectDialog.row?.enquiry_number || "Enquiry"} · {rejectDialog.row?.client || "Client not set"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRejectDialog}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close reject remark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Remark</label>
              <textarea
                value={rejectDialog.remark}
                onChange={(event) => setRejectDialog((prev) => ({ ...prev, remark: event.target.value, error: "" }))}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                placeholder="Enter why this enquiry is regretted..."
              />
              {rejectDialog.error && <p className="mt-2 text-xs text-red-600">{rejectDialog.error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeRejectDialog}
                disabled={rejectDialog.submitting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={rejectDialog.submitting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {rejectDialog.submitting ? "Saving..." : "Save Remark"}
              </button>
            </div>
          </div>
        </div>
      )}

      {remarkDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Regret Remark</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {remarkDialog.row?.enquiry_number || "Enquiry"} · {remarkDialog.row?.client || "Client not set"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRemarkDialog({ open: false, row: null, remark: "" })}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close remark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                {remarkDialog.remark}
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setRemarkDialog({ open: false, row: null, remark: "" })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="h-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 shrink-0" />
            <div className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">{editingId ? "Edit Enquiry" : "Add Enquiry"}</h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-red-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
              <ManpowerEnquiryFormPanel key={editingId || "new"} enquiryId={editingId} onSaved={afterSave} onCancel={closeForm} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManpowerManagement;
