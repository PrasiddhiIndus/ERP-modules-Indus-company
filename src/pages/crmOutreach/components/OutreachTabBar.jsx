import React from 'react';
import { Inbox, Mail, Send, Users } from 'lucide-react';

const TABS = [
  { id: 'clients', label: 'Client Master', icon: Users, countKey: 'clients' },
  { id: 'templates', label: 'Mail Templates', icon: Mail, countKey: 'templates' },
  { id: 'campaigns', label: 'Campaign Log', icon: Send, countKey: 'campaigns' },
  { id: 'senders', label: 'Sender Mailboxes', icon: Inbox, countKey: 'senders' },
];

export default function OutreachTabBar({ activeTab, onTabChange, counts, right = null }) {
  return (
    <div className="mb-5 flex items-center gap-2 border-b border-border">
      <nav className="flex flex-1 gap-1 overflow-x-auto -mb-px" aria-label="CRM & Outreach sections">
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
