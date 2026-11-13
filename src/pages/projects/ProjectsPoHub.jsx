import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import { COMMERCIAL_MODULE_PROJECTS } from '../../constants/commercialModuleType';
import { getOpenableProjectsContractTabs } from '../../config/roles';
import { useAuth } from '../../contexts/AuthContext';
import PoWoSubCoordinator from './contract/PoWoSubCoordinator';
import ContractBudget from './contract/ContractBudget';
import ContractExpense from './contract/ContractExpense';

const CONTRACT_BASE = '/app/projects/po';
const LEGACY_INNER = new Set(['po-entry', 'contact-log']);

const TAB_META = [
  { id: 'po-wo-sub-coordinator', label: 'PO/WO to Sub-Coordinator', component: PoWoSubCoordinator },
  { id: 'budget', label: 'Budget', component: ContractBudget },
  { id: 'expense', label: 'Expense', component: ContractExpense },
];

const ProjectsPoInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile, accessibleModules, subModulePaths } = useAuth();
  const { billingError, clearBillingError } = useBilling();
  const allowedTabs = getOpenableProjectsContractTabs(userProfile, accessibleModules, subModulePaths);

  const pathRest = location.pathname.startsWith(CONTRACT_BASE)
    ? location.pathname.slice(CONTRACT_BASE.length).replace(/^\//, '') || ''
    : '';

  const resolveTab = (rest) => {
    if (!rest) return allowedTabs[0] || 'po-wo-sub-coordinator';
    if (LEGACY_INNER.has(rest)) return 'po-wo-sub-coordinator';
    if (allowedTabs.includes(rest)) return rest;
    return allowedTabs[0] || 'po-wo-sub-coordinator';
  };

  const [activeTab, setActiveTab] = useState(() => resolveTab(pathRest));

  useEffect(() => {
    const rest = location.pathname.startsWith(CONTRACT_BASE)
      ? location.pathname.slice(CONTRACT_BASE.length).replace(/^\//, '') || ''
      : '';

    if (!rest && allowedTabs.length) {
      navigate(`${CONTRACT_BASE}/${allowedTabs[0]}`, { replace: true });
      return;
    }
    if (LEGACY_INNER.has(rest)) {
      navigate(`${CONTRACT_BASE}/po-wo-sub-coordinator`, {
        replace: true,
        state: { contractInnerTab: rest },
      });
      return;
    }
    if (rest && !allowedTabs.includes(rest) && allowedTabs.length) {
      navigate(`${CONTRACT_BASE}/${allowedTabs[0]}`, { replace: true });
      return;
    }
    if (rest && allowedTabs.includes(rest)) setActiveTab(rest);
  }, [location.pathname, allowedTabs.join('|'), navigate]);

  const tabs = TAB_META.filter((t) => allowedTabs.includes(t.id));
  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${CONTRACT_BASE}/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {billingError && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-sm text-amber-800">{billingError}</p>
          <button type="button" onClick={clearBillingError} className="font-medium text-amber-700 hover:text-amber-900">
            Dismiss
          </button>
        </div>
      )}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Projects — Contract Management</h1>
          <p className="mt-1 text-gray-600">
            PO/WO for sub-coordinators, budget, and expense — each page can be granted separately.
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-gray-100 px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
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
      <div className="flex-1">{ActiveComponent ? <ActiveComponent /> : null}</div>
    </div>
  );
};

const ProjectsPoHub = () => (
  <BillingProvider commercialModuleScope={COMMERCIAL_MODULE_PROJECTS}>
    <ProjectsPoInner />
  </BillingProvider>
);

export default ProjectsPoHub;
