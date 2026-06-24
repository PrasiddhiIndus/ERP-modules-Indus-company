import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './enquiryDashboard.css';
import EnquiryDashboard from './EnquiryDashboard';
import EnquiryEntry from './EnquiryEntry';
import EnquiryDatabase from './EnquiryDatabase';
import EnquiryDropdown from './EnquiryDropdown';

const TAB_IDS = ['enquiry-dashboard', 'enquiry-entry', 'enquiry-database', 'enquiry-dropdown'];
const ENQUIRY_BASE = '/app/projects/enquiry';

const ProjectsEnquiryHub = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathRest = location.pathname.startsWith(ENQUIRY_BASE)
    ? location.pathname.slice(ENQUIRY_BASE.length).replace(/^\//, '') || 'enquiry-dashboard'
    : 'enquiry-dashboard';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : 'enquiry-dashboard');

  useEffect(() => {
    const rest = location.pathname.startsWith(ENQUIRY_BASE)
      ? location.pathname.slice(ENQUIRY_BASE.length).replace(/^\//, '') || 'enquiry-dashboard'
      : 'enquiry-dashboard';
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname]);

  const tabs = [
    { id: 'enquiry-dashboard', label: 'Dashboard', component: EnquiryDashboard },
    { id: 'enquiry-entry', label: 'Enquiry Entry', component: EnquiryEntry },
    { id: 'enquiry-database', label: 'Enquiry Database', component: EnquiryDatabase },
    { id: 'enquiry-dropdown', label: 'Enquiry Dropdown', component: EnquiryDropdown },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || EnquiryEntry;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${ENQUIRY_BASE}/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 projects-enquiry-hub">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Projects — Enquiry Master</h1>
          <p className="text-gray-600 mt-1">
            Dashboard analytics, entry form, database register, and dropdown configuration.
          </p>
        </div>
        <div className="px-6 flex gap-2 border-t border-gray-100 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <ActiveComponent />
      </div>
    </div>
  );
};

export default ProjectsEnquiryHub;
