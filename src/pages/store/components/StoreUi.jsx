import React from "react";

export const SectionCard = ({ title, right, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100">
    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {right}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

export const Badge = ({ children, tone = "bg-gray-100 text-gray-700" }) => (
  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${tone}`}>{children}</span>
);

export const TinyInput = (props) => (
  <input
    {...props}
    className={`h-9 border border-gray-300 rounded px-2 text-sm ${props.className || ""}`.trim()}
  />
);

