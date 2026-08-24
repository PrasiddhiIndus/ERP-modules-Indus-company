import React from 'react';
import { Inbox, Mail, Send, Users } from 'lucide-react';

const TABS = [
  { id: 'clients', label: 'Client Master', icon: Users, countKey: 'clients' },
  { id: 'templates', label: 'Mail Templates', icon: Mail, countKey: 'templates' },
  { id: 'campaigns', label: 'Campaign Log', icon: Send, countKey: 'campaigns' },
  { id: 'senders', label: 'Sender Mailboxes', icon: Inbox, countKey: 'senders' },
];

export default function OutreachTabBar({ activeTab, onTabChange, counts }) {
  return (
    <div className="bg-surface rounded-card shadow-card border border-border mb-5">
      <nav className="flex gap-0.5 overflow-x-auto px-2 py-2" aria-label="CRM & Outreach sections">
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
    </div>
  );
}
