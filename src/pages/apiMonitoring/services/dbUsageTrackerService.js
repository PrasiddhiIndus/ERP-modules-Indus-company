import { supabase } from "../../../lib/supabase";

/** Pro plan included Realtime messages / month (dashboard quota reference). */
export const REALTIME_INCLUDED_MONTHLY = 5_000_000;

/** Default daily write alert threshold (matches migration). */
export const DEFAULT_DAILY_WRITE_THRESHOLD = 150_000;

const CHECKLIST_KEY = "erp_supabase_invoice_checklist_v1";

/**
 * @typedef {Object} DbUsageRow
 * @property {string} id
 * @property {string} logged_at
 * @property {string} usage_date
 * @property {number} cumulative_writes
 * @property {number} total_daily_writes
 * @property {number} estimated_realtime_messages
 * @property {boolean} alert_triggered
 * @property {number} [subscriber_multiplier]
 * @property {number} [daily_write_threshold]
 * @property {string|null} [notes]
 */

/**
 * @param {number} [limit]
 * @returns {Promise<DbUsageRow[]>}
 */
export async function fetchDbUsageHistory(limit = 30) {
  const { data, error } = await supabase
    .from("db_usage_tracker")
    .select(
      "id, logged_at, usage_date, cumulative_writes, total_daily_writes, estimated_realtime_messages, alert_triggered, subscriber_multiplier, daily_write_threshold, notes"
    )
    .order("usage_date", { ascending: false })
    .limit(limit);

  if (error) {
    const msg = String(error.message || "");
    if (/relation .*db_usage_tracker.* does not exist|Could not find the table/i.test(msg)) {
      return [];
    }
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @param {{ subscriberMultiplier?: number, dailyWriteThreshold?: number }} [opts]
 * @returns {Promise<DbUsageRow>}
 */
export async function runDbUsageSnapshot(opts = {}) {
  const mult = Number(opts.subscriberMultiplier);
  const threshold = Number(opts.dailyWriteThreshold);
  const { data, error } = await supabase.rpc("snapshot_db_usage", {
    p_subscriber_multiplier: Number.isFinite(mult) && mult > 0 ? mult : 3,
    p_daily_write_threshold:
      Number.isFinite(threshold) && threshold > 0 ? Math.floor(threshold) : DEFAULT_DAILY_WRITE_THRESHOLD,
  });

  if (error) throw error;
  return data;
}

/**
 * Build day-over-day analysis from newest-first history.
 * @param {DbUsageRow[]} newestFirst
 */
export function analyzeDbUsageTrend(newestFirst) {
  const rows = Array.isArray(newestFirst) ? newestFirst : [];
  const latest = rows[0] || null;
  const previous = rows[1] || null;

  const latestWrites = Number(latest?.total_daily_writes) || 0;
  const prevWrites = Number(previous?.total_daily_writes) || 0;
  const latestEst = Number(latest?.estimated_realtime_messages) || 0;
  const prevEst = Number(previous?.estimated_realtime_messages) || 0;

  const writeDelta = previous ? latestWrites - prevWrites : null;
  const estDelta = previous ? latestEst - prevEst : null;

  let writeChangePct = null;
  if (previous && prevWrites > 0) {
    writeChangePct = ((latestWrites - prevWrites) / prevWrites) * 100;
  } else if (previous && prevWrites === 0 && latestWrites > 0) {
    writeChangePct = 100;
  }

  let estChangePct = null;
  if (previous && prevEst > 0) {
    estChangePct = ((latestEst - prevEst) / prevEst) * 100;
  } else if (previous && prevEst === 0 && latestEst > 0) {
    estChangePct = 100;
  }

  const direction =
    writeDelta == null ? "unknown" : writeDelta > 0 ? "up" : writeDelta < 0 ? "down" : "flat";

  const last7 = rows.slice(0, 7);
  const avgDailyWrites =
    last7.length > 0
      ? last7.reduce((s, r) => s + (Number(r.total_daily_writes) || 0), 0) / last7.length
      : 0;
  const avgDailyEstRt =
    last7.length > 0
      ? last7.reduce((s, r) => s + (Number(r.estimated_realtime_messages) || 0), 0) / last7.length
      : 0;

  const projectedMonthlyEstRt = Math.round(avgDailyEstRt * 30);
  const quotaPct =
    REALTIME_INCLUDED_MONTHLY > 0
      ? (projectedMonthlyEstRt / REALTIME_INCLUDED_MONTHLY) * 100
      : 0;

  const anyAlert = rows.some((r) => r.alert_triggered);
  const latestAlert = Boolean(latest?.alert_triggered);

  const chartOldestFirst = [...rows]
    .reverse()
    .map((r) => ({
      date: String(r.usage_date || "").slice(0, 10),
      writes: Number(r.total_daily_writes) || 0,
      estimatedRt: Number(r.estimated_realtime_messages) || 0,
      alert: Boolean(r.alert_triggered),
    }));

  return {
    latest,
    previous,
    latestWrites,
    prevWrites,
    latestEst,
    prevEst,
    writeDelta,
    estDelta,
    writeChangePct,
    estChangePct,
    direction,
    avgDailyWrites,
    avgDailyEstRt,
    projectedMonthlyEstRt,
    quotaPct,
    anyAlert,
    latestAlert,
    chartOldestFirst,
    threshold: Number(latest?.daily_write_threshold) || DEFAULT_DAILY_WRITE_THRESHOLD,
  };
}

export function loadInvoiceChecklist() {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return { lastCheckedOn: null, notes: "" };
    const parsed = JSON.parse(raw);
    return {
      lastCheckedOn: parsed?.lastCheckedOn || null,
      notes: parsed?.notes || "",
    };
  } catch {
    return { lastCheckedOn: null, notes: "" };
  }
}

export function saveInvoiceChecklist(next) {
  const payload = {
    lastCheckedOn: next?.lastCheckedOn || null,
    notes: next?.notes || "",
  };
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(payload));
  return payload;
}

export function formatCompactNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}
