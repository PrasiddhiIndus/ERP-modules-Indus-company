/**
 * AMC data access — tries Supabase per table, merges with mock, then enriches joins client-side.
 */
import { supabase } from "../../../lib/supabase";
import {
  MOCK_CUSTOMERS,
  MOCK_CONTRACTS,
  MOCK_SITES,
  MOCK_ASSETS,
  MOCK_PM,
  MOCK_COMPLAINTS,
  MOCK_VISITS,
  MOCK_REPORTS,
  MOCK_ALERTS,
  MOCK_ACTIVITY,
  MOCK_ENGINEERS,
  MOCK_SETTINGS_MASTERS,
} from "../data/mockAmcData";
import { enrichAmcDataset, computeDashboardKpis } from "./amcEnrichment";

const FORCE_MOCK = import.meta.env.VITE_AMC_USE_MOCK === "true";

async function fetchTable(table, options = {}) {
  if (FORCE_MOCK) return { data: null, error: { message: "mock" } };
  try {
    let q = supabase.from(table).select(options.select || "*");
    if (options.order) {
      const [col, opts] = options.order;
      q = q.order(col, opts);
    }
    if (options.limit) q = q.limit(options.limit);
    return await q;
  } catch (e) {
    return { data: null, error: e };
  }
}

async function fetchRawBundle() {
  const [
    customersRes,
    contractsRes,
    sitesRes,
    assetsRes,
    pmRes,
    complaintsRes,
    visitsRes,
    reportsRes,
    alertsRes,
    activityRes,
    settingsRes,
    dashboardRes,
  ] = await Promise.all([
    fetchTable("amc_customers", { order: ["customer_name", { ascending: true }] }),
    fetchTable("amc_contracts", {
      select: "*, amc_customers(customer_name)",
      order: ["contract_no", { ascending: true }],
    }),
    fetchTable("amc_contract_sites", { order: ["site_name", { ascending: true }] }),
    fetchTable("amc_assets", { order: ["equipment_name", { ascending: true }] }),
    fetchTable("amc_pm_schedules", { order: ["due_date", { ascending: true }] }),
    fetchTable("amc_complaints", { order: ["complaint_logged_at", { ascending: false }] }),
    fetchTable("amc_service_visits", { order: ["created_at", { ascending: false }] }),
    fetchTable("amc_service_reports", { order: ["created_at", { ascending: false }] }),
    fetchTable("amc_alerts", { order: ["due_at", { ascending: true }] }),
    fetchTable("amc_activity_logs", { order: ["action_at", { ascending: false }], limit: 30 }),
    fetchTable("amc_settings_masters", { order: ["sort_order", { ascending: true }] }),
    (async () => {
      if (FORCE_MOCK) return { data: null, error: { message: "mock" } };
      try {
        return await supabase.from("vw_amc_dashboard_summary").select("*").maybeSingle();
      } catch (e) {
        return { data: null, error: e };
      }
    })(),
  ]);

  const pick = (res, mock) => (res.data?.length ? res.data : mock);

  let contracts = pick(contractsRes, MOCK_CONTRACTS);
  if (contractsRes.data?.length) {
    contracts = contracts.map((r) => ({
      ...r,
      customer_name: r.customer_name || r.amc_customers?.customer_name,
      amc_customers: undefined,
    }));
  }

  let activity = pick(activityRes, MOCK_ACTIVITY);
  if (activityRes.data?.length) {
    activity = activity.map((a) => ({
      title: a.action_summary || a.action_type,
      meta: `${a.record_type} · ${new Date(a.action_at).toLocaleString()}`,
      actor: a.actor_name || "System",
      record_type: a.record_type,
      record_id: a.record_id,
    }));
  }

  let settings = MOCK_SETTINGS_MASTERS;
  if (settingsRes.data?.length) {
    settings = {};
    settingsRes.data.forEach((row) => {
      if (!settings[row.master_type]) settings[row.master_type] = [];
      settings[row.master_type].push(row.label);
    });
  }

  const raw = {
    customers: pick(customersRes, MOCK_CUSTOMERS),
    contracts,
    sites: pick(sitesRes, MOCK_SITES),
    assets: pick(assetsRes, MOCK_ASSETS),
    pmSchedules: pick(pmRes, MOCK_PM),
    complaints: pick(complaintsRes, MOCK_COMPLAINTS),
    visits: pick(visitsRes, MOCK_VISITS),
    reports: pick(reportsRes, MOCK_REPORTS),
    alerts: pick(alertsRes, MOCK_ALERTS),
    engineers: MOCK_ENGINEERS,
    activity,
    settings,
    dashboard: dashboardRes.data && !dashboardRes.error ? dashboardRes.data : null,
  };

  return enrichAmcDataset(raw);
}

let cachedBundle = null;
let cacheTime = 0;
const CACHE_MS = 30_000;

export async function fetchAmcModuleData({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedBundle && now - cacheTime < CACHE_MS) {
    return cachedBundle;
  }
  const data = await fetchRawBundle();
  data.dashboard = data.dashboard?.active_contracts != null ? data.dashboard : computeDashboardKpis(data);
  cachedBundle = data;
  cacheTime = now;
  return data;
}

export function invalidateAmcCache() {
  cachedBundle = null;
  cacheTime = 0;
}

export async function fetchDashboardSummary() {
  const data = await fetchAmcModuleData();
  return data.dashboard;
}

export async function fetchCustomers() {
  return (await fetchAmcModuleData()).customers;
}
export async function fetchContracts() {
  return (await fetchAmcModuleData()).contracts;
}
export async function fetchSites() {
  return (await fetchAmcModuleData()).sites;
}
export async function fetchAssets() {
  return (await fetchAmcModuleData()).assets;
}
export async function fetchPmSchedules() {
  return (await fetchAmcModuleData()).pmSchedules;
}
export async function fetchComplaints() {
  return (await fetchAmcModuleData()).complaints;
}
export async function fetchVisits() {
  return (await fetchAmcModuleData()).visits;
}
export async function fetchServiceReports() {
  return (await fetchAmcModuleData()).reports;
}
export async function fetchAlerts() {
  return (await fetchAmcModuleData()).alerts;
}
export async function fetchActivityLogs() {
  return (await fetchAmcModuleData()).activity;
}
export async function fetchEngineers() {
  return (await fetchAmcModuleData()).engineers;
}
export async function fetchSettingsMasters() {
  return (await fetchAmcModuleData()).settings;
}

export async function upsertCustomer(payload) {
  invalidateAmcCache();
  if (FORCE_MOCK) return { data: { ...payload, id: payload.id || `cust-${Date.now()}` }, error: null };
  const { data, error } = await supabase.from("amc_customers").upsert(payload).select().single();
  return { data, error };
}

export async function upsertContract(payload) {
  invalidateAmcCache();
  if (FORCE_MOCK) return { data: { ...payload, id: payload.id || `con-${Date.now()}` }, error: null };
  const { data, error } = await supabase.from("amc_contracts").upsert(payload).select().single();
  return { data, error };
}
