import React from "react";

const ProjectsManagement = () => {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white shadow p-6 rounded-lg mb-6">
        <h2 className="text-2xl font-semibold mb-4">Projects Management</h2>
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Projects Management Module</h3>
          <p className="text-gray-500">This module is under development. Project management functionality will be available soon.</p>
        </div>
      </div>
    </div>
  );
};

export default ProjectsManagement;
