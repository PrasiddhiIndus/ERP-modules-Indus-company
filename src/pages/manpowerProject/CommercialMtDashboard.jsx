import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ClipboardList,
  Eye,
  FilePlus2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useBilling } from "../../contexts/BillingContext";
import { supabase } from "../../lib/supabase";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import { PageTaskHeader, SectionCard, KpiTile } from "../adminOperations/components/AdminUi";
import ManpowerEnquiryPreviewModal, { verticalTone } from "./components/ManpowerEnquiryPreviewModal";
import {
  INQUIRY_DB_COLUMNS,
  getExcelInquiryFields,
} from "./utils/manpowerEnquiryExcelFields";
import {
  STATUS_CHART_COLORS,
  VERTICAL_COLORS,
  computeDashboardStats,
  countByMonth,
  countByStatus,
  countByVertical,
} from "./utils/manpowerInquiryDashboard";
import {
  DEFAULT_BID_DEADLINE_REMINDER_DAYS,
  formatReminderDaysLabel,
  getCommercialTimelineSettings,
  saveCommercialTimelineSettings,
} from "./utils/commercialTimelineSettings";

const MANPOWER_BASE = "/app/commercial/manpower-training/manpower-management";
const MT_BASE = "/app/commercial/manpower-training";
const PRESET_REMINDER_DAYS = [15, 7, 3, 1];

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

function formatInrCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹ ${(n / 100000).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function daysSince(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - d) / (24 * 60 * 60 * 1000)));
}

