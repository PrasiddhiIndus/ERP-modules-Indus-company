import { NAV_MODULE_TREE, MODULE_LANDING_PATHS, ROLES, normalizeAppRole } from "../../config/roles";
import { inrShort, pct } from "../finance/lib/formatters";
import { currentPeriodKey, indexToPeriodKey, periodAbsoluteIndex } from "../finance/lib/periods";

/** Short wheel labels and which modules carry revenue. */
const MODULE_META = {
  hr: { short: "HR", revenue: false },
  compliance: { short: "Compliance", revenue: false },
  admin: { short: "Admin", revenue: false },
  commercialMt: { short: "Manpower", revenue: true },
  commercialRm: { short: "R&M", revenue: true },
  marketing: { short: "Marketing", revenue: true },
  maintenance: { short: "Maint.", revenue: false },
  billing: { short: "Billing", revenue: true },
  operations: { short: "Operations", revenue: false },
  projects: { short: "Projects", revenue: true },
  procurement: { short: "Procurement", revenue: false, planned: true },
  amc: { short: "AMC", revenue: true },
  finance: { short: "Finance", revenue: true },
  fireTender: { short: "IEV", revenue: true },
  itIs: { short: "IT / IS", revenue: false },
  crmOutreach: { short: "Outreach", revenue: false },
};

/** Short click targets. Add a module in the nav tree and MODULE_META, then list up to four entry keys here. */
const MODULE_LINKS = {
  hr: ["hr.dashboard", "hr.calling-master", "hr.attendance", "hr.salary-management"],
  compliance: ["compliance.ifspl", "compliance.general", "compliance.payroll"],
  admin: ["admin.dashboard", "admin.recruitment", "admin.employee", "admin.store"],
  commercialMt: ["commercialMt.dashboard", "commercialMt.enquiry", "commercialMt.quotation", "commercialMt.po-entry"],
  commercialRm: ["commercialRm.dashboard", "commercialRm.enquiry", "commercialRm.po-entry", "commercialRm.contact-log"],
  marketing: ["marketing.dashboard", "marketing.enquiry-master", "marketing.quotation", "marketing.follow-up"],
  maintenance: ["maintenance.dashboard", "maintenance.enquiry-master", "maintenance.quotation", "maintenance.follow-up"],
  billing: ["billing.dashboard", "billing.create", "billing.manage", "billing.reports"],
  operations: ["operations.fleet", "operations.manpower"],
  projects: ["projects.management", "projects.enquiry", "projects.quotation-master", "projects.po"],
  amc: ["amc.dashboard", "amc.contracts", "amc.complaints", "amc.pm-schedule"],
  finance: ["finance.pl"],
  fireTender: ["fireTender.dashboard", "fireTender.costing", "fireTender.manufacturing"],
  itIs: ["itIs.subscriptions", "itIs.api-health"],
  crmOutreach: ["crmOutreach.client"],
};

const MODULE_NOTES = {
  commercialRm: "Enquiry and order counts open inside R&M.",
  maintenance: "Enquiry counts open inside Maintenance.",
  operations: "Fleet and site work open inside Operations.",
  projects: "Project counts open inside Projects.",
  procurement: "Procurement is still being built.",
  compliance: "Filings and payroll compliance open inside the module.",
  itIs: "Subscriptions and API health open inside IT / IS.",
  crmOutreach: "Client and in-house mail open inside Outreach.",
};

export function isManagementRole(profile) {
  const role = normalizeAppRole(profile?.role);
  return (
    role === ROLES.ADMIN ||
    role === ROLES.MANAGER ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO
  );
}

export function healthTone(score) {
  if (score == null) return "var(--accent)";
  if (score >= 85) return "var(--success)";
  if (score >= 75) return "var(--warning)";
  return "var(--critical)";
}

function countLabel(value) {
  return (Number(value) || 0).toLocaleString("en-IN");
}

function pressureScore(total, pressure) {
  const base = Number(total) || 0;
  const load = Number(pressure) || 0;
  if (base <= 0 && load <= 0) return null;
  if (base <= 0) return load > 0 ? 68 : null;
  const ratio = Math.min(1, load / base);
  return Math.round(Math.max(58, Math.min(99, 100 - ratio * 70)));
}

