import React, { useState } from 'react';
import { History, Mail, RefreshCw, Users, UsersRound } from 'lucide-react';
import PageLoader from '../../../components/PageLoader';
import { InlineAlert } from '../../adminOperations/components/AdminUi';
import { InHouseOutreachProvider, useInHouseOutreach } from './InHouseOutreachContext';
import InHouseEmployees from './InHouseEmployees';
import InHouseGroups from './InHouseGroups';
import InHouseTemplates from './InHouseTemplates';
import InHouseMailHistory from './InHouseMailHistory';
import InHouseComposeModal from './InHouseComposeModal';
import InHouseTemplateEditorModal from './InHouseTemplateEditorModal';
import InHouseGroupEditorModal from './InHouseGroupEditorModal';

const TABS = [
  { id: 'employees', label: 'Employees', icon: Users, countKey: 'employees' },
  { id: 'groups', label: 'Groups', icon: UsersRound, countKey: 'groups' },
  { id: 'templates', label: 'Mail Templates', icon: Mail, countKey: 'templates' },
  { id: 'history', label: 'Mail History', icon: History, countKey: 'history' },
];

function InHouseTabBar({ activeTab, onTabChange, counts, right }) {
  return (
    <div className="bg-surface rounded-card shadow-card border border-border mb-5 flex items-center gap-2 pr-2">
      <nav className="flex flex-1 gap-0.5 overflow-x-auto px-2 py-2" aria-label="In-House mail sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border transition-colors shrink-0 ${
                active
                  ? 'bg-accent text-white border-accent shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
              <span className="whitespace-nowrap">{tab.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                  active
                    ? 'bg-white/20 text-white border-transparent'
                    : 'bg-surface-sunken text-ink-muted border-border'
                }`}
              >
                {counts[tab.countKey] ?? 0}
              </span>
            </button>
          );
        })}
      </nav>
      {right}
    </div>
  );
}

function InHouseOutreachInner() {
  const { loading, error, counts, refresh, refreshing } = useInHouseOutreach();
  const [activeTab, setActiveTab] = useState('employees');

  if (loading) return <PageLoader label="Loading In-House mail…" />;

  return (
    <>
      {error ? (
        <div className="mb-4">
          <InlineAlert tone="error">{error}</InlineAlert>
        </div>
      ) : null}

      <InHouseTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={counts}
        right={
          <button
            type="button"
            onClick={() => refresh().catch(() => {})}
            disabled={refreshing}
            className="erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {activeTab === 'employees' && <InHouseEmployees />}
      {activeTab === 'groups' && <InHouseGroups />}
      {activeTab === 'templates' && <InHouseTemplates />}
      {activeTab === 'history' && <InHouseMailHistory />}

      <InHouseComposeModal />
      <InHouseTemplateEditorModal />
      <InHouseGroupEditorModal />
    </>
  );
}

export default function InHouseOutreach() {
  return (
    <InHouseOutreachProvider>
      <InHouseOutreachInner />
    </InHouseOutreachProvider>
  );
}
