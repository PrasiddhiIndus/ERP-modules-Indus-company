/**
 * Built-in pulse providers for modules that already feed the home dashboard.
 * Prefer adding `src/pages/<module>/pulseProvider.js` for new modules —
 * those auto-register via pulseRegistry glob and override these by id.
 */

import { supabase } from "../../../lib/supabase";
import { countPendingLeaveRequests } from "../../../lib/adminLeaveRequests";
import { inrShort, pct } from "../../finance/lib/formatters";

const DAY_MS = 24 * 60 * 60 * 1000;
const BID_DEADLINE_ALERT_DAYS = [7, 3, 1];
const META_PREFIX = "__META__:";

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

async function safeHeadCount(query) {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

function parseMeta(raw) {
  if (!raw || typeof raw !== "string" || !raw.startsWith(META_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(META_PREFIX.length)) || {};
  } catch {
    return {};
  }
}

function toLocalDateStart(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countManpowerDueSoon(rows) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let n = 0;
  for (const row of rows || []) {
    const status = String(row.status || "").trim().toLowerCase();
    if (["approved", "rejected", "cancelled", "canceled"].includes(status)) continue;
    const meta = parseMeta(row.authorization_to);
    const deadline = toLocalDateStart(meta.submissionBidDeadline || row.due_date);
    if (!deadline) continue;
    const daysUntil = Math.round((deadline.getTime() - start.getTime()) / DAY_MS);
    if (BID_DEADLINE_ALERT_DAYS.includes(daysUntil)) n += 1;
  }
  return n;
}

export const builtInProviders = [
  {
    id: "hr",
    meta: { short: "HR", revenue: false, order: 10, icon: "hr" },
    linkKeys: ["hr.dashboard", "hr.calling-master", "hr.site-attendance", "hr.salary-management"],
    realtimeTables: [{ schema: "public", table: "admin_ifsp_employee_master" }],
    async load() {
      const [people, leavePending] = await Promise.all([
        safeHeadCount(
          supabase.from("admin_ifsp_employee_master").select("id", { count: "exact", head: true }).eq("status", "Active")
        ),
        countPendingLeaveRequests().catch(() => 0),
      ]);
      return { people, leavePending };
    },
    signals({ modules }) {
      return {
        metrics: [
          { label: "People", value: countLabel(modules.people) },
          { label: "Leave queue", value: countLabel(modules.leavePending) },
        ],
        score: pressureScore(modules.people, modules.leavePending),
        attention: (Number(modules.leavePending) || 0) > 0,
      };
    },
  },
  {
    id: "admin",
    meta: { short: "Admin", revenue: false, order: 20, icon: "admin" },
    linkKeys: ["admin.dashboard", "admin.recruitment", "admin.employee", "admin.store"],
    signals({ modules }) {
      return {
        metrics: [
          { label: "People", value: countLabel(modules.people) },
          { label: "Leave queue", value: countLabel(modules.leavePending) },
        ],
        score: pressureScore(modules.people, modules.leavePending),
        attention: (Number(modules.leavePending) || 0) > 0,
      };
    },
  },
  {
    id: "compliance",
    meta: { short: "Compliance", revenue: false, order: 15, icon: "compliance" },
    linkKeys: ["compliance.ifspl", "compliance.general", "compliance.payroll"],
    note: "Filings and payroll compliance open inside the module.",
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "commercialMt",
    meta: { short: "Manpower", revenue: true, order: 30, icon: "commercialMt" },
    linkKeys: ["commercialMt.dashboard", "commercialMt.enquiry", "commercialMt.quotation", "commercialMt.po-entry"],
    realtimeTables: [{ schema: "public", table: "manpower_enquiries" }],
    async load() {
      try {
        const { data, error } = await supabase
          .from("manpower_enquiries")
          .select("id, status, due_date, authorization_to")
          .limit(800);
        if (error) return { manpowerTotal: 0, manpowerPending: 0, manpowerApproved: 0, manpowerDueSoon: 0 };
        const rows = data || [];
        const approved = rows.filter((r) => String(r.status || "").toLowerCase() === "approved").length;
        const rejected = rows.filter((r) => String(r.status || "").toLowerCase() === "rejected").length;
        return {
          manpowerTotal: rows.length,
          manpowerApproved: approved,
          manpowerPending: Math.max(0, rows.length - approved - rejected),
          manpowerDueSoon: countManpowerDueSoon(rows),
        };
      } catch {
        return { manpowerTotal: 0, manpowerPending: 0, manpowerApproved: 0, manpowerDueSoon: 0 };
      }
    },
    signals({ modules, commercialStats }) {
      const waitingDecision = (Number(modules.manpowerPending) || 0) + (Number(modules.commercialPending) || 0);
      const dueSoon = Number(modules.manpowerDueSoon) || 0;
      const waiting = waitingDecision + dueSoon;
      return {
        metrics: [
          { label: "Enquiries", value: countLabel(modules.manpowerTotal) },
          { label: "Waiting", value: countLabel(waitingDecision) },
          { label: "Bids due", value: countLabel(dueSoon) },
          { label: "Approved", value: countLabel(modules.manpowerApproved) },
        ],
        score: pressureScore((Number(modules.manpowerTotal) || 0) + (Number(commercialStats.poCount) || 0), waiting),
        attention: waiting > 0,
      };
    },
  },
  {
    id: "commercialRm",
    meta: { short: "R&M", revenue: true, order: 35, icon: "commercialRm" },
    linkKeys: ["commercialRm.dashboard", "commercialRm.enquiry", "commercialRm.po-entry", "commercialRm.contact-log"],
    note: "Enquiry and order counts open inside R&M.",
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "marketing",
    meta: { short: "Marketing", revenue: true, order: 40, icon: "marketing" },
    linkKeys: ["marketing.dashboard", "marketing.enquiry-master", "marketing.quotation", "marketing.follow-up"],
    realtimeTables: [{ schema: "public", table: "marketing_enquiries" }],
    async load() {
      return {
        marketing: await safeHeadCount(supabase.from("marketing_enquiries").select("id", { count: "exact", head: true })),
      };
    },
    signals({ modules }) {
      return {
        metrics: [{ label: "Enquiries", value: countLabel(modules.marketing) }],
        score: null,
        attention: false,
      };
    },
  },
  {
    id: "maintenance",
    meta: { short: "Maint.", revenue: false, order: 45, icon: "maintenance" },
    linkKeys: ["maintenance.dashboard", "maintenance.enquiry-master", "maintenance.quotation", "maintenance.follow-up"],
    note: "Enquiry counts open inside Maintenance.",
    async load() {
      // maintenance_* tables are not deployed on this project — never probe (avoids console 404).
      return { maintenance: 0 };
    },
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "billing",
    meta: { short: "Billing", revenue: true, order: 50, icon: "billing" },
    linkKeys: ["billing.dashboard", "billing.create", "billing.manage", "billing.reports"],
    realtimeTables: [
      { schema: "billing", table: "po_wo" },
      { schema: "billing", table: "invoice" },
    ],
    signals({ commercialStats, billRate, collectRate }) {
      const billed = Number(commercialStats.billed) || 0;
      const book = Number(commercialStats.contractBook) || 0;
      const invoices = Number(commercialStats.invoiceCount) || 0;
      const score =
        billed > 0
          ? Math.round(Math.max(58, Math.min(99, collectRate)))
          : book > 0
            ? Math.round(Math.max(58, Math.min(99, billRate)))
            : null;
      return {
        metrics: [
          { label: "Invoices", value: countLabel(invoices) },
          { label: "Billed", value: inrShort(billed) },
          { label: "Collected", value: inrShort(commercialStats.collected) },
        ],
        score,
        attention: billed > 0 && (Number(commercialStats.outstanding) || 0) > 0 && collectRate < 75,
      };
    },
  },
  {
    id: "operations",
    meta: { short: "Operations", revenue: false, order: 55, icon: "operations" },
    linkKeys: ["operations.fleet", "operations.manpower"],
    note: "Fleet and site work open inside Operations.",
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "projects",
    meta: { short: "Projects", revenue: true, order: 60, icon: "projects" },
    linkKeys: ["projects.management", "projects.enquiry", "projects.quotation-master", "projects.po"],
    note: "Project counts open inside Projects.",
    async load() {
      // projects schema not exposed on this host — do not probe.
      return { projects: 0 };
    },
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "procurement",
    meta: { short: "Procurement", revenue: false, planned: true, order: 65, icon: "procurement" },
    note: "Procurement is still being built.",
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "amc",
    meta: { short: "AMC", revenue: true, order: 70, icon: "amc" },
    linkKeys: ["amc.dashboard", "amc.contracts", "amc.complaints", "amc.pm-schedule"],
    async load() {
      try {
        const { data, error } = await supabase.from("vw_amc_dashboard_summary").select("*").maybeSingle();
        if (error || !data) return { amcActive: 0, amcAtRisk: 0, amcComplaints: 0 };
        return {
          amcActive: Number(data.active_contracts) || 0,
          amcAtRisk: Number(data.contracts_at_risk) || 0,
          amcComplaints: Number(data.open_complaints) || 0,
        };
      } catch {
        return { amcActive: 0, amcAtRisk: 0, amcComplaints: 0 };
      }
    },
    signals({ modules }) {
      const active = Number(modules.amcActive) || 0;
      const atRisk = Number(modules.amcAtRisk) || 0;
      const complaints = Number(modules.amcComplaints) || 0;
      const pressure = atRisk + complaints;
      return {
        metrics: [
          { label: "Active", value: countLabel(active) },
          { label: "At risk", value: countLabel(atRisk) },
          { label: "Complaints", value: countLabel(complaints) },
        ],
        score: pressureScore(active, pressure),
        attention: pressure > 0,
      };
    },
  },
  {
    id: "finance",
    meta: { short: "Finance", revenue: true, order: 80, icon: "finance" },
    linkKeys: ["finance.pl"],
    realtimeTables: [
      { schema: "finance", table: "period_entries" },
      { schema: "finance", table: "revenue_entry_lines" },
      { schema: "finance", table: "expense_entry_lines" },
    ],
    signals({ pl }) {
      if (!pl?.revenue && !pl?.expense) {
        return { metrics: [], score: null, attention: false, note: "Open Finance for the books." };
      }
      return {
        metrics: [
          { label: "Margin", value: pl.revenue ? pct(pl.margin) : "—" },
          { label: "Expenses", value: inrShort(pl.expense) },
          { label: "Sites in loss", value: countLabel(pl.lossSites) },
        ],
        score: financeScore(pl),
        attention: (Number(pl.lossSites) || 0) > 0 || (Number(pl.profit) || 0) < 0,
      };
    },
  },
  {
    id: "fireTender",
    meta: { short: "IEV", revenue: true, order: 85, icon: "fireTender" },
    linkKeys: ["fireTender.dashboard", "fireTender.costing", "fireTender.manufacturing"],
    realtimeTables: [{ schema: "public", table: "tenders" }],
    async load() {
      const [fireTenderTotal, fireTenderPending] = await Promise.all([
        safeHeadCount(supabase.from("tenders").select("id", { count: "exact", head: true })),
        safeHeadCount(supabase.from("tenders").select("id", { count: "exact", head: true }).eq("status", "Pending")),
      ]);
      return { fireTenderTotal, fireTenderPending };
    },
    signals({ modules }) {
      return {
        metrics: [
          { label: "Records", value: countLabel(modules.fireTenderTotal) },
          { label: "Pending", value: countLabel(modules.fireTenderPending) },
        ],
        score: pressureScore(modules.fireTenderTotal, modules.fireTenderPending),
        attention: (Number(modules.fireTenderPending) || 0) > 0,
      };
    },
  },
  {
    id: "itIs",
    meta: { short: "IT / IS", revenue: false, order: 90, icon: "itIs" },
    linkKeys: ["itIs.subscriptions", "itIs.api-health", "itIs.helpdesk", "itIs.helpdesk-agent", "itIs.helpdesk-admin"],
    note: "Subscriptions, API health, and IT Support open inside IT / IS.",
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
  {
    id: "crmOutreach",
    meta: { short: "Outreach", revenue: false, order: 95, icon: "crmOutreach" },
    linkKeys: ["crmOutreach.client"],
    note: "Client and in-house mail open inside Outreach.",
    signals() {
      return { metrics: [], score: null, attention: false };
    },
  },
];