function financeScore(pl) {
  if (!pl?.revenue && !pl?.expense) return null;
  if (pl.profit < 0) return 62;
  const warn = Number(pl.warnMargin) || 8;
  if (pl.margin >= 12) return 94;
  if (pl.margin >= warn) return 84;
  return 72;
}

function signalsFor(id, { modules, commercialStats, pl, billRate, collectRate }) {
  const note = MODULE_NOTES[id] || "";
  switch (id) {
    case "hr":
    case "admin":
      return {
        note: "",
        metrics: [
          { label: "People", value: countLabel(modules.people) },
          { label: "Leave queue", value: countLabel(modules.leavePending) },
        ],
        score: pressureScore(modules.people, modules.leavePending),
        attention: (Number(modules.leavePending) || 0) > 0,
      };
    case "commercialMt": {
      const waitingDecision = (Number(modules.manpowerPending) || 0) + (Number(modules.commercialPending) || 0);
      const dueSoon = Number(modules.manpowerDueSoon) || 0;
      const waiting = waitingDecision + dueSoon;
      return {
        note: "",
        metrics: [
          { label: "Enquiries", value: countLabel(modules.manpowerTotal) },
          { label: "Waiting", value: countLabel(waitingDecision) },
          { label: "Bids due", value: countLabel(dueSoon) },
          { label: "Approved", value: countLabel(modules.manpowerApproved) },
        ],
        score: pressureScore((Number(modules.manpowerTotal) || 0) + (Number(commercialStats.poCount) || 0), waiting),
        attention: waiting > 0,
      };
    }
    case "marketing":
      return {
        note: "",
        metrics: [{ label: "Enquiries", value: countLabel(modules.marketing) }],
        score: null,
        attention: false,
      };
    case "billing": {
      const billed = Number(commercialStats.billed) || 0;
      const book = Number(commercialStats.contractBook) || 0;
      const invoices = Number(commercialStats.invoiceCount) || 0;
      const score = billed > 0 ? Math.round(Math.max(58, Math.min(99, collectRate))) : book > 0 ? Math.round(Math.max(58, Math.min(99, billRate))) : null;
      return {
        note: "",
        metrics: [
          { label: "Invoices", value: countLabel(invoices) },
          { label: "Billed", value: inrShort(billed) },
          { label: "Collected", value: inrShort(commercialStats.collected) },
        ],
        score,
        attention: billed > 0 && (Number(commercialStats.outstanding) || 0) > 0 && collectRate < 75,
      };
    }
    case "amc": {
      const active = Number(modules.amcActive) || 0;
      const atRisk = Number(modules.amcAtRisk) || 0;
      const complaints = Number(modules.amcComplaints) || 0;
      const pressure = atRisk + complaints;
      return {
        note: "",
        metrics: [
          { label: "Active", value: countLabel(active) },
          { label: "At risk", value: countLabel(atRisk) },
          { label: "Complaints", value: countLabel(complaints) },
        ],
        score: pressureScore(active, pressure),
        attention: pressure > 0,
      };
    }
    case "finance":
      if (!pl?.revenue && !pl?.expense) {
        return { note: "Open Finance for the books.", metrics: [], score: null, attention: false };
      }
      return {
        note: "",
        metrics: [
          { label: "Margin", value: pl.revenue ? pct(pl.margin) : "—" },
          { label: "Expenses", value: inrShort(pl.expense) },
          { label: "Sites in loss", value: countLabel(pl.lossSites) },
        ],
        score: financeScore(pl),
        attention: (Number(pl.lossSites) || 0) > 0 || (Number(pl.profit) || 0) < 0,
      };
    case "fireTender":
      return {
        note: "",
        metrics: [
          { label: "Records", value: countLabel(modules.fireTenderTotal) },
          { label: "Pending", value: countLabel(modules.fireTenderPending) },
        ],
        score: pressureScore(modules.fireTenderTotal, modules.fireTenderPending),
        attention: (Number(modules.fireTenderPending) || 0) > 0,
      };
    default:
      return { note, metrics: [], score: null, attention: false };
  }
}

