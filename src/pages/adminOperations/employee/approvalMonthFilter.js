export const ALL_MONTHS = "all";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "All months" + January…December (values "1"…"12"). */
export function buildApprovalMonthOptions() {
  return [
    { value: ALL_MONTHS, label: "All months" },
    ...MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label })),
  ];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function yearFromIso(iso) {
  const y = Number(String(iso || "").slice(0, 4));
  return Number.isFinite(y) && y >= 1900 ? y : null;
}

/**
 * Narrows the From/To range to the selected month. The month has no year of its own:
 * it uses the year of From (or To) when set, otherwise the current year.
 * Returns ISO yyyy-mm-dd strings (empty string = unbounded).
 */
export function applyMonthToDateRange(month, fromDate = "", toDate = "") {
  const m = Number(month);
  if (month === ALL_MONTHS || !Number.isInteger(m) || m < 1 || m > 12) {
    return { fromDate, toDate };
  }

  const year = yearFromIso(fromDate) ?? yearFromIso(toDate) ?? new Date().getFullYear();
  const lastDay = new Date(year, m, 0).getDate();
  const monthStart = `${year}-${pad2(m)}-01`;
  const monthEnd = `${year}-${pad2(m)}-${pad2(lastDay)}`;

  return {
    fromDate: fromDate && fromDate > monthStart ? fromDate : monthStart,
    toDate: toDate && toDate < monthEnd ? toDate : monthEnd,
  };
}
