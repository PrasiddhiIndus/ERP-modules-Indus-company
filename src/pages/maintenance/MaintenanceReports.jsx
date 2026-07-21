import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  applyMaintenanceCustomFilters,
  exportMaintenanceReportCsv,
  fetchClientReportRows,
  fetchContractReportRows,
  fetchEnquiryReportRows,
  fetchFollowUpReportRows,
  fetchQuotationReportRows,
  fetchSiteVisitReportRows,
  filterEnquiryPrebuilt,
  filterFollowUpPrebuilt,
  filterQuotationPrebuilt,
  formatMaintenanceReportError,
  getCustomFieldsForTab,
} from "../../lib/maintenanceReports";
import { Badge, DenseTable, FilterBar, SectionCard, TinyInput, TinySelect } from "./components/MaintenanceReportsUi";

const ACCENT = "bg-red-700";
const ACCENT_BORDER = "border-red-700";
const QUOTATION_STATUS_OPTIONS = ["Draft", "Sent", "Accepted", "Approved"];
const FOLLOWUP_STATUS_OPTIONS = ["Pending", "Overdue", "Completed"];
const CONTRACT_STATUS_OPTIONS = ["Awarded", "In Progress", "Delivered", "Closed"];

const REPORT_TABS = [
  { id: "enquiry", label: "Enquiry reports" },
  { id: "quotation", label: "Quotation reports" },
  { id: "client", label: "Client reports" },
  { id: "followup", label: "Follow-up reports" },
  { id: "orders", label: "PO / contract reports" },
];

const ENQUIRY_REPORT_TYPES = [
  { id: "register", label: "Enquiry register" },
  { id: "open-pipeline", label: "Open pipeline" },
  { id: "converted", label: "Converted to quotation" },
  { id: "closing-overdue", label: "Past expected closing" },
  { id: "custom", label: "Custom report builder" },
];

const QUOTATION_REPORT_TYPES = [
  { id: "register", label: "Quotation register" },
  { id: "sent", label: "Sent quotations" },
  { id: "draft", label: "Draft quotations" },
  { id: "accepted", label: "Accepted quotations" },
  { id: "custom", label: "Custom report builder" },
];

const CLIENT_REPORT_TYPES = [
  { id: "register", label: "Client master register" },
  { id: "custom", label: "Custom report builder" },
];

const FOLLOWUP_REPORT_TYPES = [
  { id: "register", label: "Follow-up register" },
  { id: "overdue", label: "Overdue follow-ups" },
  { id: "pending", label: "Pending follow-ups" },
  { id: "site-visits", label: "Site visit register" },
  { id: "custom", label: "Custom report builder" },
];

const ORDERS_REPORT_TYPES = [
  { id: "register", label: "PO / contract register" },
  { id: "custom", label: "Custom report builder" },
];

const CATALOG_BY_TAB = {
  enquiry: ["Enquiry source analysis", "Assignee workload", "Estimated value pipeline"],
  quotation: ["Revision tracker export", "Costing sheet linkage", "Win / loss summary"],
  client: ["Industry-wise client list", "Region-wise client list", "Inactive clients"],
  followup: ["Revision reminder log", "Visitor expense summary"],
  orders: ["Awarded vs pending PO", "Delivery schedule tracker"],
};

const PAGE_SIZES = [25, 50, 100, 200];

const ENQUIRY_STATUS_OPTIONS = ["New", "In Progress", "Follow Up", "Closed"];
const ENQUIRY_SOURCE_OPTIONS = ["Email", "Phone", "Website", "Referral", "Exhibition", "Other"];

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function defaultCustomColumns(tabId, reportType) {
  const fields = getCustomFieldsForTab(tabId, reportType);
  return fields.slice(0, Math.min(8, fields.length)).map((f) => f.id);
}

function reportTypesForTab(tabId) {
  if (tabId === "enquiry") return ENQUIRY_REPORT_TYPES;
  if (tabId === "quotation") return QUOTATION_REPORT_TYPES;
  if (tabId === "client") return CLIENT_REPORT_TYPES;
  if (tabId === "followup") return FOLLOWUP_REPORT_TYPES;
  if (tabId === "orders") return ORDERS_REPORT_TYPES;
  return [];
}

