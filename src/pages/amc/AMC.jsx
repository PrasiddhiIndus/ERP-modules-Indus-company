import React from "react";

const AMC = () => {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white shadow p-6 rounded-lg mb-6">
        <h2 className="text-2xl font-semibold mb-4">AMC (Annual Maintenance Contract)</h2>
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">AMC Module</h3>
          <p className="text-gray-500">This module is under development. Annual Maintenance Contract management functionality will be available soon.</p>
        </div>
      </div>
    </div>
  );
};

export default AMC;
