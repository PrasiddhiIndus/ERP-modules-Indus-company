import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider } from '../../contexts/BillingContext';
import PAWorklist from './PAWorklist';
import PenaltyLogs from './PenaltyLogs';

const TAB_IDS = ['pa-worklist', 'penalty-logs'];

const TrackingInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = location.pathname.replace(/^\/app\/tracking\/?/, '') || 'pa-worklist';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathTab) ? pathTab : 'pa-worklist');

  useEffect(() => {
    const pathTab = location.pathname.replace(/^\/app\/tracking\/?/, '') || 'pa-worklist';
    if (TAB_IDS.includes(pathTab)) setActiveTab(pathTab);
  }, [location.pathname]);

  const tabs = [
    { id: 'pa-worklist', label: 'PA Worklist', component: PAWorklist },
    { id: 'penalty-logs', label: 'Penalty Logs', component: PenaltyLogs },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || PAWorklist;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'pa-worklist') navigate('/app/tracking');
    else navigate(`/app/tracking/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Tracking</h1>
          <p className="text-gray-600 mt-1">Payment Advice (PA) tracking – reconcile bill documentation</p>
        </div>
        <div className="px-6 flex gap-2 border-t border-gray-100">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <ActiveComponent onNavigateTab={handleTabChange} />
      </div>
    </div>
  );
};

const Tracking = () => (
  <BillingProvider>
    <TrackingInner />
  </BillingProvider>
);

export default Tracking;
