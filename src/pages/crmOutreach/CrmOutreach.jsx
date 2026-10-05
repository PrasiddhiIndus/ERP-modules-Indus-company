import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmOutreachAudienceAccess } from '../../config/roles';
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
import { InlineAlert, PageTaskHeader } from '../adminOperations/components/AdminUi';
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

function AudienceToggle({ audience, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Audience"
      className="inline-flex rounded-lg border border-border bg-surface-sunken p-1"
    >
      {Object.entries(AUDIENCES).map(([id, a]) => {
        const Icon = a.icon;
        const active = audience === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-sm font-medium transition-colors ${
              active ? 'bg-white text-accent shadow-sm' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            <Icon className="w-4 h-4" />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

function CrmOutreachInner() {
  const { counts, loading, error, refresh, refreshing } = useCrmOutreach();
  const [activeTab, setActiveTab] = useState('clients');

  if (loading) {
    return <PageLoader label="Loading Client Mail Outreach…" />;
  }

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <InlineAlert tone="error">{error}</InlineAlert>
        </div>
      ) : null}

      <OutreachTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={counts}
        right={
          <button
            type="button"
            onClick={() => refresh(undefined, { silent: true }).catch(() => {})}
            disabled={refreshing}
            className="erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

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
  const { user, userProfile, accessibleModules } = useAuth();
  const allowed = useMemo(
    () =>
      getCrmOutreachAudienceAccess(userProfile, accessibleModules, {
        ...(user?.user_metadata || {}),
        email: userProfile?.email || user?.email,
      }),
    [userProfile, accessibleModules, user?.user_metadata, user?.email]
  );
  const allowedIds = Object.keys(AUDIENCES).filter((id) => allowed[id]);
  const [storedAudience, setAudience] = useState(readStoredAudience);
  const audience = allowed[storedAudience] ? storedAudience : allowedIds[0];

  const changeAudience = (next) => {
    const value = next === 'inhouse' ? 'inhouse' : 'client';
    setAudience(value);
    try {
      window.sessionStorage.setItem(AUDIENCE_STORAGE_KEY, value);
    } catch {
      // Storage unavailable (private mode) — selection still works for this visit.
    }
  };

  if (!audience) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
        <PageTaskHeader title="Mail Outreach" className="mb-5" />
        <InlineAlert tone="warning">
          You don&apos;t have access to Client or In-House Mail Outreach. Ask an administrator to grant it in User Management.
        </InlineAlert>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <PageTaskHeader
        title={allowedIds.length > 1 ? 'Mail Outreach' : `${AUDIENCES[audience].label} Mail Outreach`}
        subtitle={AUDIENCES[audience].hint}
        className="mb-5"
      >
        {allowedIds.length > 1 ? <AudienceToggle audience={audience} onChange={changeAudience} /> : null}
      </PageTaskHeader>
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
