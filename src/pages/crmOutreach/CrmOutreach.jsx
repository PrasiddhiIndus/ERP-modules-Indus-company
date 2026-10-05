import React, { Suspense, lazy, useState } from 'react';
import { Building2, RefreshCw, UsersRound } from 'lucide-react';
import { CrmOutreachProvider, useCrmOutreach } from './contexts/CrmOutreachContext';
import OutreachTabBar from './components/OutreachTabBar';
import OutreachClientMaster from './OutreachClientMaster';
import MailTemplates from './MailTemplates';
import CampaignLog from './CampaignLog';
import SenderMailboxes from './SenderMailboxes';
import ComposeSendModal from './components/ComposeSendModal';
import TemplateEditorModal from './components/TemplateEditorModal';
import SenderEditorModal from './components/SenderEditorModal';
import OutreachClientEditorModal from './components/OutreachClientEditorModal';
import { InlineAlert } from '../adminOperations/components/AdminUi';
import PageLoader from '../../components/PageLoader';

const InHouseOutreach = lazy(() => import('./inHouse/InHouseOutreach'));

const AUDIENCE_STORAGE_KEY = 'crmOutreach.audience';

const AUDIENCES = {
  client: {
    label: 'Client',
    icon: Building2,
    hint: 'External outreach to clients and leads',
  },
  inhouse: {
    label: 'In-House',
    icon: UsersRound,
    hint: 'Internal mail to company employees',
  },
};

function readStoredAudience() {
  try {
    return window.sessionStorage.getItem(AUDIENCE_STORAGE_KEY) === 'inhouse' ? 'inhouse' : 'client';
  } catch {
    return 'client';
  }
}

const VIEW_META = {
  clients: {
    title: 'Client Master',
    subtitle: 'All clients across Indus verticals',
  },
  templates: {
    title: 'Mail Templates',
    subtitle: 'Reusable templates for outreach',
  },
  campaigns: {
    title: 'Campaign Log',
    subtitle: 'History of mails sent',
  },
  senders: {
    title: 'Sender Mailboxes',
    subtitle: 'Configured "From" addresses — fully dynamic',
  },
};

function AudienceSwitch({ audience, onChange }) {
  const meta = AUDIENCES[audience];
  const Icon = meta.icon;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent-border bg-accent-soft/60 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-md bg-accent text-white flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="type-card-title text-ink">Mail Outreach — {meta.label}</p>
          <p className="type-meta text-ink-secondary">{meta.hint}</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
        Audience
        <select
          className="h-9 min-w-[160px] border border-accent-border rounded-md px-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 focus:ring-accent/30"
          value={audience}
          onChange={(e) => onChange(e.target.value)}
        >
          {Object.entries(AUDIENCES).map(([id, a]) => (
            <option key={id} value={id}>{a.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CrmOutreachInner() {
  const { counts, loading, error, refresh, refreshing } = useCrmOutreach();
  const [activeTab, setActiveTab] = useState('clients');
  const meta = VIEW_META[activeTab] || VIEW_META.clients;

  if (loading) {
    return <PageLoader label="Loading CRM & Outreach…" />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="type-page-title text-ink">{meta.title}</h1>
          <p className="type-meta text-ink-secondary mt-1">{meta.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => refresh(undefined, { silent: true }).catch(() => {})}
          disabled={refreshing}
          className="erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4">
          <InlineAlert tone="error">{error}</InlineAlert>
        </div>
      ) : null}

      <OutreachTabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

      {activeTab === 'clients' && <OutreachClientMaster />}
      {activeTab === 'templates' && <MailTemplates />}
      {activeTab === 'campaigns' && <CampaignLog />}
      {activeTab === 'senders' && <SenderMailboxes />}

      <ComposeSendModal />
      <TemplateEditorModal />
      <SenderEditorModal />
      <OutreachClientEditorModal />
    </div>
  );
}

export default function CrmOutreach() {
  const [audience, setAudience] = useState(readStoredAudience);

  const changeAudience = (next) => {
    const value = next === 'inhouse' ? 'inhouse' : 'client';
    setAudience(value);
    try {
      window.sessionStorage.setItem(AUDIENCE_STORAGE_KEY, value);
    } catch {
      // Storage unavailable (private mode) — selection still works for this visit.
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <AudienceSwitch audience={audience} onChange={changeAudience} />
      {audience === 'inhouse' ? (
        <Suspense fallback={<PageLoader label="Loading In-House mail…" />}>
          <InHouseOutreach />
        </Suspense>
      ) : (
        <CrmOutreachProvider>
          <CrmOutreachInner />
        </CrmOutreachProvider>
      )}
    </div>
  );
}
