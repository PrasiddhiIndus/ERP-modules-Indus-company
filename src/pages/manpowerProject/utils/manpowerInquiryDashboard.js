import { formatDateDdMmYyyy, normalizeToIsoDate } from "../../../utils/dateDisplay";
import { CHART_SERIES, TOKENS } from "../../../theme/tokens";
import {
  getEnquiryResultFromRow,
  getExcelInquiryFields,
  getTrackingStatusFromRow,
  VERTICAL_OPTIONS,
} from "./manpowerEnquiryExcelFields";
import {
  getInquiryFilterOptions,
  INQUIRY_STATUS_OPTIONS,
  sortInquiries,
} from "./manpowerInquiryList";

export { INQUIRY_STATUS_OPTIONS, sortInquiries, getInquiryFilterOptions };

/** Clean analytics filters only (no workflow/schema changes). */
export const DASHBOARD_EMPTY_FILTERS = {
  view: "all",
  receivedMonth: "",
  vertical: "",
  analyticsStatus: "",
};

export const ANALYTICS_STATUS_OPTIONS = [
  "Awarded to IFSPL",
  "Not Awarded",
  "Budgetary",
  "In Progress",
];

export const ANALYTICS_STATUS_COLORS = {
  "Awarded to IFSPL": TOKENS.success,
  "Not Awarded": TOKENS.critical,
  Budgetary: TOKENS.warning,
  "In Progress": TOKENS.info,
  Unknown: TOKENS.textDisabled,
};

export const STATUS_CHART_COLORS = {
  Pending: TOKENS.warning,
  Approved: TOKENS.success,
  Rejected: TOKENS.critical,
  Quoted: TOKENS.info,
  Unknown: TOKENS.textDisabled,
};

export const VERTICAL_COLORS = {
  "Fire Tender": TOKENS.critical,
  Manpower: TOKENS.info,
  Training: CHART_SERIES[2],
  Unspecified: TOKENS.textDisabled,
};

export const CHART_PALETTE = [...CHART_SERIES];

/** Online Tender = tender channel; all other modes = enquiry channel. */
export function isTenderEnquiry(row) {
  const fields = getExcelInquiryFields(row);
  const mode = String(fields.modeOfSubmission || fields.sourceType || "")
    .trim()
    .toLowerCase();
  return mode === "online tender";
}

/**
 * Business outcome for analytics (derived from existing result / status fields).
 * Awarded = Alloted · Not Awarded = Not Alloted · Budgetary = Quoted (open) · else In Progress.
 */
export function getAnalyticsStatus(row) {
  const result = String(getEnquiryResultFromRow(row) || "").trim();
  if (result === "Alloted" || result === "Awarded to IFSPL") return "Awarded to IFSPL";
  if (result === "Not Alloted" || result === "Awarded to Other Party") return "Not Awarded";
  const status = String(row?.status || "").trim();
  if (status === "Quoted") return "Budgetary";
  return "In Progress";
}

/** @deprecated use getAnalyticsStatus — kept for older imports */
export function getEnquiryOutcome(row) {
  const status = getAnalyticsStatus(row);
  if (status === "Awarded to IFSPL") return "awarded";
  if (status === "Not Awarded") return "not_awarded";
  return "pipeline";
}

