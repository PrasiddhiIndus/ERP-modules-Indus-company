import React, { useMemo, useState } from "react";

/**
 * Generic comparator for table sorting.
 * type: "string" (default) | "number" | "date"
 * Empty/null values are always pushed to the end regardless of direction.
 */
export function compareForSort(a, b, direction, type = "string") {
  const asc = direction === "asc";

  if (type === "number") {
    const an = a == null || a === "" ? null : Number(a);
    const bn = b == null || b === "" ? null : Number(b);
    const aBad = an == null || Number.isNaN(an);
    const bBad = bn == null || Number.isNaN(bn);
    if (aBad && bBad) return 0;
    if (aBad) return 1;
    if (bBad) return -1;
    if (an === bn) return 0;
    return asc ? an - bn : bn - an;
  }

  if (type === "date") {
    const at = a ? new Date(a).getTime() : NaN;
    const bt = b ? new Date(b).getTime() : NaN;
    const aBad = Number.isNaN(at);
    const bBad = Number.isNaN(bt);
    if (aBad && bBad) return 0;
    if (aBad) return 1;
    if (bBad) return -1;
    if (at === bt) return 0;
    return asc ? at - bt : bt - at;
  }

  const as = String(a ?? "").trim().toLowerCase();
  const bs = String(b ?? "").trim().toLowerCase();
  if (as === bs) return 0;
  if (!as) return 1;
  if (!bs) return -1;
  return asc ? as.localeCompare(bs) : bs.localeCompare(as);
}

/**
 * Table sorting hook.
 * @param {Array} rows
 * @param {{ defaultField?: string|null, defaultDirection?: "asc"|"desc",
 *           columnTypes?: Record<string,"string"|"number"|"date">,
 *           accessors?: Record<string, (row:any)=>any>, onSortChange?: ()=>void }} options
 */
export function useTableSort(rows, options = {}) {
  const {
    defaultField = null,
    defaultDirection = "asc",
    columnTypes = {},
    accessors = {},
    onSortChange,
  } = options;

  const [sortField, setSortField] = useState(defaultField);
  const [sortDirection, setSortDirection] = useState(defaultDirection);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    if (typeof onSortChange === "function") onSortChange();
  };

  const sortedRows = useMemo(() => {
    if (!sortField) return rows;
    const type = columnTypes[sortField] || "string";
    const getValue = accessors[sortField] || ((row) => row?.[sortField]);
    return [...rows].sort((a, b) =>
      compareForSort(getValue(a), getValue(b), sortDirection, type)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortField, sortDirection]);

  return { sortField, sortDirection, handleSort, sortedRows };
}

/**
 * Clickable, sortable <th>. Pass the existing header className so styling stays consistent.
 */
export function SortableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  className = "",
  align = "left",
}) {
  const active = sortField === field;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th
      className={`${className} cursor-pointer select-none`}
      onClick={() => onSort(field)}
      aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      title={`Sort by ${label}`}
    >
      <span className={`inline-flex items-center gap-1 ${justify}`}>
        {label}
        <span className={active ? "text-current opacity-90" : "opacity-30"}>
          {active ? (sortDirection === "asc" ? "\u2191" : "\u2193") : "\u2195"}
        </span>
      </span>
    </th>
  );
}