export function moduleCatalog() {
  return NAV_MODULE_TREE.filter((mod) => MODULE_META[mod.value]).map((mod) => {
    const meta = MODULE_META[mod.value];
    const subs = (mod.subModules || [])
      .filter((sub) => sub?.label && sub?.pathPrefix)
      .map((sub) => ({
        key: sub.value,
        label: sub.label,
        path: sub.pathPrefix,
      }));
    return {
      id: mod.value,
      name: mod.label,
      short: meta.short,
      revenue: Boolean(meta.revenue),
      planned: Boolean(meta.planned) || subs.length === 0,
      path: MODULE_LANDING_PATHS[mod.value] || subs[0]?.path || "",
      subs,
    };
  });
}

function chipLabel(label) {
  const clean = String(label || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^dashboard$/i.test(clean)) return "Dashboard";
  return clean.replace(/\s+dashboard$/i, "");
}

function pickLinks(id, subs) {
  const byKey = new Map(subs.map((sub) => [sub.key, sub]));
  const wanted = (MODULE_LINKS[id] || []).map((key) => byKey.get(key)).filter(Boolean);
  const pool = wanted.length ? wanted : subs;
  return pool
    .filter((sub) => sub.canOpen && sub.path)
    .slice(0, 4)
    .map((sub) => ({ key: sub.key, label: chipLabel(sub.label), path: sub.path }));
}

function pickOpenPath(mod, subs, landingOpen) {
  const dashboard = subs.find((sub) => /dashboard/i.test(sub.label || "") && sub.canOpen);
  if (dashboard?.path) return dashboard.path;
  if (landingOpen && mod.path) return mod.path;
  return subs.find((sub) => sub.canOpen)?.path || "";
}

/**
 * One card per product module, with the headline figures this home view already loads.
 * Management sees the full catalog. Depth stays on each module dashboard.
 */
export function buildPulseModules(ctx) {
  const allow = typeof ctx.allowPath === "function" ? ctx.allowPath : () => false;
  const management = isManagementRole(ctx.profile);
  const views = moduleCatalog().map((mod) => {
    const signals = signalsFor(mod.id, ctx);
    const subs = mod.subs.map((sub) => ({ ...sub, canOpen: allow(sub.path) }));
    const landingOpen = Boolean(mod.path && allow(mod.path));
    const openPath = pickOpenPath(mod, subs, landingOpen);
    const canOpen = Boolean(openPath);
    const links = pickLinks(mod.id, subs);
    const planned = Boolean(mod.planned);
    return {
      ...mod,
      ...signals,
      planned,
      subs,
      links,
      openPath,
      canOpen,
      visible: management || canOpen,
      score: planned ? null : signals.score,
      attention: planned ? false : signals.attention,
    };
  });

  const hr = views.find((view) => view.id === "hr");
  const admin = views.find((view) => view.id === "admin");
  if (admin?.visible && hr?.visible) {
    admin.metrics = [];
    admin.score = null;
    admin.attention = false;
    admin.note = "People and leave are on HR. Open Admin for office work.";
  }

  const scored = views.filter((view) => view.visible && view.score != null);
  const health = scored.length
    ? Math.round(scored.reduce((sum, view) => sum + view.score, 0) / scored.length)
    : null;

  return {
    views,
    health,
    management,
    openCount: views.filter((view) => view.visible && view.canOpen).length,
  };
}

export function buildTimelinePresets() {
  const to = currentPeriodKey();
  const end = periodAbsoluteIndex(to);
  const back = (months) => indexToPeriodKey(Math.max(0, end - months));
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let quarterStart = `${year}-01`;
  if (month >= 4 && month <= 6) quarterStart = `${year}-04`;
  else if (month >= 7 && month <= 9) quarterStart = `${year}-07`;
  else if (month >= 10) quarterStart = `${year}-10`;
  const yearStart = month >= 4 ? `${year}-04` : `${year - 1}-04`;
  return [
    { id: "month", label: "This month", from: to, to },
    { id: "quarter", label: "This quarter", from: quarterStart, to },
    { id: "fy", label: "This year", from: yearStart, to },
    { id: "6m", label: "6 months", from: back(5), to },
    { id: "12m", label: "12 months", from: back(11), to },
  ];
}