export function parseApproxValue(row) {
  const fields = getExcelInquiryFields(row);
  const n = Number(String(fields.approxValue || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function strikeRatePct(won, total) {
  if (!total || total <= 0) return null;
  return Math.round((won / total) * 1000) / 10;
}

function winRatePct(awarded, notAwarded) {
  const decided = awarded + notAwarded;
  if (decided <= 0) return null;
  return Math.round((awarded / decided) * 1000) / 10;
}

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
  return Object.entries(filters || {}).filter(([key, v]) => {
    if (key === "view" && (!v || v === "all")) return false;
    return String(v || "").trim() !== "";
  }).length;
}

export function applyDashboardFilters(enquiries, { searchQuery, filters } = {}) {
  const f = filters || DASHBOARD_EMPTY_FILTERS;
  const q = String(searchQuery || "").trim().toLowerCase();

  return (enquiries || []).filter((row) => {
    if (f.view === "enquiries" && isTenderEnquiry(row)) return false;
    if (f.view === "tenders" && !isTenderEnquiry(row)) return false;

    if (f.vertical) {
      const fields = getExcelInquiryFields(row);
      if (fields.vertical !== f.vertical) return false;
    }

    if (f.analyticsStatus && getAnalyticsStatus(row) !== f.analyticsStatus) return false;

    if (f.receivedMonth) {
      const monthKey = String(f.receivedMonth).trim().slice(0, 7);
      if (monthKey && receiptMonthKey(getExcelInquiryFields(row).receivedDate) !== monthKey) {
        return false;
      }
    }

    // Legacy list-filter keys (harmless if unused by new UI)
    if (f.status && String(row.status || "Pending") !== f.status) return false;
    if (f.result && getEnquiryResultFromRow(row) !== f.result) return false;
    if (f.modeOfSubmission) {
      const fields = getExcelInquiryFields(row);
      if (fields.modeOfSubmission !== f.modeOfSubmission) return false;
    }
    if (f.enquiryAssignedTo) {
      const fields = getExcelInquiryFields(row);
      if (f.enquiryAssignedTo === "__unassigned__") {
        if (fields.enquiryAssignedTo) return false;
      } else if (fields.enquiryAssignedTo !== f.enquiryAssignedTo) {
        return false;
      }
    }

    if (q) {
      const fields = getExcelInquiryFields(row);
      const hay = [
        fields.clientName,
        fields.location,
        fields.enquiryAssignedTo,
        fields.vertical,
        row.enquiry_number,
        getAnalyticsStatus(row),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

export function getReceivedMonthOptions(rows) {
  const set = new Set();
  for (const row of rows || []) {
    const key = receiptMonthKey(getExcelInquiryFields(row).receivedDate);
    if (key) set.add(key);
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function formatReceivedMonthLabel(monthKey) {
  if (!monthKey || monthKey.length < 7) return monthKey || "";
  const [y, m] = monthKey.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return monthKey;
  return `${months[mi]} ${y}`;
}

export function countByOutcome(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const name = getAnalyticsStatus(row);
    map.set(name, (map.get(name) || 0) + 1);
  }
  return ANALYTICS_STATUS_OPTIONS.map((name) => ({
    name,
    value: map.get(name) || 0,
    fill: ANALYTICS_STATUS_COLORS[name] || ANALYTICS_STATUS_COLORS.Unknown,
  })).filter((d) => d.value > 0);
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

export function countByTrackingStatus(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const label = getTrackingStatusFromRow(row) || "New";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({
      name,
      value,
      fill: CHART_PALETTE[Math.abs(name.length) % CHART_PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value);
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

/** Monthly volume split: enquiries vs tenders. */
export function countMonthlyVolume(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = receiptMonthKey(getExcelInquiryFields(row).receivedDate);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { enquiries: 0, tenders: 0 });
    const bucket = map.get(key);
    if (isTenderEnquiry(row)) bucket.tenders += 1;
    else bucket.enquiries += 1;
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, counts]) => ({
      key,
      name: formatReceivedMonthLabel(key),
      enquiries: counts.enquiries,
      tenders: counts.tenders,
      total: counts.enquiries + counts.tenders,
    }));
}

/** Monthly awarded (Alloted) trend. */
export function countAwardTrend(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (getAnalyticsStatus(row) !== "Awarded to IFSPL") continue;
    const key = receiptMonthKey(getExcelInquiryFields(row).receivedDate);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, awarded]) => ({
      key,
      name: formatReceivedMonthLabel(key),
      awarded,
    }));
}

/** Conversion funnel stages from filtered rows. */
export function buildConversionFunnel(rows) {
  const total = (rows || []).length;
  let open = 0;
  let decided = 0;
  let awarded = 0;
  for (const row of rows || []) {
    const status = getAnalyticsStatus(row);
    if (status === "Awarded to IFSPL") {
      awarded += 1;
      decided += 1;
    } else if (status === "Not Awarded") {
      decided += 1;
    } else {
      open += 1;
    }
  }
  return [
    { name: "Total records", value: total, fill: TOKENS.info },
    { name: "Open pipeline", value: open, fill: TOKENS.warning },
    { name: "Decided", value: decided, fill: CHART_SERIES[2] },
    { name: "Awarded to IFSPL", value: awarded, fill: TOKENS.success },
  ];
}

/** @deprecated retained for Commercial MT overview compatibility */
export function countByMonth(rows) {
  return countMonthlyVolume(rows).map((d) => ({
    name: d.name,
    count: d.total,
    key: d.key,
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
    const add = parseApproxValue(row);
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

  let awarded = 0;
  let notAwarded = 0;
  let budgetary = 0;
  let inProgress = 0;
  let pipeline = 0;
  let pipelineValue = 0;
  let awardedValue = 0;

  let enquiryTotal = 0;
  let tenderTotal = 0;
  let enquiryAwarded = 0;
  let enquiryNotAwarded = 0;
  let tenderAwarded = 0;
  let tenderNotAwarded = 0;

  for (const row of rows || []) {
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

    const val = parseApproxValue(row);
    if (val > 0) totalValue += val;
    if (fields.offerSubmittedOn) offerSubmitted += 1;

    const tender = isTenderEnquiry(row);
    if (tender) tenderTotal += 1;
    else enquiryTotal += 1;

    const analyticsStatus = getAnalyticsStatus(row);
    if (analyticsStatus === "Awarded to IFSPL") {
      awarded += 1;
      awardedValue += val;
      if (tender) tenderAwarded += 1;
      else enquiryAwarded += 1;
    } else if (analyticsStatus === "Not Awarded") {
      notAwarded += 1;
      if (tender) tenderNotAwarded += 1;
      else enquiryNotAwarded += 1;
    } else if (analyticsStatus === "Budgetary") {
      budgetary += 1;
      pipeline += 1;
      pipelineValue += val;
    } else {
      inProgress += 1;
      pipeline += 1;
      pipelineValue += val;
    }

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
    total: (rows || []).length,
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
    awarded,
    notAwarded,
    budgetary,
    inProgress,
    pipeline,
    pipelineValue,
    awardedValue,
    enquiryTotal,
    tenderTotal,
    enquiryAwarded,
    enquiryNotAwarded,
    tenderAwarded,
    tenderNotAwarded,
    winRate: winRatePct(awarded, notAwarded),
    enquiryStrikeRate: strikeRatePct(enquiryAwarded, enquiryTotal),
    tenderStrikeRate: strikeRatePct(tenderAwarded, tenderTotal),
    overallStrikeRate: strikeRatePct(awarded, (rows || []).length),
  };
}

export function strikeRateChartData(stats) {
  return [
    {
      name: "Enquiry",
      rate: stats?.enquiryStrikeRate ?? 0,
      hasData: stats?.enquiryStrikeRate != null,
      awarded: stats?.enquiryAwarded || 0,
      total: stats?.enquiryTotal || 0,
    },
    {
      name: "Tender",
      rate: stats?.tenderStrikeRate ?? 0,
      hasData: stats?.tenderStrikeRate != null,
      awarded: stats?.tenderAwarded || 0,
      total: stats?.tenderTotal || 0,
    },
    {
      name: "Overall",
      rate: stats?.overallStrikeRate ?? 0,
      hasData: stats?.overallStrikeRate != null,
      awarded: stats?.awarded || 0,
      total: stats?.total || 0,
    },
  ];
}

export function getAttentionRows(rows, limit = 10) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (rows || [])
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
