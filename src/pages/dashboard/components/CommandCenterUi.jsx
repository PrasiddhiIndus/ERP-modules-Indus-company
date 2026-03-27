import React from "react";
import {
  Bell,
  Search,
  RefreshCw,
  Download,
  UserCircle2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

export function SectionHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {right}
    </div>
  );
}

export function ExecutiveChip({ label, value, tone }) {
  return (
    <div className={`px-2.5 py-1 rounded-md border text-xs ${tone}`}>
      <span className="font-semibold">{value}</span>
      <span className="ml-1">{label}</span>
    </div>
  );
}

export function KpiCard({ item }) {
  return (
    <button className="text-left bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2 hover:border-blue-300 transition">
      <p className="text-[11px] text-gray-500">{item.label}</p>
      <p className="text-xl font-bold text-gray-900 leading-tight">{item.value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-gray-500">{item.sub}</p>
        <span className="text-[10px] text-blue-700 font-semibold">{item.trend}</span>
      </div>
    </button>
  );
}

export function HealthCard({ item }) {
  const tone = item.score < 70 ? "text-red-700 bg-red-50 border-red-200" : item.score < 80 ? "text-amber-800 bg-amber-50 border-amber-200" : "text-emerald-800 bg-emerald-50 border-emerald-200";
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{item.module}</p>
        <span className={`text-[10px] px-2 py-0.5 rounded border ${tone}`}>{item.health} · {item.score}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1">{item.summary}</p>
      <div className="text-[11px] text-gray-500 mt-2 flex gap-3">
        <span>Pending: {item.pending}</span>
        <span>Alerts: {item.alerts}</span>
      </div>
    </div>
  );
}

export function SeverityBadge({ level }) {
  const map = {
    critical: "bg-red-50 text-red-800 border-red-200",
    high: "bg-amber-50 text-amber-900 border-amber-200",
    warning: "bg-blue-50 text-blue-800 border-blue-200",
    normal: "bg-sky-50 text-sky-800 border-sky-200",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded border ${map[level] || map.normal}`}>{level}</span>;
}

export function PriorityActionRow({ row }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-100 text-xs">
      <SeverityBadge level={row.severity} />
      <span className="font-medium text-gray-800 min-w-20">{row.module}</span>
      <span className="text-gray-700 flex-1">{row.title}</span>
      <span className="text-gray-500">{row.count}</span>
      <span className="text-gray-500 min-w-16">{row.due}</span>
      <button className="text-blue-700 font-medium inline-flex items-center gap-1">Open <ArrowRight className="w-3 h-3" /></button>
    </div>
  );
}

export function TrendWidget({ title, values }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <p className="text-xs font-semibold text-gray-800 mb-2">{title}</p>
      <div className="flex items-end gap-1 h-16">
        {values.map((v, i) => (
          <div key={i} className="flex-1 bg-blue-100 rounded-sm">
            <div style={{ height: `${(v / max) * 100}%` }} className="bg-blue-500 rounded-sm w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SnapshotCard({ module, rows }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900">{module}</p>
        <button className="text-[11px] text-blue-700 font-medium">View details</button>
      </div>
      <div className="space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-gray-700">
            <span>{k}</span>
            <span className="font-semibold text-gray-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AlertRow({ row }) {
  return (
    <div className="grid grid-cols-[86px_90px_1fr_110px_90px_70px] items-center gap-2 text-xs px-2 py-2 border-b border-gray-100">
      <SeverityBadge level={row.severity} />
      <span className="font-medium text-gray-800">{row.module}</span>
      <span className="text-gray-700">{row.title}</span>
      <span className="text-gray-500">{row.record}</span>
      <span className="text-gray-500">{row.age}</span>
      <button className="text-blue-700 font-medium text-left">Action</button>
    </div>
  );
}

export function ApprovalTable({ rows }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
          <tr>
            {["Request", "Module", "Requester", "Department/Site", "Age", "Status", "Action"].map((h) => (
              <th key={h} className="text-left px-2 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-1.5">{r.type}</td>
              <td className="px-2 py-1.5">{r.module}</td>
              <td className="px-2 py-1.5">{r.requester}</td>
              <td className="px-2 py-1.5">{r.site}</td>
              <td className="px-2 py-1.5 text-gray-500">{r.age}</td>
              <td className="px-2 py-1.5">{r.status}</td>
              <td className="px-2 py-1.5"><button className="text-blue-700 font-medium">Review</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityItem({ item }) {
  return (
    <div className="flex items-start gap-2 text-xs border-b border-gray-100 py-2">
      <span className="text-gray-400 font-mono min-w-10">{item.time}</span>
      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{item.module}</span>
      <span className="text-gray-700 flex-1">{item.text}</span>
      <span className="text-blue-700">{item.record}</span>
    </div>
  );
}

export function QuickActionTile({ label }) {
  return <button className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50 text-left">{label}</button>;
}

export function HeaderControls() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="h-8 w-52 pl-7 pr-2 rounded border border-gray-300 text-xs" placeholder="Search modules, records..." />
      </div>
      <select className="h-8 rounded border border-gray-300 text-xs px-2 bg-white">
        <option>All</option>
        <option>IFSPL</option>
        <option>IEVPL</option>
      </select>
      <button className="h-8 px-2 rounded border border-gray-300 text-xs inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      <button className="h-8 px-2 rounded border border-gray-300 text-xs inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" />Export snapshot</button>
      <button className="h-8 w-8 rounded border border-gray-300 inline-flex items-center justify-center"><Bell className="w-4 h-4 text-gray-600" /></button>
      <div className="h-8 px-2 rounded border border-gray-300 text-xs inline-flex items-center gap-1 bg-white"><UserCircle2 className="w-4 h-4 text-gray-600" />Super Admin</div>
    </div>
  );
}

export function InsightRow({ text }) {
  return (
    <div className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-100">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
      <span className="text-gray-700">{text}</span>
      <CheckCircle2 className="w-3.5 h-3.5 text-gray-300 ml-auto mt-0.5" />
    </div>
  );
}
