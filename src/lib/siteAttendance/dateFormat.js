export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatDateLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateOnlyLocal(dateInput) {
  if (!dateInput) return null;
  const str = String(dateInput).split("T")[0];
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateDisplay(dateInput) {
  const d = parseDateOnlyLocal(dateInput);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function todayForDB() {
  return formatDateLocal(new Date());
}

export function addDaysIso(iso, days) {
  const d = parseDateOnlyLocal(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

export function parseLooseDateToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = pad2(dmy[1]);
    const month = pad2(dmy[2]);
    let year = dmy[3];
    if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateLocal(parsed);
}
