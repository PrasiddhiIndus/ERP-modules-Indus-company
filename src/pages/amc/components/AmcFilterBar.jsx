import React from "react";
import { useAmc } from "../contexts/AmcContext";
import { Badge } from "./AmcUi";

export default function AmcFilterBar() {
  const { activeFilterChips, setFilters, clearFilters } = useAmc();
  if (!activeFilterChips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 px-2 py-2 rounded-lg border border-blue-100 bg-blue-50/60">
      <span className="text-[11px] font-medium text-[#1F3A8A]">Filtered by:</span>
      {activeFilterChips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setFilters({ [chip.key]: "" })}
          className="inline-flex items-center gap-1"
        >
          <Badge tone="bg-white text-[#1F3A8A] border border-blue-200">
            {chip.label} ×
          </Badge>
        </button>
      ))}
      <button type="button" onClick={clearFilters} className="text-[11px] text-gray-600 hover:text-gray-900 ml-1">
        Clear all
      </button>
    </div>
  );
}
