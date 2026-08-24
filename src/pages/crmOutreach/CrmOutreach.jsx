import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
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

function CrmOutreachInner() {
  const { counts, loading, error, refresh, refreshing } = useCrmOutreach();
  const [activeTab, setActiveTab] = useState('clients');
  const meta = VIEW_META[activeTab] || VIEW_META.clients;

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <PageLoader label="Loading CRM & Outreach…" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
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
  return (
    <CrmOutreachProvider>
      <CrmOutreachInner />
    </CrmOutreachProvider>
  );
}