function poContractValue(po) {
  const raw = po?.totalContractValue ?? po?.total_contract_value ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function QuickActionLink({ to, label, hint, icon: Icon, tone }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition hover:shadow-sm ${tone}`}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/90 shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        {hint ? <span className="block text-[11px] text-gray-600">{hint}</span> : null}
      </span>
    </Link>
  );
}

const CommercialMtDashboard = () => {
  const { commercialPOs } = useBilling();
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);

  const [timelineSettings, setTimelineSettings] = useState(() => getCommercialTimelineSettings());
  const [customDay, setCustomDay] = useState("");
  const [timelineMessage, setTimelineMessage] = useState("");

  const loadEnquiries = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from("manpower_enquiries")
        .select(INQUIRY_DB_COLUMNS.join(", "))
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      setEnquiries(data || []);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Could not load enquiry overview. Please refresh and try again.");
      setEnquiries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEnquiries();
  }, [loadEnquiries]);

  const poStats = useMemo(() => {
    return (commercialPOs || []).reduce(
      (acc, po) => {
        acc.total += 1;
        acc.totalValue += poContractValue(po);
        const status = normalizeStatus(po.approvalStatus ?? po.approval_status);
        if (status === "approved") {
          acc.approved += 1;
          acc.approvedValue += poContractValue(po);
        } else if (status === "rejected") {
          acc.rejected += 1;
          acc.rejectedValue += poContractValue(po);
        } else if (status === "sent_for_approval" || status === "sent") {
          acc.sent += 1;
        } else {
          acc.draft += 1;
        }
        return acc;
      },
      { total: 0, approved: 0, rejected: 0, sent: 0, draft: 0, totalValue: 0, approvedValue: 0, rejectedValue: 0 }
    );
  }, [commercialPOs]);

  const enquiryStats = useMemo(() => computeDashboardStats(enquiries), [enquiries]);
  const statusData = useMemo(() => countByStatus(enquiries), [enquiries]);
  const verticalData = useMemo(() => countByVertical(enquiries), [enquiries]);
  const trendData = useMemo(() => {
    const months = countByMonth(enquiries);
    return months.map((row) => {
      const [y, m] = String(row.key || "").split("-");
      const label =
        y && m
          ? new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" })
          : row.name;
      return { ...row, label };
    });
  }, [enquiries]);

  const statusTotal = useMemo(() => statusData.reduce((sum, d) => sum + d.value, 0), [statusData]);

  const pendingApprovalRows = useMemo(() => {
    return enquiries
      .filter((row) => {
        const s = String(row.status || "Pending").toLowerCase();
        return s === "pending" || s === "new" || s === "";
      })
      .sort((a, b) => {
        const fa = getExcelInquiryFields(a);
        const fb = getExcelInquiryFields(b);
        const da = daysSince(fa.receivedDate || a.created_at) ?? 0;
        const db = daysSince(fb.receivedDate || b.created_at) ?? 0;
        return db - da;
      })
      .slice(0, 8);
  }, [enquiries]);

  const recentActivity = useMemo(() => {
    const enquiryItems = enquiries.slice(0, 6).map((row) => {
      const fields = getExcelInquiryFields(row);
      return {
        id: `enq-${row.id}`,
        title: `${row.status || "Pending"} enquiry · ${fields.clientName || row.enquiry_number || "Enquiry"}`,
        meta: [row.enquiry_number, fields.vertical].filter(Boolean).join(" · "),
        when: row.updated_at || row.created_at,
        tone:
          String(row.status || "").toLowerCase() === "approved"
            ? "bg-emerald-100 text-emerald-700"
            : String(row.status || "").toLowerCase() === "rejected"
              ? "bg-rose-100 text-rose-700"
              : "bg-amber-100 text-amber-800",
      };
    });

    const poItems = (commercialPOs || []).slice(0, 4).map((po) => {
      const status = normalizeStatus(po.approvalStatus ?? po.approval_status) || "draft";
      return {
        id: `po-${po.id}`,
        title: `PO/WO ${status.replace(/_/g, " ")} · ${po.clientName || po.client_name || po.poWoNumber || "Contract"}`,
        meta: po.poWoNumber || po.po_wo_number || "",
        when: po.updatedAt || po.updated_at || po.createdAt || po.created_at,
        tone:
          status === "approved"
            ? "bg-emerald-100 text-emerald-700"
            : status === "rejected"
              ? "bg-rose-100 text-rose-700"
              : "bg-sky-100 text-sky-700",
      };
    });

    return [...enquiryItems, ...poItems]
      .filter((item) => item.when)
      .sort((a, b) => new Date(b.when) - new Date(a.when))
      .slice(0, 8);
  }, [enquiries, commercialPOs]);

  const reminderSet = useMemo(() => new Set(timelineSettings.reminderDays || []), [timelineSettings]);

  const toggleReminderDay = (day) => {
    setTimelineMessage("");
    setTimelineSettings((prev) => {
      const next = new Set(prev.reminderDays || []);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      const days = [...next].sort((a, b) => b - a);
      return { reminderDays: days.length ? days : [...DEFAULT_BID_DEADLINE_REMINDER_DAYS] };
    });
  };

  const addCustomReminderDay = () => {
    const day = Math.trunc(Number(customDay));
    if (!Number.isFinite(day) || day <= 0) {
      setTimelineMessage("Enter a valid custom day (for example: 10).");
      return;
    }
    setTimelineSettings((prev) => {
      const next = new Set(prev.reminderDays || []);
      next.add(day);
      return { reminderDays: [...next].sort((a, b) => b - a) };
    });
    setCustomDay("");
    setTimelineMessage("");
  };

  const handleSaveTimelineSettings = () => {
    const saved = saveCommercialTimelineSettings({ reminderDays: timelineSettings.reminderDays });
    setTimelineSettings(saved);
    setTimelineMessage(`Timeline reminders saved: ${formatReminderDaysLabel(saved.reminderDays)}.`);
  };

  const handleResetTimelineSettings = () => {
    const saved = saveCommercialTimelineSettings({ reminderDays: DEFAULT_BID_DEADLINE_REMINDER_DAYS });
    setTimelineSettings(saved);
    setCustomDay("");
    setTimelineMessage(`Reset to default reminders: ${formatReminderDaysLabel(saved.reminderDays)}.`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-purple-600" />
        Loading commercial overview…
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageTaskHeader
        title="Commercial Dashboard"
        subtitle="Manpower / Training — PO/WO, enquiries, and bid-deadline reminders."
      >
        <button
          type="button"
          onClick={() => loadEnquiries({ silent: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        <KpiTile
          label="PO / WO Created"
          value={String(poStats.total)}
          sub={formatInrCompact(poStats.totalValue)}
          tone="border-sky-100"
        />
        <KpiTile
          label="PO / WO Approved"
          value={String(poStats.approved)}
          sub={formatInrCompact(poStats.approvedValue)}
          tone="border-emerald-100"
        />
        <KpiTile
          label="Awaiting Approval"
          value={String(poStats.sent + enquiryStats.pending)}
          sub={`${poStats.sent} PO · ${enquiryStats.pending} enquiries`}
          tone="border-amber-100"
        />
        <KpiTile
          label="Total Enquiries"
          value={String(enquiryStats.total)}
          sub={`${enquiryStats.approved} approved · ${enquiryStats.rejected} regretted`}
          tone="border-purple-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        <KpiTile
          label="Overdue Enquiries"
          value={String(enquiryStats.overdue)}
          sub="Past submission deadline"
          tone="border-rose-100"
        />
        <KpiTile
          label="Due in 7 Days"
          value={String(enquiryStats.dueSoon)}
          sub="Open enquiries nearing due"
          tone="border-orange-100"
        />
        <KpiTile
          label="Pipeline Value"
          value={formatInrCompact(enquiryStats.totalValue)}
          sub="Approx. value (WO taxes)"
          tone="border-indigo-100"
        />
        <KpiTile
          label="Manpower Headcount"
          value={String(enquiryStats.totalManpower || 0)}
          sub={`${enquiryStats.unassigned || 0} unassigned enquiries`}
          tone="border-teal-100"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Enquiry Status" right={<span className="text-[11px] text-gray-500">{statusTotal} total</span>}>
          {statusData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No enquiry data yet.</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-52 w-full max-w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                      {statusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill || STATUS_CHART_COLORS.Unknown} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold tabular-nums text-gray-900">{statusTotal}</span>
                  <span className="text-[10px] text-gray-500">Total</span>
                </div>
              </div>
              <ul className="w-full space-y-2 sm:flex-1">
                {statusData.map((item) => {
                  const pct = statusTotal ? ((item.value / statusTotal) * 100).toFixed(1) : "0.0";
                  return (
                    <li key={item.name} className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex items-center gap-2 text-gray-700">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
                        {item.name}
                      </span>
                      <span className="font-medium tabular-nums text-gray-900">
                        {item.value} · {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Enquiry Monthly Trend">
          {trendData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No monthly trend available yet.</p>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mtEnquiryTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#6b7280" }} width={28} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="Enquiries" stroke="#7c3aed" fill="url(#mtEnquiryTrend)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Pending Approvals"
          right={
            <Link to={MANPOWER_BASE} className="text-[11px] font-medium text-purple-700 hover:underline">
              View all enquiries
            </Link>
          }
        >
          {pendingApprovalRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No pending enquiries.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Enquiry ID</th>
                    <th className="px-3 py-2.5 font-semibold">Client Name</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Pending Since</th>
                    <th className="px-3 py-2.5 font-semibold">Assigned To</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pendingApprovalRows.map((row) => {
                    const fields = getExcelInquiryFields(row);
                    const pendingDays = daysSince(fields.receivedDate || row.created_at);
                    const urgent = (pendingDays ?? 0) >= 5;
                    return (
                      <tr key={row.id} className="hover:bg-purple-50/40">
                        <td className="px-3 py-2.5 font-medium text-purple-700">{row.enquiry_number || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-800">{fields.clientName || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${verticalTone(fields.vertical || "")}`}
                          >
                            {fields.vertical || "—"}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 tabular-nums ${urgent ? "font-semibold text-rose-600" : "text-gray-700"}`}>
                          {pendingDays == null ? "—" : `${pendingDays} day${pendingDays === 1 ? "" : "s"}`}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">{fields.enquiryAssignedTo || "Unassigned"}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setPreviewRow(row)}
                            title="Preview enquiry details"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-purple-200 bg-white text-purple-600 hover:bg-purple-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-500">Use Preview to read full enquiry details without leaving the dashboard.</p>
        </SectionCard>

        <SectionCard title="Vertical Mix">
          {verticalData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No vertical data yet.</p>
          ) : (
            <ul className="space-y-3">
              {verticalData.map((item) => {
                const pct = enquiryStats.total ? Math.round((item.value / enquiryStats.total) * 100) : 0;
                return (
                  <li key={item.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-800">{item.name}</span>
                      <span className="tabular-nums text-gray-600">
                        {item.value} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: item.fill || VERTICAL_COLORS.Unspecified }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Quick Actions">
          <div className="space-y-2">
            <QuickActionLink
              to={`${MANPOWER_BASE}?new=1`}
              label="Add Enquiry"
              hint="Create a new commercial enquiry"
              icon={Plus}
              tone="border-purple-100 bg-purple-50/50 hover:bg-purple-50"
            />
            <QuickActionLink
              to={MANPOWER_BASE}
              label="Enquiry Master List"
              hint="Track and manage all enquiries"
              icon={ClipboardList}
              tone="border-gray-200 bg-gray-50/80 hover:bg-gray-100"
            />
            <QuickActionLink
              to={`${MT_BASE}/po-entry`}
              label="PO / WO Entry"
              hint="Create or update contracts"
              icon={FilePlus2}
              tone="border-sky-100 bg-sky-50/50 hover:bg-sky-50"
            />
            <QuickActionLink
              to={`${MT_BASE}/contact-log`}
              label="Contact Log"
              hint="Client communication trail"
              icon={Users}
              tone="border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50"
            />
            <QuickActionLink
              to={`${MT_BASE}/internal-quotation`}
              label="Internal Quotation"
              hint="Prepare internal commercial quote"
              icon={FileText}
              tone="border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50"
            />
            <QuickActionLink
              to="/app/manpower/quotation"
              label="Quotation"
              hint="Client-facing quotation list"
              icon={ShieldCheck}
              tone="border-amber-100 bg-amber-50/50 hover:bg-amber-50"
            />
          </div>
        </SectionCard>

        <SectionCard title="Recent Activity">
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No recent activity.</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((item) => (
                <li key={item.id} className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.tone}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800">{item.title}</p>
                    <p className="text-[10px] text-gray-500">
                      {[item.meta, item.when ? formatDateDdMmYyyy(item.when) : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Timeline Settings">
          <p className="text-[11px] text-gray-600">
            Bid-deadline reminders: <span className="font-medium">{formatReminderDaysLabel(timelineSettings.reminderDays)}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESET_REMINDER_DAYS.map((day) => {
              const selected = reminderSet.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleReminderDay(day)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    selected
                      ? "border-purple-600 bg-purple-50 text-purple-800"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {day} Day{day === 1 ? "" : "s"}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="number"
              min="1"
              value={customDay}
              onChange={(e) => {
                setCustomDay(e.target.value);
                setTimelineMessage("");
              }}
              placeholder="Custom day"
              className="h-8 w-28 rounded border border-gray-300 px-2 text-xs"
            />
            <button
              type="button"
              onClick={addCustomReminderDay}
              className="h-8 rounded border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Add
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveTimelineSettings}
              className="h-8 rounded bg-purple-600 px-3 text-xs font-medium text-white hover:bg-purple-700"
            >
              Save Timeline
            </button>
            <button
              type="button"
              onClick={handleResetTimelineSettings}
              className="h-8 rounded border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset Default
            </button>
          </div>
          {timelineMessage ? (
            <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
              {timelineMessage}
            </p>
          ) : null}
        </SectionCard>
      </div>

      {previewRow ? (
        <ManpowerEnquiryPreviewModal row={previewRow} onClose={() => setPreviewRow(null)} />
      ) : null}
    </div>
  );
};

export default CommercialMtDashboard;
