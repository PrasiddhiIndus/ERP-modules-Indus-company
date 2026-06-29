import { formatDateDdMmYyyy, normalizeToIsoDate } from "../../../utils/dateDisplay";
import {
  getExcelInquiryFields,
  INQUIRY_TABLE_COLUMNS,
  VERTICAL_OPTIONS,
} from "./manpowerEnquiryExcelFields";
import {
  applyInquiryFilters,
  EMPTY_INQUIRY_FILTERS,
  getInquiryFilterOptions,
  INQUIRY_STATUS_OPTIONS,
  sortInquiries,
} from "./manpowerInquiryList";

export { INQUIRY_STATUS_OPTIONS, sortInquiries, getInquiryFilterOptions };

export const DASHBOARD_EMPTY_FILTERS = {
  ...EMPTY_INQUIRY_FILTERS,
  dueFrom: "",
  dueTo: "",
  offerSubmitted: "",
};

export const STATUS_CHART_COLORS = {
  Pending: "#fbbf24",
  Approved: "#34d399",
  Rejected: "#f87171",
  Quoted: "#38bdf8",
  Unknown: "#94a3b8",
};

export const VERTICAL_COLORS = {
  "Fire Tender": "#ef4444",
  Manpower: "#3b82f6",
  Training: "#8b5cf6",
  Unspecified: "#94a3b8",
};

export const CHART_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#eab308",
];

