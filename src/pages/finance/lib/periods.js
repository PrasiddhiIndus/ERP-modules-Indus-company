/** Period helpers — monthly keys (YYYY-MM), quarterly, yearly aggregation. */

export function buildMonthOptions({ startYear = 2024, startMonth = 4, count = 36 } = {}) {
  const out = [];
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

export function monthLabelOf(key, months = null) {
  const list = months || buildMonthOptions();
  return list.find((m) => m.key === key)?.label || key;
}

export function monthIdx(key, months) {
  return months.findIndex((m) => m.key === key);
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

export function getPeriodRange(mode, anchorKey, months) {
  const idx = monthIdx(anchorKey, months);
  if (idx < 0) return [anchorKey];

  if (mode === "monthly") return [anchorKey];

  if (mode === "quarterly") {
    const m = months[idx];
    const qStart = Math.floor((m.month - 1) / 3) * 3;
    return months
      .filter((x) => x.year === m.year && x.month > qStart && x.month <= qStart + 3)
      .map((x) => x.key);
  }

  if (mode === "yearly") {
    const y = months[idx].year;
    return months.filter((x) => x.year === y).map((x) => x.key);
  }

  return [anchorKey];
}

export function prevPeriodKey(key, months) {
  const i = monthIdx(key, months);
  return i > 0 ? months[i - 1].key : null;
}

export function inContract(site, periodKey, months) {
  const start = site.contractStart ? dateToPeriodKey(site.contractStart) : null;
  const end = site.contractEnd ? dateToPeriodKey(site.contractEnd) : null;
  if (!start && !end) return true;
  const i = monthIdx(periodKey, months);
  const si = start ? monthIdx(start, months) : 0;
  const ei = end ? monthIdx(end, months) : months.length - 1;
  return i >= si && i <= ei;
}

export function expectedPeriods(site, uptoKey, months) {
  const start = site.contractStart ? dateToPeriodKey(site.contractStart) : months[0]?.key;
  const end = site.contractEnd ? dateToPeriodKey(site.contractEnd) : months[months.length - 1]?.key;
  const si = start ? monthIdx(start, months) : 0;
  const ei = Math.min(
    end ? monthIdx(end, months) : months.length - 1,
    monthIdx(uptoKey, months),
  );
  const out = [];
  for (let i = si; i <= ei; i++) {
    if (i >= 0 && months[i]) out.push(months[i].key);
  }
  return out;
}
