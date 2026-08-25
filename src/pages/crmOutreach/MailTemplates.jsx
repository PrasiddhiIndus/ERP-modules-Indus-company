import React from 'react';
import { Mail, Plus } from 'lucide-react';
import { PageTaskHeader } from '../adminOperations/components/AdminUi';
import { useCrmOutreach } from './contexts/CrmOutreachContext';

export default function MailTemplates() {
  const { templates, openTemplateEditor } = useCrmOutreach();

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Mail Templates"
        subtitle="Reusable templates for event invites, expo announcements, and client updates"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => openTemplateEditor(tpl.id)}
            className="text-left bg-surface rounded-card border border-border shadow-card p-4 hover:shadow-md hover:-translate-y-px transition-all"
          >
            <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center mb-3">
              <Mail className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold text-ink">{tpl.name}</h4>
            <p className="text-[11px] text-ink-muted mt-1">
              {tpl.category} · <span className="font-mono">{tpl.sender}</span>
            </p>
            <p className="text-xs text-ink-secondary mt-2 pt-2 border-t border-border line-clamp-2">
              {tpl.subject}
            </p>
          </button>
        ))}

        <button
          type="button"
          onClick={() => openTemplateEditor(null)}
          className="flex flex-col items-center justify-center min-h-[150px] rounded-card border-2 border-dashed border-border text-ink-muted hover:border-accent hover:text-accent transition-colors gap-2"
        >
          <Plus className="w-6 h-6" />
          <span className="text-sm font-medium">New Template</span>
        </button>
      </div>
    </div>
  );
}