function isRunnableTab(tabId) {
  return ["enquiry", "quotation", "client", "followup", "orders"].includes(tabId);
}

export default function MaintenanceReports() {
  const today = isoDateToday();
  const [activeTab, setActiveTab] = useState("enquiry");
  const [reportType, setReportType] = useState("register");
  const [fromDate, setFromDate] = useState(today.slice(0, 8) + "01");
  const [toDate, setToDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [clientSearch, setClientSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [search, setSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [customColumns, setCustomColumns] = useState(defaultCustomColumns("enquiry", "register"));

  const catalogItems = CATALOG_BY_TAB[activeTab] || [];
  const reportTypes = reportTypesForTab(activeTab);
  const customFieldDefs = getCustomFieldsForTab(activeTab, reportType);

  useEffect(() => {
    const types = reportTypesForTab(activeTab);
    const nextType = types[0]?.id || "register";
    setReportType(nextType);
    setCustomColumns(defaultCustomColumns(activeTab, nextType));
    setHasRun(false);
    setRows([]);
    setError("");
    setPage(1);
    setCatalogSearch("");
    setStatusFilter("ALL");
    setSourceFilter("ALL");
    setClientSearch("");
    setAssigneeSearch("");
    setSearch("");
    setMinValue("");
    setMaxValue("");
  }, [activeTab]);

  useEffect(() => {
    setCustomColumns(defaultCustomColumns(activeTab, reportType));
    setHasRun(false);
    setPage(1);
  }, [activeTab, reportType]);

  const filteredCatalogItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalogItems;
    return catalogItems.filter((it) => String(it).toLowerCase().includes(q));
  }, [catalogItems, catalogSearch]);

  const runReport = useCallback(async () => {
    if (!isRunnableTab(activeTab)) return;
    setLoading(true);
    setError("");
    setPage(1);
    try {
      let data = [];
      const range = activeTab === "client" ? {} : { fromDate, toDate };

      if (activeTab === "enquiry") {
        data = await fetchEnquiryReportRows(supabase, range);
        if (reportType !== "register" && reportType !== "custom") {
          data = filterEnquiryPrebuilt(data, reportType);
        }
      } else if (activeTab === "quotation") {
        data = await fetchQuotationReportRows(supabase, range);
        if (reportType !== "register" && reportType !== "custom") {
          data = filterQuotationPrebuilt(data, reportType);
        }
      } else if (activeTab === "client") {
        data = await fetchClientReportRows(supabase);
      } else if (activeTab === "followup") {
        if (reportType === "site-visits") {
          data = await fetchSiteVisitReportRows(supabase, range);
        } else {
          data = await fetchFollowUpReportRows(supabase, range);
          if (reportType !== "register" && reportType !== "custom") {
            data = filterFollowUpPrebuilt(data, reportType);
          }
        }
      } else if (activeTab === "orders") {
        data = await fetchContractReportRows(supabase, range);
      }

      if (reportType === "custom" || activeTab === "client") {
        data = applyMaintenanceCustomFilters(data, {
          status: statusFilter,
          clientSearch,
          assigneeSearch,
          search,
          source: sourceFilter,
          minValue,
          maxValue,
        });
      } else {
        data = applyMaintenanceCustomFilters(data, {
          status: statusFilter,
          clientSearch,
          assigneeSearch,
          search: search || clientSearch,
          source: sourceFilter,
          minValue,
          maxValue,
        });
      }

      setRows(data);
      setHasRun(true);
    } catch (err) {
      setRows([]);
      setError(formatMaintenanceReportError(err));
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    assigneeSearch,
    clientSearch,
    fromDate,
    maxValue,
    minValue,
    reportType,
    search,
    sourceFilter,
    statusFilter,
    toDate,
  ]);

  const tableColumns = useMemo(() => {
    if (reportType === "custom") {
      return customFieldDefs
        .filter((f) => customColumns.includes(f.id))
        .map((f) => ({
          key: f.id,
          label: f.label,
          render: ["enquiryDate", "expectedClosingDate", "quotationDate", "followUpDate", "dueDate", "visitDate", "poDate", "expectedDeliveryDate", "awardedDate", "createdAt"].includes(f.id)
            ? (r) => formatDateDdMmYyyy(r[f.id]) || r[f.id] || "—"
            : undefined,
        }));
    }

    if (activeTab === "enquiry") {
      return [
        { key: "enquiryNumber", label: "Enquiry no." },
        { key: "enquiryDate", label: "Date", render: (r) => formatDateDdMmYyyy(r.enquiryDate) || "—" },
        { key: "clientName", label: "Client" },
        { key: "source", label: "Source" },
        { key: "assignedTo", label: "Assigned to" },
        { key: "estimatedValue", label: "Est. value (₹)" },
        { key: "status", label: "Status" },
        { key: "convertedToQuotation", label: "Converted" },
      ];
    }
    if (activeTab === "quotation") {
      return [
        { key: "quotationNumber", label: "Quotation no." },
        { key: "quotationDate", label: "Date", render: (r) => formatDateDdMmYyyy(r.quotationDate) || "—" },
        { key: "clientName", label: "Client" },
        { key: "enquiryNumber", label: "Enquiry no." },
        { key: "finalAmount", label: "Final (₹)" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "client") {
      return [
        { key: "clientName", label: "Client" },
        { key: "industry", label: "Industry" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "primaryContact", label: "Contact" },
        { key: "contactNumber", label: "Phone" },
      ];
    }
    if (activeTab === "followup" && reportType === "site-visits") {
      return [
        { key: "visitDate", label: "Visit date", render: (r) => formatDateDdMmYyyy(r.visitDate) || "—" },
        { key: "visitorName", label: "Visitor" },
        { key: "companyName", label: "Company" },
        { key: "clientName", label: "Client" },
        { key: "siteLocation", label: "Location" },
        { key: "totalExpense", label: "Expense (₹)" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "followup") {
      return [
        { key: "followUpDate", label: "Follow-up date", render: (r) => formatDateDdMmYyyy(r.followUpDate) || "—" },
        { key: "clientName", label: "Client" },
        { key: "enquiryNumber", label: "Enquiry no." },
        { key: "quotationNumber", label: "Quotation no." },
        { key: "status", label: "Status" },
        { key: "remarks", label: "Remarks" },
      ];
    }
    return [
      { key: "poNumber", label: "PO no." },
      { key: "poDate", label: "PO date", render: (r) => formatDateDdMmYyyy(r.poDate) || "—" },
      { key: "clientName", label: "Client" },
      { key: "quotationNumber", label: "Quotation no." },
      { key: "poValue", label: "PO value (₹)" },
      { key: "status", label: "Status" },
      { key: "expectedDeliveryDate", label: "Delivery", render: (r) => formatDateDdMmYyyy(r.expectedDeliveryDate) || "—" },
    ];
  }, [activeTab, customColumns, customFieldDefs, reportType]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, rows.length);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [currentPage, pageSize, rows]);

  const toggleCustomColumn = (id) => {
    setCustomColumns((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleExport = () => {
    if (!rows.length) return;
    const cols =
      reportType === "custom"
        ? customColumns
        : tableColumns.map((c) => c.key);
    const fieldDefs =
      reportType === "custom"
        ? customFieldDefs
        : getCustomFieldsForTab(activeTab, reportType);
    const slug = `${activeTab}-${reportType}`;
    exportMaintenanceReportCsv(rows, cols, fieldDefs, `maintenance-${slug}-${fromDate}-to-${toDate}.csv`);
  };

  const showDateRange = activeTab !== "client";
  const showEnquiryFilters = activeTab === "enquiry";
  const showStatusFilter = ["enquiry", "quotation", "followup", "orders"].includes(activeTab) && reportType !== "site-visits";
  const statusOptions =
    activeTab === "quotation"
      ? QUOTATION_STATUS_OPTIONS
      : activeTab === "followup"
        ? FOLLOWUP_STATUS_OPTIONS
        : activeTab === "orders"
          ? CONTRACT_STATUS_OPTIONS
          : ENQUIRY_STATUS_OPTIONS;

  return (
    <div className="w-full min-h-screen overflow-y-auto bg-gradient-to-b from-slate-50/70 to-white px-4 sm:px-6 py-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4 sm:p-5">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Maintenance — Reports & Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prebuilt registers and custom report builder for enquiries, quotations, clients, follow-ups, and POs.
          </p>
        </div>

        <SectionCard
          title="Reports & analytics"
          right={<Badge tone="bg-red-50 text-red-800">Export CSV</Badge>}
        >
          <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
            {REPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
                  activeTab === tab.id ? `${ACCENT} text-white` : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {reportTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setReportType(t.id)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${
                  reportType === t.id
                    ? `${ACCENT} text-white ${ACCENT_BORDER}`
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <FilterBar>
            {showDateRange ? (
              <>
                <TinyInput type="date" className="w-[130px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <TinyInput type="date" className="w-[130px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </>
            ) : null}
            <TinyInput
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Client name"
              className="min-w-[140px]"
            />
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all fields"
              className="min-w-[140px]"
            />
            {showEnquiryFilters ? (
              <>
                <TinySelect value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="min-w-[120px]">
                  <option value="ALL">All sources</option>
                  {ENQUIRY_SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </TinySelect>
                <TinyInput
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder="Assigned to"
                  className="min-w-[120px]"
                />
              </>
            ) : null}
            {showStatusFilter ? (
              <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[130px]">
                <option value="ALL">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </TinySelect>
            ) : null}
            {(activeTab === "enquiry" || activeTab === "quotation" || activeTab === "orders") && (
              <>
                <TinyInput
                  type="number"
                  min="0"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                  placeholder="Min value"
                  className="w-[90px]"
                />
                <TinyInput
                  type="number"
                  min="0"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  placeholder="Max value"
                  className="w-[90px]"
                />
              </>
            )}
            <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[100px]">
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </TinySelect>
            <button
              type="button"
              onClick={runReport}
              disabled={loading}
              className={`h-8 px-3 rounded-lg ${ACCENT} text-white text-xs disabled:opacity-60`}
            >
              {loading ? "Loading…" : "Run report"}
            </button>
            {hasRun && rows.length > 0 ? (
              <button
                type="button"
                onClick={handleExport}
                className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50"
              >
                Export CSV
              </button>
            ) : null}
          </FilterBar>

          {reportType === "custom" ? (
            <div className="mt-3 rounded-lg border border-red-100 bg-red-50/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-900">Custom report builder</p>
              <p className="text-[11px] text-gray-600">
                Choose columns, apply filters above, then run report. Data is pulled live from maintenance tables.
              </p>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Columns to include</p>
                <div className="flex flex-wrap gap-2">
                  {customFieldDefs.map((f) => (
                    <label
                      key={f.id}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] cursor-pointer ${
                        customColumns.includes(f.id)
                          ? `${ACCENT} text-white ${ACCENT_BORDER}`
                          : "bg-white border-gray-300 text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={customColumns.includes(f.id)}
                        onChange={() => toggleCustomColumn(f.id)}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
          ) : null}

          <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {!hasRun && !loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500 bg-gray-50/80">
                Select filters and click Run report.
              </div>
            ) : loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500">No rows for this report.</div>
            ) : (
              <>
                <DenseTable
                  serialOffset={(currentPage - 1) * pageSize}
                  rows={pagedRows}
                  columns={tableColumns}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5 text-[11px] text-gray-600">
                  <span>
                    Showing {pageStart}–{pageEnd} of {rows.length} row(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-7 px-3 rounded-md border border-gray-300 bg-white disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span>Page {currentPage} / {totalPages}</span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-7 px-3 rounded-md border border-gray-300 bg-white disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-700">Additional prebuilt reports</p>
              <TinyInput
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search report name"
                className="min-w-[160px]"
              />
            </div>
            <ul className="space-y-1 text-xs">
              {filteredCatalogItems.length === 0 ? (
                <li className="rounded-md border border-gray-100 bg-gray-50 px-2 py-3 text-center text-gray-500">
                  No reports match your search.
                </li>
              ) : (
                filteredCatalogItems.map((it) => (
                  <li
                    key={it}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-100 hover:bg-gray-50 px-2 py-1.5"
                  >
                    <span className="text-gray-700">{it}</span>
                    <span className="text-[10px] text-gray-400">Coming soon</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