function toLocalDate(value) {
  const iso = normalizeToIsoDate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function receiptMonthKey(dateStr) {
  const iso = normalizeToIsoDate(dateStr);
  if (iso) return iso.slice(0, 7);
  return null;
}

export function activeDashboardFilterCount(filters) {
  return Object.entries(filters || {}).filter(([, v]) => String(v || "").trim() !== "").length;
}

export function applyDashboardFilters(enquiries, { searchQuery, filters }) {
  const listFilters = { ...filters };
  if (listFilters.enquiryAssignedTo === "__unassigned__") {
    listFilters.enquiryAssignedTo = "";
  }
  let list = applyInquiryFilters(enquiries, { searchQuery, filters: listFilters }, formatDateDdMmYyyy);

  if (filters.enquiryAssignedTo === "__unassigned__") {
    list = list.filter((row) => !getExcelInquiryFields(row).enquiryAssignedTo);
  }

  if (filters.dueFrom) {
    const from = toLocalDate(filters.dueFrom);
    list = list.filter((row) => {
      const due = toLocalDate(getExcelInquiryFields(row).dueDate);
      return due && from && due >= from;
    });
  }
  if (filters.dueTo) {
    const to = toLocalDate(filters.dueTo);
    list = list.filter((row) => {
      const due = toLocalDate(getExcelInquiryFields(row).dueDate);
      return due && to && due <= to;
    });
  }
  if (filters.offerSubmitted === "yes") {
    list = list.filter((row) => Boolean(getExcelInquiryFields(row).offerSubmittedOn));
  } else if (filters.offerSubmitted === "no") {
    list = list.filter((row) => !getExcelInquiryFields(row).offerSubmittedOn);
  }

  return list;
}

export function countByField(rows, fieldId, emptyLabel = "Unassigned") {
  const map = new Map();
  for (const row of rows) {
    const fields = getExcelInquiryFields(row);
    const raw = fields[fieldId];
    const label = raw == null || String(raw).trim() === "" ? emptyLabel : String(raw).trim();
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function countByStatus(rows) {
  const map = new Map();
  for (const row of rows) {
    const status = String(row.status || "Pending").trim() || "Pending";
    map.set(status, (map.get(status) || 0) + 1);
  }
  const ordered = INQUIRY_STATUS_OPTIONS.map((status) => ({
    name: status,
    value: map.get(status) || 0,
    fill: STATUS_CHART_COLORS[status] || STATUS_CHART_COLORS.Unknown,
  }));
  for (const [name, value] of map.entries()) {
    if (!INQUIRY_STATUS_OPTIONS.includes(name)) {
      ordered.push({ name, value, fill: STATUS_CHART_COLORS.Unknown });
    }
  }
  return ordered.filter((d) => d.value > 0);
}

export function countByVertical(rows) {
  const map = new Map();
  for (const row of rows) {
    const fields = getExcelInquiryFields(row);
    const label = fields.vertical || "Unspecified";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return VERTICAL_OPTIONS.map((name) => ({
    name,
    value: map.get(name) || 0,
    fill: VERTICAL_COLORS[name] || VERTICAL_COLORS.Unspecified,
  })).filter((d) => d.value > 0);
}

export function countByMonth(rows) {
  const map = new Map();
  for (const row of rows) {
    const fields = getExcelInquiryFields(row);
    const key = receiptMonthKey(fields.receivedDate);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, count]) => ({
      name: formatDateDdMmYyyy(`${key}-01`),
      count,
      key,
    }));
}

export function manpowerByVertical(rows) {
  const map = new Map();
  for (const row of rows) {
    const fields = getExcelInquiryFields(row);
    const vertical = fields.vertical || "Unspecified";
    const n = Number(fields.totalManpower);
    const add = Number.isFinite(n) && n > 0 ? n : 0;
    map.set(vertical, (map.get(vertical) || 0) + add);
  }
  return [...map.entries()]
    .map(([name, manpower]) => ({ name, manpower }))
    .sort((a, b) => b.manpower - a.manpower);
}

export function valueByVertical(rows) {
  const map = new Map();
  for (const row of rows) {
    const fields = getExcelInquiryFields(row);
    const vertical = fields.vertical || "Unspecified";
    const n = Number(String(fields.approxValue || "").replace(/,/g, ""));
    const add = Number.isFinite(n) && n > 0 ? n : 0;
    map.set(vertical, (map.get(vertical) || 0) + add);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function isClosedStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "approved" || s === "rejected" || s === "quoted";
}

export function computeDashboardStats(rows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let quoted = 0;
  let unassigned = 0;
  let overdue = 0;
  let dueSoon = 0;
  let totalManpower = 0;
  let totalValue = 0;
  let offerSubmitted = 0;

  for (const row of rows) {
    const status = String(row.status || "Pending").trim() || "Pending";
    const statusKey = status.toLowerCase();
    if (statusKey === "pending") pending += 1;
    else if (statusKey === "approved") approved += 1;
    else if (statusKey === "rejected") rejected += 1;
    else if (statusKey === "quoted") quoted += 1;

    const fields = getExcelInquiryFields(row);
    if (!fields.enquiryAssignedTo) unassigned += 1;

    const mp = Number(fields.totalManpower);
    if (Number.isFinite(mp) && mp > 0) totalManpower += mp;

    const val = Number(String(fields.approxValue || "").replace(/,/g, ""));
    if (Number.isFinite(val) && val > 0) totalValue += val;

    if (fields.offerSubmittedOn) offerSubmitted += 1;

    if (!isClosedStatus(status)) {
      const due = toLocalDate(fields.dueDate);
      if (due) {
        if (due < today) overdue += 1;
        else {
          const diffDays = Math.ceil((due - today) / (24 * 60 * 60 * 1000));
          if (diffDays <= 7) dueSoon += 1;
        }
      }
    }
  }

  return {
    total: rows.length,
    pending,
    approved,
    rejected,
    quoted,
    unassigned,
    overdue,
    dueSoon,
    totalManpower,
    totalValue,
    offerSubmitted,
  };
}

export function getAttentionRows(rows, limit = 10) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return rows
    .filter((row) => {
      const status = row.status || "Pending";
      if (isClosedStatus(status)) return false;
      const due = toLocalDate(getExcelInquiryFields(row).dueDate);
      return due && due <= today;
    })
    .map((row) => {
      const fields = getExcelInquiryFields(row);
      return {
        id: row.id,
        srNo: fields.srNo,
        client: fields.clientName || "—",
        assignee: fields.enquiryAssignedTo || "Unassigned",
        dueDate: fields.dueDate,
        status: row.status || "Pending",
        vertical: fields.vertical || "—",
      };
    })
    .slice(0, limit);
}

export const DASHBOARD_TABLE_COLUMNS = INQUIRY_TABLE_COLUMNS.filter((c) =>
  ["srNo", "receivedDate", "vertical", "clientName", "enquiryAssignedTo", "dueDate", "approxValue", "totalManpower"].includes(
    c.id
  )
);
