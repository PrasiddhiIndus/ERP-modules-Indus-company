/** Join AMC entities with display names and computed counts */

function mapById(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    if (r?.id) m.set(r.id, r);
  });
  return m;
}

function engineerName(engineers, id) {
  if (!id) return null;
  return engineers.find((e) => e.id === id)?.name ?? null;
}

export function enrichAmcDataset(raw) {
  const customers = raw.customers || [];
  const contracts = raw.contracts || [];
  const sites = raw.sites || [];
  const assets = raw.assets || [];
  const pmSchedules = raw.pmSchedules || [];
  const complaints = raw.complaints || [];
  const visits = raw.visits || [];
  const reports = raw.reports || [];
  const alerts = raw.alerts || [];
  const engineers = raw.engineers || [];

  const customerMap = mapById(customers);
  const contractMap = mapById(contracts);
  const siteMap = mapById(sites);
  const assetMap = mapById(assets);
  const pmMap = mapById(pmSchedules);
  const complaintMap = mapById(complaints);
  const visitMap = mapById(visits);

  const enrichContract = (c) => {
    const cust = customerMap.get(c.customer_id);
    const relatedSites = sites.filter((s) => s.contract_id === c.id);
    const relatedAssets = assets.filter((a) => a.contract_id === c.id);
    return {
      ...c,
      customer_name: c.customer_name || cust?.customer_name,
      site_count: c.site_count ?? relatedSites.length,
      asset_count: c.asset_count ?? relatedAssets.length,
    };
  };

  const enrichSite = (s) => {
    const cust = customerMap.get(s.customer_id);
    const con = contractMap.get(s.contract_id);
    const relatedAssets = assets.filter((a) => a.site_id === s.id);
    const nextPm = pmSchedules
      .filter((p) => p.site_id === s.id && !["completed", "closed", "cancelled"].includes(p.status))
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
    return {
      ...s,
      customer_name: s.customer_name || cust?.customer_name,
      contract_no: s.contract_no || con?.contract_no,
      assigned_engineer_name:
        s.assigned_engineer_name || engineerName(engineers, s.assigned_engineer_id),
      asset_count: s.asset_count ?? relatedAssets.length,
      next_pm_date: s.next_pm_date || nextPm?.due_date,
    };
  };

  const enrichAsset = (a) => {
    const cust = customerMap.get(a.customer_id);
    const site = siteMap.get(a.site_id);
    const con = contractMap.get(a.contract_id);
    return {
      ...a,
      customer_name: a.customer_name || cust?.customer_name,
      site_name: a.site_name || site?.site_name,
      contract_id: a.contract_id || site?.contract_id || con?.id,
      contract_no: a.contract_no || con?.contract_no,
    };
  };

  const enrichPm = (p) => {
    const cust = customerMap.get(p.customer_id);
    const site = siteMap.get(p.site_id);
    const asset = assetMap.get(p.asset_id);
    const con = contractMap.get(p.contract_id);
    return {
      ...p,
      contract_no: p.contract_no || con?.contract_no,
      customer_name: p.customer_name || cust?.customer_name,
      site_name: p.site_name || site?.site_name,
      asset_name: p.asset_name || asset?.equipment_name,
      assigned_engineer_name:
        p.assigned_engineer_name || engineerName(engineers, p.assigned_engineer_id),
    };
  };

  const enrichComplaint = (c) => {
    const cust = customerMap.get(c.customer_id);
    const site = siteMap.get(c.site_id);
    const asset = assetMap.get(c.asset_id);
    const con = contractMap.get(c.contract_id);
    return {
      ...c,
      contract_id: c.contract_id || site?.contract_id || con?.id,
      customer_name: c.customer_name || cust?.customer_name,
      site_name: c.site_name || site?.site_name,
      asset_name: c.asset_name || asset?.equipment_name,
      assigned_engineer_name:
        c.assigned_engineer_name || engineerName(engineers, c.assigned_engineer_id),
    };
  };

  const enrichVisit = (v) => {
    const cust = customerMap.get(v.customer_id);
    const site = siteMap.get(v.site_id);
    const pm = pmMap.get(v.pm_schedule_id);
    const cmp = complaintMap.get(v.complaint_id);
    const linked_ref =
      v.linked_ref ||
      (pm?.pm_no ? pm.pm_no : null) ||
      (cmp?.complaint_no ? cmp.complaint_no : null);
    return {
      ...v,
      customer_name: v.customer_name || cust?.customer_name,
      site_name: v.site_name || site?.site_name,
      engineer_name: v.engineer_name || engineerName(engineers, v.engineer_id),
      linked_ref,
      pm_schedule_id: v.pm_schedule_id || pm?.id,
      complaint_id: v.complaint_id || cmp?.id,
    };
  };

  const enrichReport = (r) => {
    const visit = visitMap.get(r.visit_id);
    return {
      ...r,
      visit_no: r.visit_no || visit?.visit_no,
      customer_name: r.customer_name || visit?.customer_name,
      site_name: r.site_name || visit?.site_name,
      engineer_name: r.engineer_name || visit?.engineer_name,
      customer_id: r.customer_id || visit?.customer_id,
      site_id: r.site_id || visit?.site_id,
    };
  };

  const enrichAlert = (a) => {
    const cust = customerMap.get(a.customer_id);
    const site = siteMap.get(a.site_id);
    const pm = pmMap.get(a.pm_schedule_id);
    const cmp = complaintMap.get(a.complaint_id);
    const con = contractMap.get(a.contract_id);
    return {
      ...a,
      customer_name: a.customer_name || cust?.customer_name,
      site_name: a.site_name || site?.site_name,
      related_record:
        a.related_record ||
        pm?.pm_no ||
        cmp?.complaint_no ||
        con?.contract_no ||
        a.title,
      record_type: a.pm_schedule_id
        ? "pm"
        : a.complaint_id
          ? "complaint"
          : a.contract_id
            ? "contract"
            : a.site_id
              ? "site"
              : null,
      record_id: a.pm_schedule_id || a.complaint_id || a.contract_id || a.site_id || a.visit_id,
    };
  };

  const enrichedContracts = contracts.map(enrichContract);
  const enrichedSites = sites.map(enrichSite);
  const enrichedAssets = assets.map(enrichAsset);
  const enrichedPm = pmSchedules.map(enrichPm);
  const enrichedComplaints = complaints.map(enrichComplaint);
  const enrichedVisits = visits.map(enrichVisit);
  const enrichedReports = reports.map(enrichReport);
  const enrichedAlerts = alerts.map(enrichAlert);

  const enrichedCustomers = customers.map((cust) => {
    const custContracts = enrichedContracts.filter((c) => c.customer_id === cust.id);
    const custSites = enrichedSites.filter((s) => s.customer_id === cust.id);
    return {
      ...cust,
      contract_count: cust.contract_count ?? custContracts.length,
      site_count: cust.site_count ?? custSites.length,
    };
  });

  return {
    customers: enrichedCustomers,
    contracts: enrichedContracts,
    sites: enrichedSites,
    assets: enrichedAssets,
    pmSchedules: enrichedPm,
    complaints: enrichedComplaints,
    visits: enrichedVisits,
    reports: enrichedReports,
    alerts: enrichedAlerts,
    engineers,
    activity: raw.activity || [],
    dashboard: raw.dashboard || {},
    settings: raw.settings || {},
  };
}

