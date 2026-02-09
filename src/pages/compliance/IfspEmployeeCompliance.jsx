import React from "react";

const IfspEmployeeCompliance = () => {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white shadow p-6 rounded-lg mb-6">
        <h2 className="text-2xl font-semibold mb-4">IFSPL Employee Compliance</h2>
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">IFSPL Employee Compliance Module</h3>
          <p className="text-gray-500">This module is under development. Employee compliance tracking functionality will be available soon.</p>
        </div>
      </div>
    </div>
  );
};

export default IfspEmployeeCompliance;
