/** Audit metadata stored in period entry notes JSON (backward-compatible). */

export function buildPeriodAuditMeta(user) {
  const email = String(user?.email || "").trim();
  const name =
    user?.user_metadata?.username ||
    user?.user_metadata?.full_name ||
    email.split("@")[0] ||
    "User";
  return {
    updatedBy: name,
    updatedAt: new Date().toISOString(),
  };
}

export function readPeriodAudit(record) {
  if (!record || typeof record !== "object") return null;
  if (record._audit?.updatedAt) return record._audit;
  return null;
}

export function formatAuditTimestamp(iso) {
  if (!iso) return { date: "—", time: "—" };
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return { date, time };
  } catch {
    return { date: String(iso), time: "" };
  }
}
