import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './enquiryDashboard.css';
import EnquiryDashboard from './EnquiryDashboard';
import EnquiryDatabase from './EnquiryDatabase';
import EnquiryDropdown from './EnquiryDropdown';
import EnquiryKpi from './EnquiryKpi.jsx';
import { useAuth } from '../../../contexts/AuthContext';
import { getOpenableProjectsEnquiryTabs } from '../../../config/roles';

const TAB_IDS = ['enquiry-dashboard', 'enquiry-database', 'enquiry-kpi', 'enquiry-dropdown'];
/** Old Enquiry Entry links open the database with the Add Enquiry form. */
const LEGACY_ENTRY_TAB = 'enquiry-entry';
const ENQUIRY_BASE = '/app/projects/enquiry';

const ProjectsEnquiryHub = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile, accessibleModules, subModulePaths } = useAuth();
  const allowedTabs = getOpenableProjectsEnquiryTabs(userProfile, accessibleModules, subModulePaths);
  const pathRest = location.pathname.startsWith(ENQUIRY_BASE)
    ? location.pathname.slice(ENQUIRY_BASE.length).replace(/^\//, '') || 'enquiry-dashboard'
    : 'enquiry-dashboard';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : 'enquiry-dashboard');

  useEffect(() => {
    const rest = location.pathname.startsWith(ENQUIRY_BASE)
      ? location.pathname.slice(ENQUIRY_BASE.length).replace(/^\//, '') || 'enquiry-dashboard'
      : 'enquiry-dashboard';
    if (rest === LEGACY_ENTRY_TAB) {
      navigate(`${ENQUIRY_BASE}/enquiry-database`, { replace: true, state: { openAddEnquiry: true } });
      return;
    }
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname, navigate]);

  const tabs = [
    { id: 'enquiry-dashboard', label: 'Dashboard', component: EnquiryDashboard },
    { id: 'enquiry-database', label: 'Enquiry Database', component: EnquiryDatabase },
    { id: 'enquiry-kpi', label: 'KPI', component: EnquiryKpi },
    { id: 'enquiry-dropdown', label: 'Enquiry Dropdown', component: EnquiryDropdown },
  ].filter((t) => allowedTabs.includes(t.id));

  const tabAllowed = allowedTabs.includes(activeTab);

  useEffect(() => {
    if (!tabAllowed && allowedTabs.length) {
      navigate(`${ENQUIRY_BASE}/${allowedTabs[0]}`, { replace: true });
    }
  }, [tabAllowed, allowedTabs.join('|'), navigate]);

  const ActiveComponent = tabAllowed ? tabs.find((t) => t.id === activeTab)?.component : null;

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
            Dashboard analytics, enquiry register with Add Enquiry, and dropdown configuration.
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
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
};

export default ProjectsEnquiryHub;
