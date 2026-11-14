/** Period helpers — monthly keys (YYYY-MM), quarterly, yearly aggregation. */

export const PERIOD_START_YEAR = 2010;
export const PERIOD_END_YEAR = 2035;

export const MONTH_NUMBERS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

export function buildYearOptions({ startYear = PERIOD_START_YEAR, endYear = PERIOD_END_YEAR } = {}) {
  const out = [];
  for (let y = endYear; y >= startYear; y--) out.push(y);
  return out;
}

export function parsePeriodKey(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(String(key))) return null;
  const [year, month] = String(key).split("-").map(Number);
  if (!year || month < 1 || month > 12) return null;
  return { year, month, key: String(key) };
}

export function periodAbsoluteIndex(key) {
  const p = parsePeriodKey(key);
  if (!p) return -1;
  return p.year * 12 + (p.month - 1);
}

export function indexToPeriodKey(idx) {
  if (idx < 0) return null;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function comparePeriodKeys(a, b) {
  return periodAbsoluteIndex(a) - periodAbsoluteIndex(b);
}

export function periodKeysBetween(startKey, endKey) {
  const si = periodAbsoluteIndex(startKey);
  const ei = periodAbsoluteIndex(endKey);
  if (si < 0 || ei < 0) return [];
  const from = Math.min(si, ei);
  const to = Math.max(si, ei);
  const out = [];
  for (let i = from; i <= to; i++) out.push(indexToPeriodKey(i));
  return out;
}

export function buildMonthOptions({
  startYear = PERIOD_START_YEAR,
  endYear = PERIOD_END_YEAR,
  startMonth = 1,
  count,
} = {}) {
  const out = [];
  if (count != null) {
    for (let i = 0; i < count; i++) {
      const d = new Date(startYear, startMonth - 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label =
        d.toLocaleString("en-US", { month: "short" }) +
        "-" +
        String(d.getFullYear()).slice(2);
      out.push({ key, label, year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return out;
  }
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    for (let m = mStart; m <= 12; m++) {
      const d = new Date(y, m - 1, 1);
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const label =
        d.toLocaleString("en-US", { month: "short" }) + "-" + String(y).slice(2);
      out.push({ key, label, year: y, month: m });
    }
  }
  return out;
}

export function monthLabelOf(key, months = null) {
  const list = months || buildMonthOptions();
  const found = list.find((m) => m.key === key);
  if (found) return found.label;
  const p = parsePeriodKey(key);
  if (!p) return key;
  const d = new Date(p.year, p.month - 1, 1);
  return (
    d.toLocaleString("en-US", { month: "short" }) + "-" + String(p.year).slice(2)
  );
}

export function monthIdx(key, months) {
  if (!key) return -1;
  if (months?.length) {
    const i = months.findIndex((m) => m.key === key);
    if (i >= 0) return i;
  }
  return periodAbsoluteIndex(key);
}

export function dateToPeriodKey(dateStr) {
  if (!dateStr) return null;
  const d = String(dateStr).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(d)) return d;
  return null;
}

export function periodKeyToDateStart(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return null;
  return `${key}-01`;
}

export function currentPeriodKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Pending data-entry history before this period is collapsed by default (April 2026). */
export const PENDING_HISTORY_CUTOFF_KEY = "2026-04";

export function currentPeriodDateIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Map period key (YYYY-MM) to date input value (first day of month). */
export function periodKeyToDateInput(key) {
  if (!key) return currentPeriodDateIso().slice(0, 8) + "01";
  const p = parsePeriodKey(key);
  if (!p) return "";
  return `${p.year}-${String(p.month).padStart(2, "0")}-01`;
}

/** Display monthly period as DD/MM/YYYY (period start). */
export function formatPeriodDateDDMMYYYY(key) {
  const p = parsePeriodKey(key);
  if (!p) return String(key || "");
  const dd = "01";
  const mm = String(p.month).padStart(2, "0");
  return `${dd}/${mm}/${p.year}`;
}

/** Period keys from start through min(end, capKey), inclusive. */
export function periodKeysUpTo(capKey, monthsList = null) {
  const cap = capKey || currentPeriodKey();
  const capIdx = periodAbsoluteIndex(cap);
  const list = monthsList || buildMonthOptions();
  return list.filter((m) => periodAbsoluteIndex(m.key) <= capIdx).map((m) => m.key);
}

export function getPeriodRange(mode, anchorKey, months) {
  const idx = monthIdx(anchorKey, months);
  if (idx < 0) return [anchorKey];

  if (mode === "monthly") return [anchorKey];

  if (mode === "quarterly") {
    const p = parsePeriodKey(anchorKey);
    if (!p) return [anchorKey];
    const qStart = Math.floor((p.month - 1) / 3) * 3;
    return buildMonthOptions({ startYear: p.year, endYear: p.year })
      .filter((x) => x.month > qStart && x.month <= qStart + 3)
      .map((x) => x.key);
  }

  if (mode === "yearly") {
    const p = parsePeriodKey(anchorKey);
    if (!p) return [anchorKey];
    return buildMonthOptions({ startYear: p.year, endYear: p.year }).map((x) => x.key);
  }

  return [anchorKey];
}

export function prevPeriodKey(key, months) {
  const i = periodAbsoluteIndex(key);
  const min = periodAbsoluteIndex(`${PERIOD_START_YEAR}-01`);
  if (i <= min) return null;
  return indexToPeriodKey(i - 1);
}

export function inContract(site, periodKey, months) {
  const start = site.contractStart ? dateToPeriodKey(site.contractStart) : null;
  const end = site.contractEnd ? dateToPeriodKey(site.contractEnd) : null;
  if (!start && !end) return true;
  const i = monthIdx(periodKey, months);
  const si = start ? monthIdx(start, months) : periodAbsoluteIndex(`${PERIOD_START_YEAR}-01`);
  const ei = end
    ? monthIdx(end, months)
    : periodAbsoluteIndex(`${PERIOD_END_YEAR}-12`);
  return i >= si && i <= ei;
}

export function expectedPeriods(site, uptoKey, months) {
  const start = site.contractStart
    ? dateToPeriodKey(site.contractStart)
    : months[0]?.key || `${PERIOD_START_YEAR}-01`;
  const end = site.contractEnd
    ? dateToPeriodKey(site.contractEnd)
    : months[months.length - 1]?.key || `${PERIOD_END_YEAR}-12`;
  const cap = uptoKey || end;
  const endKey = comparePeriodKeys(end, cap) <= 0 ? end : cap;
  if (!start) return [];
  return periodKeysBetween(start, endKey);
}

/* ───────────── Multi-month / Financial-year helpers (Indian FY: Apr–Mar) ───────────── */

/** FY start year for a period key — e.g. 2026-02 → 2025 (FY 2025-26). */
export function financialYearOf(key) {
  const p = parsePeriodKey(key);
  if (!p) return null;
  return p.month >= 4 ? p.year : p.year - 1;
}

export function fyLabel(fyStartYear) {
  return `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
}

/** The 12 period keys of a financial year, Apr → Mar. */
export function fyMonthKeys(fyStartYear) {
  return periodKeysBetween(`${fyStartYear}-04`, `${fyStartYear + 1}-03`);
}

/**
 * Deduplicate, validate and chronologically sort a month selection.
 * Guarantees each period is counted once in multi-month aggregation.
 */
export function normalizeMonthSelection(keys) {
  const seen = new Set();
  (keys || []).forEach((k) => {
    if (parsePeriodKey(k)) seen.add(k);
  });
  return [...seen].sort(comparePeriodKeys);
}

/** True when the (normalized) selection is an unbroken run of months. */
export function isContiguousSelection(keys) {
  const sel = normalizeMonthSelection(keys);
  for (let i = 1; i < sel.length; i++) {
    if (periodAbsoluteIndex(sel[i]) - periodAbsoluteIndex(sel[i - 1]) !== 1) return false;
  }
  return true;
}

/** Compact human label for a month selection: "Apr-25", "Apr-25 – Jun-25", "Apr-25, Jun-25 (+3)". */
export function describeMonthSelection(keys, labelFn = monthLabelOf) {
  const sel = normalizeMonthSelection(keys);
  if (!sel.length) return "No months selected";
  if (sel.length === 1) return labelFn(sel[0]);
  const fy = financialYearOf(sel[0]);
  const full = fyMonthKeys(fy);
  if (sel.length === 12 && sel.every((k, i) => k === full[i])) return fyLabel(fy);
  if (isContiguousSelection(sel)) return `${labelFn(sel[0])} – ${labelFn(sel[sel.length - 1])}`;
  if (sel.length <= 4) return sel.map((k) => labelFn(k)).join(", ");
  return `${sel.slice(0, 3).map((k) => labelFn(k)).join(", ")} (+${sel.length - 3} more)`;
}
