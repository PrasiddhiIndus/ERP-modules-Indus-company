import React from "react";

/** Placeholder for a Projects menu item that does not have its own screen yet. */
export default function ProjectsSectionPage({ title, description }) {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white shadow p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-2">{title}</h2>
        <p className="text-gray-500">{description}</p>
      </div>
    </div>
  );
}
