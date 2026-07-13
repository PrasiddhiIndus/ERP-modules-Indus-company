import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import { supabase } from '../../lib/supabase';
import { COMMERCIAL_MODULE_MANPOWER_TRAINING } from '../../constants/commercialModuleType';
import {
  DEFAULT_BID_DEADLINE_REMINDER_DAYS,
  formatReminderDaysLabel,
  getCommercialTimelineSettings,
  saveCommercialTimelineSettings,
} from '../manpowerProject/utils/commercialTimelineSettings';
import POEntry from './POEntry';
import ContactLog from './ContactLog';

const TAB_IDS = ['po-entry', 'contact-log'];

/** Commercial PO + Contact sub-routes for Manpower / Training commercial line. */
const COMMERCIAL_MT_BASE = '/app/commercial/manpower-training';

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const CommercialDashboard = () => {
  const { commercialPOs } = useBilling();
  const [manpowerStats, setManpowerStats] = useState({
    total: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
  });
  const [manpowerError, setManpowerError] = useState('');
  const [timelineSettings, setTimelineSettings] = useState(() => getCommercialTimelineSettings());
  const [timelineDraft, setTimelineDraft] = useState(() => getCommercialTimelineSettings().reminderDays.join(', '));
  const [timelineMessage, setTimelineMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadManpowerStats = async () => {
      try {
        const { data: rows, error: queryError } = await supabase
          .from('manpower_enquiries')
          .select('id, duration, status');

        if (queryError) {
          throw queryError;
        }

        const allRows = rows || [];
        const total = allRows.length;
        const approved = allRows.filter((r) => r.status === 'Approved').length;
        const rejected = allRows.filter((r) => r.status === 'Rejected').length;
        const pending = Math.max(0, total - approved - rejected);

        if (!cancelled) {
          setManpowerStats({ total, approved, rejected, pending });
          setManpowerError('');
        }
      } catch (error) {
        if (!cancelled) {
          setManpowerError(error?.message || 'Could not load manpower data');
          setManpowerStats({ total: 0, approved: 0, rejected: 0, pending: 0 });
        }
      }
    };

    loadManpowerStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const poStats = commercialPOs.reduce(
    (acc, po) => {
      acc.total += 1;
      const status = normalizeStatus(po.approvalStatus);
      if (status === 'approved') acc.approved += 1;
      else if (status === 'rejected') acc.rejected += 1;
      else if (status === 'sent_for_approval') acc.sent += 1;
      else acc.draft += 1;
      return acc;
    },
    { total: 0, approved: 0, rejected: 0, sent: 0, draft: 0 }
  );

  const statCards = [
    { label: 'Total PO/WO Created', value: poStats.total, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
    { label: 'PO/WO Approved', value: poStats.approved, tone: 'bg-green-50 text-green-700 border-green-100' },
    { label: 'PO/WO Rejected', value: poStats.rejected, tone: 'bg-red-50 text-red-700 border-red-100' },
    { label: 'PO/WO Sent for Approval', value: poStats.sent, tone: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
    { label: 'Total Manpower Enquiries', value: manpowerStats.total, tone: 'bg-purple-50 text-purple-700 border-purple-100' },
    { label: 'Manpower Approved', value: manpowerStats.approved, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: 'Manpower Rejected', value: manpowerStats.rejected, tone: 'bg-rose-50 text-rose-700 border-rose-100' },
    { label: 'Manpower Pending', value: manpowerStats.pending, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  ];

  const handleSaveTimelineSettings = () => {
    const parsedDays = timelineDraft
      .split(/[,\s]+/)
      .map((part) => Number(part.trim()))
      .filter((day) => Number.isFinite(day) && day > 0);

    if (!parsedDays.length) {
      setTimelineMessage('Enter at least one reminder day (for example: 7, 1).');
      return;
    }

    const saved = saveCommercialTimelineSettings({ reminderDays: parsedDays });
    setTimelineSettings(saved);
    setTimelineDraft(saved.reminderDays.join(', '));
    setTimelineMessage(`Timeline reminders saved: ${formatReminderDaysLabel(saved.reminderDays)}.`);
  };

  const handleResetTimelineSettings = () => {
    const saved = saveCommercialTimelineSettings({ reminderDays: DEFAULT_BID_DEADLINE_REMINDER_DAYS });
    setTimelineSettings(saved);
    setTimelineDraft(saved.reminderDays.join(', '));
    setTimelineMessage(`Reset to default reminders: ${formatReminderDaysLabel(saved.reminderDays)}.`);
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6">
        <h2 className="text-xl font-bold text-gray-900">Commercial Dashboard</h2>
        <p className="text-sm text-gray-600 mt-1">
          Summary of PO/WO entry and Manpower approval status (Manpower / Training).
        </p>
        {manpowerError && (
          <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Manpower dashboard data is unavailable: {manpowerError}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`border rounded-xl p-4 ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-gray-900">
              <Settings2 className="h-5 w-5 text-purple-600" />
              <h3 className="text-lg font-semibold">Timeline Setting</h3>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Configure bid-deadline reminder days for manpower enquiries. Current alerts: {formatReminderDaysLabel(timelineSettings.reminderDays)}.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <label className="text-sm text-gray-700">
            <span className="block mb-1.5 font-medium">Reminder days before deadline</span>
            <input
              type="text"
              value={timelineDraft}
              onChange={(e) => {
                setTimelineDraft(e.target.value);
                setTimelineMessage('');
              }}
              placeholder="7, 1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            <span className="mt-1.5 block text-xs text-gray-500">Enter comma-separated days (example: 7, 3, 1).</span>
          </label>
          <button
            type="button"
            onClick={handleSaveTimelineSettings}
            className="h-10 rounded-lg bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700"
          >
            Save Timeline
          </button>
          <button
            type="button"
            onClick={handleResetTimelineSettings}
            className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Reset Default
          </button>
        </div>

        {timelineMessage ? (
          <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            {timelineMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const CommercialInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { billingError, clearBillingError } = useBilling();
  const pathRest = location.pathname.startsWith(COMMERCIAL_MT_BASE)
    ? location.pathname.slice(COMMERCIAL_MT_BASE.length).replace(/^\//, '') || 'po-entry'
    : 'po-entry';
  const isDashboardRoute = pathRest === 'dashboard';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : 'po-entry');

  useEffect(() => {
    const rest = location.pathname.startsWith(COMMERCIAL_MT_BASE)
      ? location.pathname.slice(COMMERCIAL_MT_BASE.length).replace(/^\//, '') || 'po-entry'
      : 'po-entry';
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname]);

  const tabs = [
    { id: 'po-entry', label: 'PO Entry', component: POEntry },
    { id: 'contact-log', label: 'Contact Log', component: ContactLog },
  ];

  const ActiveComponent = isDashboardRoute
    ? CommercialDashboard
    : tabs.find((t) => t.id === activeTab)?.component || POEntry;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${COMMERCIAL_MT_BASE}/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {billingError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-sm text-amber-800">{billingError}</p>
          <button type="button" onClick={clearBillingError} className="text-amber-700 hover:text-amber-900 font-medium">Dismiss</button>
        </div>
      )}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Commercial — Manpower / Training</h1>
          <p className="text-gray-600 mt-1">PO/WO Management – Contract details (master source for Billing)</p>
        </div>
        {!isDashboardRoute && (
          <div className="px-6 flex gap-2 border-t border-gray-100">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabChange(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1">
        <ActiveComponent onNavigateTab={handleTabChange} />
      </div>
    </div>
  );
};

const Commercial = () => (
  <BillingProvider commercialModuleScope={COMMERCIAL_MODULE_MANPOWER_TRAINING}>
    <CommercialInner />
  </BillingProvider>
);

export default Commercial;