export function computeDashboardKpis(data) {
  const activeStatuses = new Set(["active", "running", "expiring_soon"]);
  const today = new Date().toISOString().slice(0, 10);

  const activeContracts = data.contracts.filter((c) => activeStatuses.has(c.status)).length;
  const contractsExpiring30 = data.contracts.filter((c) => {
    if (!c.end_date) return false;
    const end = new Date(c.end_date);
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return end <= limit && end >= new Date(today);
  }).length;

  const pmDueToday = data.pmSchedules.filter(
    (p) => p.due_date === today && !["completed", "closed", "cancelled"].includes(p.status)
  ).length;
  const pmOverdue = data.pmSchedules.filter(
    (p) => p.due_date < today && !["completed", "closed", "cancelled"].includes(p.status)
  ).length;
  const openComplaints = data.complaints.filter((c) => !["closed", "resolved"].includes(c.status)).length;
  const slaBreaches = data.complaints.filter((c) => c.sla_status === "breached" || c.status === "sla_breached").length;
  const pendingReports = data.visits.filter((v) => v.report_status === "pending").length;
  const contractsAtRisk = data.contracts.filter((c) => c.status === "at_risk" || c.status === "expiring_soon").length;

  return {
    active_contracts: activeContracts,
    contracts_expiring_30d: contractsExpiring30,
    pm_due_today: pmDueToday,
    pm_overdue: pmOverdue,
    open_complaints: openComplaints,
    sla_breaches: slaBreaches,
    pending_service_reports: pendingReports,
    contracts_at_risk: contractsAtRisk,
  };
}
