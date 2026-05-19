import React from "react";
import { DenseTable } from "./AmcUi";
import LinkedRecord from "./LinkedRecord";

export default function RelatedRecordsTable({
  title,
  columns,
  rows,
  emptyText = "No linked records",
  onViewAll,
  onRowClick,
}) {
  if (!rows?.length) {
    return (
      <div className="text-xs text-gray-500 py-2">
        {emptyText}
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="ml-2 text-[#1F3A8A] font-medium">
            View all →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-semibold text-gray-700">{title}</p>}
      <DenseTable columns={columns} rows={rows.slice(0, 8)} onRowClick={onRowClick} />
      {rows.length > 8 && onViewAll && (
        <button type="button" onClick={onViewAll} className="text-[11px] text-[#1F3A8A] font-medium">
          View all {rows.length} →
        </button>
      )}
    </div>
  );
}

export function customerColumn() {
  return {
    key: "customer_name",
    label: "Customer",
    render: (r) => (
      <LinkedRecord type="customer" id={r.customer_id} label={r.customer_name} />
    ),
  };
}

export function contractColumn() {
  return {
    key: "contract_no",
    label: "Contract",
    render: (r) => (
      <LinkedRecord type="contract" id={r.contract_id} label={r.contract_no} />
    ),
  };
}

export function siteColumn() {
  return {
    key: "site_name",
    label: "Site",
    render: (r) => <LinkedRecord type="site" id={r.site_id} label={r.site_name} />,
  };
}
