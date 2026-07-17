import React from "react";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  attCodeLabel,
  normalizeAttCode,
  resolveShiftLabel,
} from "../../lib/peopleAttendanceApi";

export const PERIOD_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "last30", label: "Last 30 days" },
];

export const GROUP_OPTIONS = [
  { value: "none", label: "Flat list" },
  { value: "employee", label: "By employee" },
  { value: "site", label: "By site" },
  { value: "date", label: "By date" },
];

export function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartIso(iso = isoDateToday()) {
  return `${iso.slice(0, 7)}-01`;
}

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyPeriodPreset(presetId, today = isoDateToday()) {
  if (presetId === "today") return { startDate: today, endDate: today };
  if (presetId === "yesterday") {
    const y = addDaysIso(today, -1);
    return { startDate: y, endDate: y };
  }
  if (presetId === "week") return { startDate: addDaysIso(today, -6), endDate: today };
  if (presetId === "last30") return { startDate: addDaysIso(today, -29), endDate: today };
  return { startDate: monthStartIso(today), endDate: today };
}

export function yearOptions(span = 6) {
  const y = new Date().getFullYear();
  return Array.from({ length: span }, (_, i) => y - i);
}

export function attCodeSeverity(code) {
  const c = normalizeAttCode(code);
  if (["P", "A", "B", "C", "G"].includes(c)) return "info";
  if (c === "HD" || c === "L") return "warning";
  if (c === "WO") return "info";
  return "high";
}

export function getGroupKey(row, groupBy) {
  if (groupBy === "employee") return String(row.person_id ?? "");
  if (groupBy === "site") return String(row.site_id ?? "none");
  if (groupBy === "date") return String(row.att_date ?? "");
  return null;
}

export function getGroupLabel(row, groupBy) {
  if (groupBy === "employee") {
    const name = row.people?.full_name || "Unknown employee";
    const code = row.people?.unique_code || "—";
    return `${name} · ${code}`;
  }
  if (groupBy === "site") return row.sites?.site_name || "No site";
  if (groupBy === "date") return formatDateDdMmYyyy(row.att_date) || row.att_date || "—";
  return "";
}

export function splitRowsIntoGroups(rows, groupBy) {
  if (!groupBy || groupBy === "none") return [{ key: "all", label: "", rows }];
  const groups = [];
  let currentKey = null;
  let bucket = [];

  for (const row of rows) {
    const key = getGroupKey(row, groupBy);
    if (currentKey !== null && key !== currentKey) {
      groups.push({
        key: currentKey,
        label: getGroupLabel(bucket[0], groupBy),
        rows: bucket,
      });
      bucket = [];
    }
    currentKey = key;
    bucket.push(row);
  }

  if (bucket.length > 0) {
    groups.push({
      key: currentKey,
      label: getGroupLabel(bucket[0], groupBy),
      rows: bucket,
    });
  }

  return groups;
}

export function buildAttendanceColumns({ onSort, sortBy, sortDir, StatusChip, Badge }) {
  const sortHeader = (key, label) => {
    const active = sortBy === key;
    const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
    return () => (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={`inline-flex items-center gap-0.5 font-semibold hover:text-[#1F3A8A] ${active ? "text-[#1F3A8A]" : ""}`}
      >
        {label}
        <span className="text-[10px] opacity-70">{arrow}</span>
      </button>
    );
  };

  return [
    {
      key: "full_name",
      label: "Employee name",
      headerRender: sortHeader("employee_name", "Employee name"),
      cellClassName: "min-w-[150px] max-w-[220px] whitespace-nowrap",
      render: (row) => (
        <span className="font-medium text-gray-900" title={row.people?.full_name || ""}>
          {row.people?.full_name || "—"}
        </span>
      ),
    },
    {
      key: "unique_code",
      label: "Employee code",
      headerRender: sortHeader("employee_code", "Employee code"),
      headerClassName: "text-center",
      cellClassName: "text-center font-mono tabular-nums whitespace-nowrap",
      render: (row) => row.people?.unique_code || "—",
    },
    {
      key: "site_name",
      label: "Site",
      headerRender: sortHeader("site", "Site"),
      cellClassName: "min-w-[120px] max-w-[180px] truncate",
      render: (row) => (
        <span className="block truncate" title={row.sites?.site_name || ""}>
          {row.sites?.site_name || "—"}
        </span>
      ),
    },
    {
      key: "designation",
      label: "Designation",
      headerRender: sortHeader("designation", "Designation"),
      cellClassName: "whitespace-nowrap",
      render: (row) => row.designation || row.people?.designation || "—",
    },
    {
      key: "att_date",
      label: "Date",
      headerRender: sortHeader("date", "Date"),
      cellClassName: "tabular-nums whitespace-nowrap",
      render: (row) => formatDateDdMmYyyy(row.att_date) || row.att_date || "—",
    },
    {
      key: "month",
      label: "Month",
      headerRender: sortHeader("month", "Month"),
      headerClassName: "text-center",
      cellClassName: "text-center tabular-nums",
      render: (row) => (row.month != null ? row.month : "—"),
    },
    {
      key: "year",
      label: "Year",
      headerRender: sortHeader("year", "Year"),
      headerClassName: "text-center",
      cellClassName: "text-center tabular-nums",
      render: (row) => (row.year != null ? row.year : "—"),
    },
    {
      key: "shift",
      label: "Shift",
      headerRender: sortHeader("shift", "Shift"),
      cellClassName: "whitespace-nowrap",
      render: (row) => resolveShiftLabel(row),
    },
    {
      key: "att_code",
      label: "Attendance mark",
      headerRender: sortHeader("mark", "Attendance mark"),
      cellClassName: "whitespace-nowrap",
      render: (row) => {
        const code = normalizeAttCode(row.att_code) || "—";
        const label = attCodeLabel(row.att_code);
        return (
          <span className="inline-flex items-center gap-1.5" title={label}>
            <StatusChip label={code} severity={attCodeSeverity(row.att_code)} />
            <span className="text-[11px] text-gray-600">{label}</span>
          </span>
        );
      },
    },
    {
      key: "ot_hours",
      label: "OT",
      headerClassName: "text-center",
      cellClassName: "text-center tabular-nums",
      render: (row) => (row.ot_hours != null ? row.ot_hours : 0),
    },
    {
      key: "is_locked",
      label: "Lock",
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row) =>
        row.is_locked ? (
          <Badge tone="bg-amber-50 text-amber-800">Locked</Badge>
        ) : (
          <Badge tone="bg-emerald-50 text-emerald-800">Open</Badge>
        ),
    },
  ];
}
