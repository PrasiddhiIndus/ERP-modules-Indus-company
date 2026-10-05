import React, { useMemo } from 'react';
import { Plus, Send, UsersRound } from 'lucide-react';
import { PageTaskHeader } from '../../adminOperations/components/AdminUi';
import { useInHouseOutreach } from './InHouseOutreachContext';

export default function InHouseGroups() {
  const { groups, employeesById, openGroupEditor, openCompose } = useInHouseOutreach();

  const rows = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        mailable: g.memberIds.filter((id) => employeesById.has(id)).length,
      })),
    [groups, employeesById]
  );

  return (
    <div className="space-y-4">
      <PageTaskHeader title="Employee Groups" subtitle="Reusable recipient lists for bulk mail">
        <button
          type="button"
          className="erp-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5"
          onClick={() => openGroupEditor(null)}
        >
          <Plus className="w-3.5 h-3.5" />
          New group
        </button>
      </PageTaskHeader>

      {rows.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-border px-6 py-10 text-center text-sm text-ink-muted">
          No groups yet. Create one, or select employees on the Employees tab and choose “Save as group”.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {rows.map((g) => (
            <div key={g.id} className="bg-surface rounded-card border border-border shadow-card p-4 flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
                  <UsersRound className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink truncate">{g.name}</h4>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {g.mailable} member{g.mailable !== 1 ? 's' : ''}
                    {g.memberIds.length > g.mailable
                      ? ` · ${g.memberIds.length - g.mailable} without a usable email`
                      : ''}
                  </p>
                </div>
              </div>
              {g.description ? (
                <p className="text-xs text-ink-secondary mt-2 line-clamp-2">{g.description}</p>
              ) : null}
              <div className="mt-auto pt-3 flex gap-2">
                <button
                  type="button"
                  className="erp-btn-secondary h-8 px-3 text-xs flex-1"
                  onClick={() => openGroupEditor(g.id)}
                >
                  Manage
                </button>
                <button
                  type="button"
                  className="erp-btn-primary h-8 px-3 text-xs flex-1 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  disabled={g.mailable === 0}
                  onClick={() => openCompose([g.id], { includeSelected: false })}
                >
                  <Send className="w-3.5 h-3.5" />
                  Mail group
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
