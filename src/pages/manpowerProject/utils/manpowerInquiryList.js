import {
  formatInquiryCellValue,
  getExcelInquiryFields,
  INQUIRY_TABLE_COLUMNS,
  INQUIRY_LIST_DISPLAY_COLUMNS,
} from "./manpowerEnquiryExcelFields";

export const INQUIRY_STATUS_OPTIONS = ["Pending", "Approved", "Rejected", "Quoted"];
export const INQUIRY_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const EMPTY_INQUIRY_FILTERS = {
  vertical: "",
  modeOfSubmission: "",
  enquiryAssignedTo: "",
  status: "",
  receivedFrom: "",
  receivedTo: "",
};

function getSortableFields(row) {
  const fields = getExcelInquiryFields(row);
  return {
    ...fields,
    enquiryNumber: row?.enquiry_number || "",
    status: row?.status || "Pending",
  };
}

export function inquiryMatchesMasterSearch(row, query, formatDate) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;

  const fields = getExcelInquiryFields(row);
  const tokens = [
    ...INQUIRY_TABLE_COLUMNS.map((col) =>
      formatInquiryCellValue(fields[col.id], col.valueType, formatDate)
    ),
    row?.status,
    row?.enquiry_number,
    row?.id,
  ];

  return tokens.some((token) => String(token ?? "").toLowerCase().includes(q));
}

function toDayStart(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function applyInquiryFilters(enquiries, { searchQuery, filters }, formatDate) {
  return (enquiries || []).filter((row) => {
    if (!inquiryMatchesMasterSearch(row, searchQuery, formatDate)) return false;

    const fields = getExcelInquiryFields(row);
    if (filters.vertical && fields.vertical !== filters.vertical) return false;
    if (filters.modeOfSubmission && fields.modeOfSubmission !== filters.modeOfSubmission) return false;
    if (filters.enquiryAssignedTo && fields.enquiryAssignedTo !== filters.enquiryAssignedTo) return false;
    if (filters.status && String(row.status || "Pending") !== filters.status) return false;

    const receivedTs = toDayStart(fields.receivedDate);
    const fromTs = toDayStart(filters.receivedFrom);
    const toTs = toDayStart(filters.receivedTo);
    if (fromTs != null && (receivedTs == null || receivedTs < fromTs)) return false;
    if (toTs != null && (receivedTs == null || receivedTs > toTs)) return false;

    return true;
  });
}

function resolveSortColumn(key) {
  return (
    INQUIRY_LIST_DISPLAY_COLUMNS.find((c) => c.id === key) ||
    INQUIRY_TABLE_COLUMNS.find((c) => c.id === key) ||
    INQUIRY_LIST_DISPLAY_COLUMNS[0]
  );
}

function sortValue(fields, col) {
  const raw = fields[col.id];
  if (col.valueType === "number" || col.valueType === "currency") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (col.valueType === "date") {
    const ts = toDayStart(raw);
    return ts == null ? null : ts;
  }
  if (col.id === "srNo") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return String(raw ?? "").trim().toLowerCase();
}

export function sortInquiries(enquiries, sortConfig) {
  const col = resolveSortColumn(sortConfig?.key);
  const dir = sortConfig?.dir === "asc" ? 1 : -1;
  const list = [...(enquiries || [])];

  list.sort((a, b) => {
    const fa = getSortableFields(a);
    const fb = getSortableFields(b);
    const av = sortValue(fa, col);
    const bv = sortValue(fb, col);

    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
  });

  return list;
}

export function getInquiryFilterOptions(enquiries) {
  const vertical = new Set();
  const modeOfSubmission = new Set();
  const enquiryAssignedTo = new Set();
  const status = new Set();

  (enquiries || []).forEach((row) => {
    const fields = getExcelInquiryFields(row);
    if (fields.vertical) vertical.add(fields.vertical);
    if (fields.modeOfSubmission) modeOfSubmission.add(fields.modeOfSubmission);
    if (fields.enquiryAssignedTo) enquiryAssignedTo.add(fields.enquiryAssignedTo);
    if (row.status) status.add(row.status);
  });

  const sortAlpha = (arr) => arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return {
    vertical: sortAlpha([...vertical]),
    modeOfSubmission: sortAlpha([...modeOfSubmission]),
    enquiryAssignedTo: sortAlpha([...enquiryAssignedTo]),
    status: sortAlpha([...status]),
  };
}

export function hasActiveInquiryFilters(filters) {
  return Object.values(filters || {}).some((v) => String(v || "").trim() !== "");
}
