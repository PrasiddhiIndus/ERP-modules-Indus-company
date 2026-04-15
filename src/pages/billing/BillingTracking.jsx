import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PAWorklist from '../tracking/PAWorklist';
import PenaltyLogs from '../tracking/PenaltyLogs';

const TRACKING_TAB_IDS = ['pa-worklist', 'penalty-logs'];

const BillingTracking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const base = '/app/billing/tracking';
  const pathSuffix = location.pathname.replace(new RegExp(`^${base}/?`), '') || 'pa-worklist';
  const [activeSubTab, setActiveSubTab] = useState(TRACKING_TAB_IDS.includes(pathSuffix) ? pathSuffix : 'pa-worklist');

  useEffect(() => {
    const pathSuffix = location.pathname.replace(new RegExp(`^${base}/?`), '') || 'pa-worklist';
    if (TRACKING_TAB_IDS.includes(pathSuffix)) setActiveSubTab(pathSuffix);
  }, [location.pathname]);

  const tabs = [
    { id: 'pa-worklist', label: 'PA Worklist', component: PAWorklist },
    { id: 'penalty-logs', label: 'Penalty Logs', component: PenaltyLogs },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeSubTab)?.component || PAWorklist;

  const handleSubTabChange = (tabId) => {
    setActiveSubTab(tabId);
    if (tabId === 'pa-worklist') navigate('/app/billing/tracking');
    else navigate(`/app/billing/tracking/${tabId}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSubTabChange(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
              activeSubTab === t.id ? 'border-red-600 text-red-700 bg-red-50/60' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ActiveComponent onNavigateTab={handleSubTabChange} />
    </div>
  );
};

export default BillingTracking;
