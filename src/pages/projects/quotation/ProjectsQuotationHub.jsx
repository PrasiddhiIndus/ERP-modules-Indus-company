import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QuotationMaker from './maker/QuotationMaker';
import QuotationMakerList from './maker/QuotationMakerList';
import QuotationDashboard from './QuotationDashboard';
import QuotationBoard from './QuotationBoard';
import QuotationDropdown from './QuotationDropdown';
import QuotationTemplates from './QuotationTemplates';
import { QuotationDraftProvider } from './QuotationDraftContext';
import { QUOTATION_BASE, TAB_IDS } from './quotationConstants';

const ProjectsQuotationHub = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathRest = location.pathname.startsWith(QUOTATION_BASE)
    ? location.pathname.slice(QUOTATION_BASE.length).replace(/^\//, '') || 'quotation-entry'
    : 'quotation-entry';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : 'quotation-entry');

  useEffect(() => {
    const rest = location.pathname.startsWith(QUOTATION_BASE)
      ? location.pathname.slice(QUOTATION_BASE.length).replace(/^\//, '') || 'quotation-entry'
      : 'quotation-entry';
    // Legacy Summary BOQ tab removed from Maker v1 — land on the editor.
    if (rest === 'quotation-summary') {
      navigate(`${QUOTATION_BASE}/quotation-entry`, { replace: true });
      return;
    }
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname, navigate]);

  const tabs = [
    { id: 'quotation-entry', label: 'Make a Quotation', component: QuotationMaker },
    { id: 'quotation-list', label: 'Quotation List', component: QuotationMakerList },
    { id: 'quotation-dashboard', label: 'Dashboard', component: QuotationDashboard },
    { id: 'quotation-board', label: 'Board', component: QuotationBoard },
    { id: 'quotation-dropdown', label: 'Masters', component: QuotationDropdown },
    { id: 'quotation-templates', label: 'Templates', component: QuotationTemplates },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || QuotationMaker;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${QUOTATION_BASE}/${tabId}`);
  };

  return (
    <QuotationDraftProvider>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-5 py-3">
            <h1 className="text-2xl font-bold text-gray-900">Projects — Quotation Maker</h1>
            <p className="text-gray-600 mt-1">
              Simple guided quotations for fire-safety projects — headings, items, parts, live preview, and print.
            </p>
          </div>
          <div className="px-4 sm:px-5 flex gap-2 border-t border-gray-100 overflow-x-auto">
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
    </QuotationDraftProvider>
  );
};

export default ProjectsQuotationHub;
