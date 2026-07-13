const STORAGE_KEY = "commercial_mt_timeline_settings";
export const DEFAULT_BID_DEADLINE_REMINDER_DAYS = [7, 1];

function normalizeReminderDays(value) {
  if (!Array.isArray(value)) return [...DEFAULT_BID_DEADLINE_REMINDER_DAYS];
  const cleaned = value
    .map((day) => Number(day))
    .filter((day) => Number.isFinite(day) && day > 0)
    .map((day) => Math.trunc(day));
  const unique = Array.from(new Set(cleaned)).sort((a, b) => b - a);
  return unique.length ? unique : [...DEFAULT_BID_DEADLINE_REMINDER_DAYS];
}

export function getCommercialTimelineSettings() {
  if (typeof window === "undefined") {
    return { reminderDays: [...DEFAULT_BID_DEADLINE_REMINDER_DAYS] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { reminderDays: [...DEFAULT_BID_DEADLINE_REMINDER_DAYS] };
    const parsed = JSON.parse(raw);
    return { reminderDays: normalizeReminderDays(parsed?.reminderDays) };
  } catch {
    return { reminderDays: [...DEFAULT_BID_DEADLINE_REMINDER_DAYS] };
  }
}

export function saveCommercialTimelineSettings(settings) {
  const next = {
    reminderDays: normalizeReminderDays(settings?.reminderDays),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function formatReminderDaysLabel(days = DEFAULT_BID_DEADLINE_REMINDER_DAYS) {
  return normalizeReminderDays(days)
    .map((day) => `T-${day}`)
    .join(", ");
}
