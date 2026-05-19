import React from "react";
import { useAmc } from "../contexts/AmcContext";

/** Clickable link that opens the related AMC record on the correct page */
export default function LinkedRecord({ type, id, label, className = "" }) {
  const { openRecord } = useAmc();
  if (!label && !id) return <span className="text-gray-400">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (id) openRecord(type, id);
      }}
      className={`text-left text-[#1F3A8A] hover:underline font-medium ${className}`}
      title={`Open ${type}`}
    >
      {label || id}
    </button>
  );
}
