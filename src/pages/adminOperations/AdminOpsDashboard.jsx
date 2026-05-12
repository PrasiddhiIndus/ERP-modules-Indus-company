import React from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard, KpiTile, Badge, LinkedChip } from "./components/AdminUi";
import { mockActivity, mockPriorities } from "./data/mockAdminData";

const base = "/app/admin";

export default function AdminOpsDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-2">
        <KpiTile label="In-house employees" value="1,248" sub="IFSPL 982 · IEVPL 266" onClick={() => navigate(`${base}/employee/master`)} />
        <KpiTile label="Onboarding pending" value="14" sub="Docs / salary / activation" onClick={() => navigate(`${base}/employee/onboarding`)} tone="border-amber-100" />
        <KpiTile label="Leave – admin queue" value="6" sub="Post manager approval" onClick={() => navigate(`${base}/employee/leaves-permissions`)} tone="border-amber-100" />
        <KpiTile label="Raw attendance data" value="Live" sub="eTimeOffice sync" onClick={() => navigate(`${base}/employee/attendance-inputs`)} />
        <KpiTile label="Compliance gaps" value="23" sub="ESIC / nominee / bank" onClick={() => navigate(`${base}/employee/compliance-documents`)} tone="border-orange-100" />
        <KpiTile label="Exit / F&F pending" value="5" sub="Assets / gate / inputs" onClick={() => navigate(`${base}/employee/exit-ff`)} tone="border-red-100" />
        <KpiTile label="Payroll attendance sheets" value="Excel" sub="Month / year · formulas" onClick={() => navigate(`${base}/payroll/dashboard`)} tone="border-emerald-100" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <KpiTile label="Central store health" value="OK" sub="2 SKUs near reorder" onClick={() => navigate(`${base}/store/item-master`)} />
        <KpiTile label="Low stock (network)" value="9" sub="Below reorder / min" onClick={() => navigate(`${base}/store/site-stock`)} tone="border-amber-100" />
        <KpiTile label="Site shortages" value="7" sub="Planner flagged" onClick={() => navigate(`${base}/store/requirement-planner`)} tone="border-orange-100" />
        <KpiTile label="Excess at sites" value="3" sub="Review transfer back" onClick={() => navigate(`${base}/store/site-stock`)} />
        <KpiTile label="Pending returns" value="22" sub="Recoverable PPE / tools" onClick={() => navigate(`${base}/store/return-entry`)} />
        <KpiTile label="Transit pending" value="18" sub="Not received / discrepancy" onClick={() => navigate(`${base}/store/transfer-transit`)} tone="border-amber-100" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <KpiTile label="Gate pass approvals" value="8" sub="Emp / goods / visitor" onClick={() => navigate(`${base}/gate/employee-movement`)} />
        <KpiTile label="Employees out (office hrs)" value="6" sub="Linked to movement" onClick={() => navigate(`${base}/gate/employee-movement`)} />
        <KpiTile label="Open visitor passes" value="4" sub="Checkout overdue: 1" onClick={() => navigate(`${base}/gate/visitor-guest-passes`)} tone="border-amber-100" />
        <KpiTile label="Goods movement open" value="12" sub="Awaiting closure / qty" onClick={() => navigate(`${base}/gate/goods-in-out`)} />
        <KpiTile label="Vehicles inside" value="9" sub="Service + delivery mix" onClick={() => navigate(`${base}/gate/vehicle-passes`)} />
        <KpiTile label="PPE planner alerts" value="4" sub="Annual entitlement drift" onClick={() => navigate(`${base}/store/requirement-planner`)} tone="border-purple-100" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <KpiTile label="Events this month" value="6" sub="HSE + townhalls" onClick={() => navigate(`${base}/misc/events-coordination`)} />
        <KpiTile label="Travel pending approval" value="5" sub="Advances / itinerary" onClick={() => navigate(`${base}/misc/tour-travel-details`)} />
        <KpiTile label="Admin tasks (week)" value="17" sub="Due this week" onClick={() => navigate(`${base}/misc/admin-tasks-other-requests`)} tone="border-amber-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Today's admin priorities"
          right={<Badge tone="bg-red-50 text-red-800">Operations</Badge>}
        >
          <ul className="space-y-2">
            {mockPriorities.map((p) => (
              <li key={p.id} className="flex gap-2 text-xs border border-gray-100 rounded-lg p-2 bg-gray-50/50">
                <span className="font-semibold text-gray-900 shrink-0">{p.owner}</span>
                <span className="text-gray-700">{p.label}</span>
                <span className="ml-auto text-[11px] text-gray-500 whitespace-nowrap">{p.due}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkedChip label="Leave → Attendance" toHint="Salary Inputs" />
            <LinkedChip label="Exit → Store recovery" toHint="Return Entry" />
            <LinkedChip label="Site manpower" toHint="Requirement Planner" />
          </div>
        </SectionCard>

        <SectionCard title="Recent activity" right={<button type="button" className="text-[11px] text-blue-700 font-medium">View log</button>}>
          <ul className="space-y-2">
            {mockActivity.map((a, i) => (
              <li key={i} className="text-xs border-b border-gray-100 pb-2 last:border-0">
                <span className="text-[11px] text-gray-400 font-mono mr-2">{a.t}</span>
                <span className="text-gray-800">{a.msg}</span>
                <span className="text-[11px] text-gray-500 ml-1">· {a.user}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Overdue & escalation watchlist" right={<Badge tone="bg-gray-100 text-gray-700">Drill to Alerts</Badge>}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
          {[
            { t: "Visitor pass V-882 — no checkout > 4h", sev: "Gate" },
            { t: "Transfer t1 — ETA breached (SA lane)", sev: "Store" },
            { t: "Permission P-221 — over-duration (A. Verma)", sev: "Employee" },
            { t: "F&F — Ravi Nair — PPE not returned", sev: "Cross" },
            { t: "Salary lock in 2d — 6 leaves unvalidated", sev: "Payroll" },
            { t: "Goods out GO-441 — security qty mismatch", sev: "Gate" },
          ].map((x, i) => (
            <div key={i} className="rounded-lg border border-red-100 bg-red-50/40 px-2 py-2 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-red-800 uppercase">{x.sev}</span>
              <span className="text-gray-800">{x.t}</span>
                <button type="button" onClick={() => navigate(`${base}/alerts-notifications`)} className="text-left text-[11px] text-blue-700 font-medium">
                Open in Alerts →
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
