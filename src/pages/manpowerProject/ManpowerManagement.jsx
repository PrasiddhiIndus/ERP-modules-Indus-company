import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { COMMERCIAL_MT_APPROVER_MODULE_KEYS, userCanApproveInModules } from "../../config/roles";
import ManpowerEnquiryFormPanel from "./components/ManpowerEnquiryFormPanel";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  buildAuthorizationValue,
  extractWorkflowMeta,
  formatInquiryCellValue,
  getExcelInquiryFields,
  INQUIRY_DB_COLUMNS,
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
  downloadManpowerInquiryImportTemplate,
  exportManpowerInquiriesToExcel,
  importManpowerInquiriesFromFile,
} from "./utils/manpowerInquiryImportExport";
import {
  fetchCommercialAssigneeOptions,
  mergeAssignedToOptions,
} from "./utils/commercialInquiryAssignees";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SORT = { key: "srNo", dir: "desc" };
const ACTION_COL_WIDTH = 112;
const tableMinWidth =
  INQUIRY_TABLE_COLUMNS.reduce((sum, col) => sum + col.width, 0) + ACTION_COL_WIDTH;

function getRejectionRemark(row) {
  const { meta } = parseAuthorizationMeta(row.authorization_to);
  return String(meta.rejectionRemark || "").trim();
}

