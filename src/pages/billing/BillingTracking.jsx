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
    { id: 'pa-worklist', label: 'Payment proofs', component: PAWorklist },
    { id: 'penalty-logs', label: 'Penalty cuts', component: PenaltyLogs },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeSubTab)?.component || PAWorklist;

  const handleSubTabChange = (tabId) => {
    setActiveSubTab(tabId);
    if (tabId === 'pa-worklist') navigate('/app/billing/tracking');
    else navigate(`/app/billing/tracking/${tabId}`);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 pb-8">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
        <p className="font-semibold text-slate-900">Follow the money after you send the bill</p>
        <p className="text-xs text-slate-600 mt-1">
          <strong>Payment proofs</strong> = papers showing the client paid. <strong>Penalty cuts</strong> = money the client
          kept back for a rule break.
        </p>
      </div>
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
