import React from "react";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";

export function buildPeopleColumns({ onSort, sortBy, sortDir, Badge }) {
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
      headerRender: sortHeader("unique_code", "Employee code"),
      render: (row) => <span className="font-mono text-[11px]">{row.unique_code || "—"}</span>,
    },
    {
      key: "full_name",
      label: "Employee name",
      headerRender: sortHeader("full_name", "Employee name"),
      render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
    },
    {
      key: "designation",
      label: "Designation",
      headerRender: sortHeader("designation", "Designation"),
      render: (row) => row.designation || "—",
    },
    {
      key: "phone_no",
      label: "Phone",
      headerRender: sortHeader("phone_no", "Phone"),
      render: (row) => row.phone_no || "—",
    },
    {
      key: "joining_date",
      label: "Joining",
      headerRender: sortHeader("joining_date", "Joining"),
      render: (row) => formatDateDdMmYyyy(row.joining_date) || row.joining_date || "—",
    },
    {
      key: "leaving_date",
      label: "Leaving",
      headerRender: sortHeader("leaving_date", "Leaving"),
      render: (row) =>
        row.leaving_date ? formatDateDdMmYyyy(row.leaving_date) || row.leaving_date : "—",
    },
    {
      key: "is_active",
      label: "Status",
      headerRender: sortHeader("is_active", "Status"),
      render: (row) =>
        row.is_active !== false ? (
          <Badge tone="bg-emerald-50 text-emerald-800">Active</Badge>
        ) : (
          <Badge tone="bg-amber-50 text-amber-800">Inactive</Badge>
        ),
    },
  ];
}