const ManpowerManagement = () => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userProfile, accessibleModules } = useAuth();
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
  const [exportBusy, setExportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const importFileRef = useRef(null);
  const [commercialAssigneeOptions, setCommercialAssigneeOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, row: null, remark: "", error: "", submitting: false });
  const [remarkDialog, setRemarkDialog] = useState({ open: false, row: null, remark: "" });

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
    if (routeId && routeId !== "list" && routeId !== "internal-quotation" && routeId !== "quotation" && routeId !== "configuration") {
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

  const handleExport = () => {
    if (!sorted.length) {
      alert("No inquiries to export for the current search and filters.");
      return;
    }
    setExportBusy(true);
    try {
      exportManpowerInquiriesToExcel(sorted, formatDateDdMmYyyy);
    } catch (error) {
      console.error(error);
      alert(error?.message || "Export failed.");
    } finally {
      setExportBusy(false);
    }
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    setImportBusy(true);
    setImportMessage("");
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const result = await importManpowerInquiriesFromFile(file, supabase, user?.id);
      const errorText = result.errors?.length ? ` ${result.errors.length} row(s) skipped.` : "";
      setImportMessage(`Imported ${result.imported} inquiry(s).${errorText}`);
      await fetchEnquiries();
    } catch (error) {
      console.error(error);
      setImportMessage(error?.message || "Import failed.");
    } finally {
      setImportBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    navigate("/app/commercial/manpower-training/manpower-management", { replace: true });
  };

  const openNew = () => {
    setEditingId(null);
    setShowForm(true);
    navigate("/app/commercial/manpower-training/manpower-management", { replace: true });
  };

  const openEdit = (enquiryId) => {
    setEditingId(enquiryId);
    setShowForm(true);
    navigate(`/app/commercial/manpower-training/manpower-management/${enquiryId}`, { replace: false });
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

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="mt-4 bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col gap-4 mb-4 md:mb-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manpower Management</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Manpower Management inquiry tracker — columns aligned with Excel</p>
              {listError && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                Could not load enquiries: {listError}. Run migrations{" "}
                <code className="text-xs">20260414120000_manpower_enquiries_and_storage.sql</code> and{" "}
                <code className="text-xs">20260619120000_manpower_enquiries_inquiry_columns.sql</code> in Supabase SQL Editor.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>New Enquiry</span>
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exportBusy || !sorted.length}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-emerald-300 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exportBusy ? "Exporting…" : "Export"}
              </button>
              <button
                type="button"
                onClick={() => downloadManpowerInquiryImportTemplate()}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 text-sm"
              >
                <Download className="w-4 h-4" />
                Template
              </button>
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={importBusy}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-blue-300 bg-blue-50 text-blue-800 rounded-lg hover:bg-blue-100 text-sm disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {importBusy ? "Importing…" : "Import"}
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 sm:p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Master search across all inquiry columns, status, enquiry no…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    showFilters ? "border-purple-300 bg-purple-50 text-purple-800" : "border-gray-300 bg-white text-gray-700"
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
                {(hasActiveInquiryFilters(filters) || searchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Vertical</span>
                  <select
                    value={filters.vertical}
                    onChange={(e) => setFilters((prev) => ({ ...prev, vertical: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  >
                    <option value="">All</option>
                    {VERTICAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Mode of Submission</span>
                  <select
                    value={filters.modeOfSubmission}
                    onChange={(e) => setFilters((prev) => ({ ...prev, modeOfSubmission: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  >
                    <option value="">All</option>
                    {MODE_OF_SUBMISSION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Assigned To</span>
                  <select
                    value={filters.enquiryAssignedTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, enquiryAssignedTo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  >
                    <option value="">All</option>
                    {mergeAssignedToOptions(commercialAssigneeOptions, filters.enquiryAssignedTo).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Status</span>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  >
                    <option value="">All</option>
                    {[...new Set([...INQUIRY_STATUS_OPTIONS, ...filterOptions.status])].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Received From</span>
                  <input
                    type="date"
                    value={filters.receivedFrom}
                    onChange={(e) => setFilters((prev) => ({ ...prev, receivedFrom: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1 font-medium">Received To</span>
                  <input
                    type="date"
                    value={filters.receivedTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, receivedTo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
              <span>
                {sorted.length} of {enquiries.length} inquiries
                {sortConfig.key ? ` · Sorted by ${INQUIRY_TABLE_COLUMNS.find((c) => c.id === sortConfig.key)?.label || sortConfig.key} (${sortConfig.dir})` : ""}
              </span>
            </div>

            {importMessage ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">{importMessage}</div>
            ) : null}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
              <p className="mt-2 text-sm">Loading…</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-10 h-10 mx-auto text-gray-400 mb-2" />
              <p className="text-base font-medium text-gray-700">{enquiries.length === 0 ? "No enquiries yet" : "No matches"}</p>
              <p className="text-xs mt-1 text-gray-500">
                {enquiries.length === 0 ? "Use New Enquiry to add a row." : "Try another search or filter."}
              </p>
            </div>
          ) : (
            <div
              className="manpower-inquiry-table-scroll overflow-auto max-h-[min(68vh,720px)]"
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(220, 38, 38, 0.45) #f3f4f6" }}
            >
              <style>{`
                .manpower-inquiry-table-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
                .manpower-inquiry-table-scroll::-webkit-scrollbar-track { background: #f3f4f6; border-radius: 4px; }
                .manpower-inquiry-table-scroll::-webkit-scrollbar-thumb { background: rgba(220, 38, 38, 0.45); border-radius: 4px; }
                .manpower-inquiry-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(220, 38, 38, 0.65); }
              `}</style>
                <table className="w-full text-xs" style={{ minWidth: tableMinWidth, tableLayout: "fixed" }}>
                  <colgroup>
                    {INQUIRY_TABLE_COLUMNS.map((col) => (
                      <col key={col.id} style={{ width: col.width }} />
                    ))}
                    <col style={{ width: ACTION_COL_WIDTH }} />
                  </colgroup>
                  <thead className="bg-gradient-to-r from-red-50 to-amber-50 border-b border-red-100 sticky top-0 z-10">
                    <tr>
                      {INQUIRY_TABLE_COLUMNS.map((col) => {
                        const isSorted = sortConfig.key === col.id;
                        const SortIcon = isSorted ? (sortConfig.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                        return (
                          <th
                            key={col.id}
                            className={`px-2 py-2.5 text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle ${
                              col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(col.id)}
                              className={`inline-flex items-center gap-1 hover:text-purple-700 ${
                                col.align === "center" ? "justify-center w-full" : col.align === "right" ? "justify-end w-full" : ""
                              }`}
                              title={`Sort by ${col.label}`}
                            >
                              <span>{col.label}</span>
                              <SortIcon className={`w-3.5 h-3.5 shrink-0 ${isSorted ? "text-purple-600" : "text-gray-400"}`} />
                            </button>
                          </th>
                        );
                      })}
                      <th className="px-2 py-2.5 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle sticky right-0 bg-gradient-to-r from-red-50 to-amber-50">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {paginated.map((e) => {
                      const rejectionRemark = getRejectionRemark(e);
                      const fields = getExcelInquiryFields(e);
                      return (
                        <tr key={e.id} className="hover:bg-red-50/35 transition-colors">
                          {INQUIRY_TABLE_COLUMNS.map((col) => {
                            const raw = fields[col.id];
                            const display = formatInquiryCellValue(raw, col.valueType, formatDateDdMmYyyy);
                            const alignClass =
                              col.align === "center"
                                ? "text-center"
                                : col.align === "right"
                                  ? "text-right"
                                  : "text-left";
                            const typeClass =
                              col.valueType === "number" || col.valueType === "currency" ? "tabular-nums" : "";
                            return (
                              <td
                                key={col.id}
                                className={`px-2 py-2.5 align-middle text-xs text-gray-600 ${alignClass} ${typeClass} ${
                                  col.wrap ? "whitespace-normal" : "whitespace-nowrap"
                                }`}
                              >
                                {col.wrap ? (
                                  <span className="line-clamp-2 block" title={display === "—" ? undefined : display}>
                                    {display}
                                  </span>
                                ) : (
                                  display
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2.5 align-middle sticky right-0 bg-white">
                            <div className="flex justify-center items-center gap-1.5">
                              {canApproveEnquiries ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(e.id)}
                                    title="Approve"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openRejectDialog(e)}
                                    title="Regret with remark"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              ) : null}
                              {rejectionRemark ? (
                                <button
                                  type="button"
                                  onClick={() => openRemarkDialog(e)}
                                  title="View regret remark"
                                  className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openEdit(e.id)}
                                title="Edit"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(e.id)}
                                title="Delete"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
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
          <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-lg">
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <span>
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
              </span>
              <label className="inline-flex items-center gap-2">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded-md bg-white text-xs"
                >
                  {INQUIRY_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-200 text-gray-700 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600 min-w-[88px] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-200 text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

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
          <div className="max-h-[95vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="h-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500" />
            <div className="flex items-start justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold sm:text-xl text-slate-900 truncate">{editingId ? "Edit Manpower Inquiry" : "Add Manpower Inquiry"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Fields match the Manpower Management Excel tracker.</p>
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
              <div className="bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
              <ManpowerEnquiryFormPanel key={editingId || "new"} enquiryId={editingId} onSaved={afterSave} onCancel={closeForm} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManpowerManagement;
