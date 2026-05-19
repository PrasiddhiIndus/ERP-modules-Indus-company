import React from "react";
import {
  PageHeader,
  PrimaryButton,
  FilterBar,
  DenseTable,
  TinyInput,
  TinySelect,
} from "./AmcUi";

export default function EntityListPage({
  title,
  subtitle,
  addLabel,
  onAdd,
  onRefresh,
  onExport,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions = [],
  extraFilters,
  columns,
  rows,
  loading,
  onRowClick,
  rowKey = "id",
}) {
  return (
    <div className="space-y-3">
      <PageHeader
        title={title}
        subtitle={subtitle}
        onRefresh={onRefresh}
        onExport={onExport}
        primaryAction={onAdd ? <PrimaryButton onClick={onAdd}>{addLabel || "Add"}</PrimaryButton> : null}
      />
      <FilterBar>
        <label className="text-[11px] text-gray-600 flex-1 min-w-[140px]">
          Search
          <TinyInput
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="block mt-0.5 w-full max-w-xs"
          />
        </label>
        {statusOptions.length > 0 && (
          <label className="text-[11px] text-gray-600">
            Status
            <TinySelect
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="block mt-0.5 w-36"
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </TinySelect>
          </label>
        )}
        {extraFilters}
      </FilterBar>
      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
      ) : (
        <DenseTable columns={columns} rows={rows} onRowClick={onRowClick} rowKey={rowKey} />
      )}
    </div>
  );
}
