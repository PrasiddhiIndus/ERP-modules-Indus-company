import React from "react";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import { isActiveAssignment } from "../../lib/peopleManagementApi";

export function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartIso(iso = isoDateToday()) {
  return `${iso.slice(0, 7)}-01`;
}

export function buildAssignmentColumns({ onSort, sortBy, sortDir, Badge }) {
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
      key: "unique_code",
      label: "Employee code",
      headerRender: sortHeader("employee_code", "Employee code"),
      render: (row) => (
        <span className="font-mono text-[11px]">{row.people?.unique_code || "—"}</span>
      ),
    },
    {
      key: "full_name",
      label: "Employee name",
      headerRender: sortHeader("employee_name", "Employee name"),
      render: (row) => (
        <span className="font-medium text-gray-900">{row.people?.full_name || "—"}</span>
      ),
    },
    {
      key: "designation",
      label: "Designation",
      headerRender: sortHeader("designation", "Designation"),
      render: (row) => row.people?.designation || "—",
    },
    {
      key: "site_name",
      label: "Site",
      headerRender: sortHeader("site", "Site"),
      render: (row) => row.sites?.site_name || "—",
    },
    {
      key: "from_date",
      label: "From",
      headerRender: sortHeader("from_date", "From"),
      render: (row) => formatDateDdMmYyyy(row.from_date) || row.from_date || "—",
    },
    {
      key: "to_date",
      label: "To",
      headerRender: sortHeader("to_date", "To"),
      render: (row) =>
        row.to_date ? formatDateDdMmYyyy(row.to_date) || row.to_date : "—",
    },
    {
      key: "status",
      label: "Assignment",
      render: (row) =>
        isActiveAssignment(row) ? (
          <Badge tone="bg-emerald-50 text-emerald-800">Active</Badge>
        ) : (
          <Badge tone="bg-slate-100 text-slate-700">Ended</Badge>
        ),
    },
    {
      key: "employee_status",
      label: "Employee",
      render: (row) =>
        row.people?.is_active !== false ? (
          <Badge tone="bg-blue-50 text-blue-800">Active</Badge>
        ) : (
          <Badge tone="bg-amber-50 text-amber-800">Inactive</Badge>
        ),
    },
  ];
}
