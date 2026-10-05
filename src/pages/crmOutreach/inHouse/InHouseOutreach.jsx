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
    <div className="mb-5 flex items-center gap-2 border-b border-border">
      <nav className="flex flex-1 gap-1 overflow-x-auto -mb-px" aria-label="In-House mail sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
              <span
                className={`text-[10px] font-mono min-w-[20px] text-center px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-muted'
                }`}
              >
                {counts[tab.countKey] ?? 0}
              </span>
            </button>
          );
        })}
      </nav>
      {right ? <div className="shrink-0 pb-1.5">{right}</div> : null}
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
