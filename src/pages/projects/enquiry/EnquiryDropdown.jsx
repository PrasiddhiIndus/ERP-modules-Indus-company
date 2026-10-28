import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, Plus, Search, Square, Tag, Trash2 } from 'lucide-react';
import { projectsErrorMsg, projectsTable } from '../../../services/projectsApi';
import { peInput, peLabel, slugifyKindKey } from './enquiryConstants';
import { ASSIGNEE_KIND_KEY, useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';

function nameKey(value) {
  return String(value || '').trim().toLowerCase();
}

export default function EnquiryDropdown() {
  const {
    kinds,
    setKinds,
    assigneeCandidates,
    optionsByKindKey,
    loading,
    error,
    fetchDropdowns,
  } = useProjectsEnquiryDropdowns();
  const [activeKindId, setActiveKindId] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [newKindLabel, setNewKindLabel] = useState('');
  const [newKindKey, setNewKindKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingKind, setAddingKind] = useState(false);
  const [localError, setLocalError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [togglingName, setTogglingName] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');

  useEffect(() => {
    if (kinds.length && !activeKindId) setActiveKindId(kinds[0].id);
    if (kinds.length && activeKindId && !kinds.find((k) => k.id === activeKindId)) {
      setActiveKindId(kinds[0]?.id ?? null);
    }
  }, [kinds, activeKindId]);

  const activeKind = kinds.find((k) => k.id === activeKindId);
  const rows = activeKind?.options || [];
  const isAssigneeKind = activeKind?.kind_key === ASSIGNEE_KIND_KEY;

  const checkedByName = useMemo(() => {
    const map = new Map();
    for (const opt of rows) {
      map.set(nameKey(opt.value), opt);
    }
    return map;
  }, [rows]);

  const assigneeRows = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    // Projects-department employees only — no manual names.
    const list = (assigneeCandidates || []).map((emp) => {
      const opt = checkedByName.get(nameKey(emp.full_name));
      return {
        key: `emp:${emp.employee_code || emp.full_name}`,
        name: emp.full_name,
        code: emp.employee_code || '',
        checked: Boolean(opt),
        optionId: opt?.id || null,
      };
    });
    const filtered = q
      ? list.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            String(r.code).toLowerCase().includes(q)
        )
      : list;
    return filtered.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [assigneeCandidates, assigneeSearch, checkedByName]);

  const assigneePreviewOptions = optionsByKindKey[ASSIGNEE_KIND_KEY] || [];
  const checkedCount = isAssigneeKind ? assigneePreviewOptions.length : rows.length;

  const handleAddKind = async (e) => {
    e.preventDefault();
    const label = newKindLabel.trim();
    const kindKey = newKindKey.trim() || slugifyKindKey(label);
    if (!label || !kindKey) return;
    setAddingKind(true);
    setLocalError('');
    try {
      const maxSort = kinds.reduce((m, k) => Math.max(m, k.sort_order || 0), 0);
      const { data, error: insertError } = await projectsTable('enquiry_dropdown_kinds')
        .insert({ kind_key: kindKey, label, sort_order: maxSort + 1 })
        .select()
        .single();
      if (insertError) throw insertError;
      setNewKindLabel('');
      setNewKindKey('');
      await fetchDropdowns();
      if (data?.id) setActiveKindId(data.id);
    } catch (err) {
      setLocalError(projectsErrorMsg(err, 'Add dropdown kind'));
    } finally {
      setAddingKind(false);
    }
  };

  const handleAddValue = async (e) => {
    e.preventDefault();
    const trimmed = newValue.trim();
    if (!trimmed || !activeKindId) return;
    setAdding(true);
    setLocalError('');
    try {
      const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
      const { error: insertError } = await projectsTable('enquiry_dropdown_options').insert({
        kind_id: activeKindId,
        value: trimmed,
        sort_order: maxSort + 1,
      });
      if (insertError) throw insertError;
      setNewValue('');
      await fetchDropdowns();
    } catch (err) {
      setLocalError(projectsErrorMsg(err, 'Add dropdown value'));
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteValue = async (id) => {
    if (!window.confirm('Remove this dropdown option?')) return;
    setDeletingId(id);
    setLocalError('');
    try {
      const { error: delError } = await projectsTable('enquiry_dropdown_options').delete().eq('id', id);
      if (delError) throw delError;
      await fetchDropdowns();
    } catch (err) {
      setLocalError(projectsErrorMsg(err, 'Delete option'));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleAssignee = async (row) => {
    if (!activeKindId || togglingName) return;
    setTogglingName(row.name);
    setLocalError('');
    // Optimistic mini-preview update so the card refreshes immediately.
    const previousKinds = kinds;
    setKinds((prev) =>
      prev.map((k) => {
        if (k.id !== activeKindId) return k;
        if (row.checked && row.optionId) {
          return { ...k, options: (k.options || []).filter((o) => o.id !== row.optionId) };
        }
        if (!row.checked) {
          const maxSort = (k.options || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
          return {
            ...k,
            options: [
              ...(k.options || []),
              {
                id: `temp:${row.name}`,
                kind_id: activeKindId,
                value: row.name,
                sort_order: maxSort + 1,
              },
            ],
          };
        }
        return k;
      })
    );
    try {
      if (row.checked && row.optionId) {
        const { error: delError } = await projectsTable('enquiry_dropdown_options')
          .delete()
          .eq('id', row.optionId);
        if (delError) throw delError;
      } else if (!row.checked) {
        const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
        const { error: insertError } = await projectsTable('enquiry_dropdown_options').insert({
          kind_id: activeKindId,
          value: row.name,
          sort_order: maxSort + 1,
        });
        if (insertError) throw insertError;
      }
      await fetchDropdowns();
    } catch (err) {
      setKinds(previousKinds);
      setLocalError(projectsErrorMsg(err, row.checked ? 'Could not uncheck person' : 'Could not check person'));
    } finally {
      setTogglingName('');
    }
  };

  const handleDeleteKind = async (kind) => {
    if (
      !window.confirm(
        `Delete dropdown kind "${kind.label}" and all its options? Fields linked to this kind will lose their dropdown list.`
      )
    ) {
      return;
    }
    setLocalError('');
    try {
      const { error: delError } = await projectsTable('enquiry_dropdown_kinds').delete().eq('id', kind.id);
      if (delError) throw delError;
      await fetchDropdowns();
      setActiveKindId(null);
    } catch (err) {
      setLocalError(projectsErrorMsg(err, 'Delete kind'));
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Add dropdown <strong>kinds</strong> (categories) and <strong>values</strong>. Link kinds to enquiry form
        fields that use a dropdown. Entry and Database forms load options dynamically.
      </p>

      {(error || localError) && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {localError || error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Tag className="h-4 w-4 text-blue-600" />
          Add dropdown kind
        </h3>
        <p className="text-xs text-slate-500 mb-4">Creates a new column category (e.g. Enquiry From, Priority).</p>
        <form onSubmit={handleAddKind} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="text-sm">
            <span className={peLabel}>Display label</span>
            <input
              type="text"
              className={peInput}
              value={newKindLabel}
              onChange={(e) => {
                setNewKindLabel(e.target.value);
                if (!newKindKey.trim()) setNewKindKey(slugifyKindKey(e.target.value));
              }}
              placeholder="e.g. Enquiry From"
            />
          </label>
          <label className="text-sm">
            <span className={peLabel}>Kind key (slug)</span>
            <input
              type="text"
              className={peInput}
              value={newKindKey}
              onChange={(e) => setNewKindKey(slugifyKindKey(e.target.value))}
              placeholder="enquiry_from"
            />
          </label>
          <button
            type="submit"
            disabled={addingKind || !newKindLabel.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 h-[42px]"
          >
            {addingKind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add kind
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : kinds.length === 0 ? (
        <p className="text-sm text-slate-500">No dropdown kinds yet. Add one above.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {kinds.map((k) => (
              <div key={k.id} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveKindId(k.id);
                    setNewValue('');
                    setAssigneeSearch('');
                    setLocalError('');
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-l-lg border transition-colors ${
                    activeKindId === k.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {k.label}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteKind(k)}
                  className="px-2 py-2 text-sm border border-l-0 border-slate-200 rounded-r-lg text-rose-600 hover:bg-rose-50"
                  title="Delete kind"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {isAssigneeKind ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-800">Assigned to Person</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Active employees from the Projects department only. Tick who should appear in Assigned To
                  Person on Entry and Enquiry Database ({checkedCount} selected). Manual names are not allowed.
                </p>
              </div>
              <div className="border-b border-slate-100 px-5 py-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    className={`${peInput} pl-9`}
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    placeholder="Search employee name or code…"
                  />
                </label>
              </div>
              <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                {assigneeRows.length === 0 ? (
                  <li className="px-5 py-8 text-center text-sm text-slate-500">
                    {assigneeCandidates?.length
                      ? 'No matches for that search.'
                      : 'No active Projects-department employees found in Employee Master.'}
                  </li>
                ) : (
                  assigneeRows.map((row) => {
                    const busy = togglingName === row.name;
                    return (
                      <li key={row.key}>
                        <button
                          type="button"
                          onClick={() => toggleAssignee(row)}
                          disabled={Boolean(togglingName)}
                          className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60"
                        >
                          <span className="text-blue-600">
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : row.checked ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-400" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {row.code ? `Code ${row.code}` : 'Projects department'}
                            </span>
                          </span>
                          {row.checked ? (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              In dropdown
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-slate-900">Add value — {activeKind?.label}</h3>
                <p className="mb-4 text-xs text-slate-500">
                  Key: <code className="bg-slate-100 px-1">{activeKind?.kind_key}</code>
                </p>
                <form onSubmit={handleAddValue} className="flex gap-2">
                  <div className="flex-1">
                    <label className={peLabel}>New value</label>
                    <input
                      type="text"
                      className={peInput}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Add option…"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={adding || !newValue.trim()}
                      className="mt-5 inline-flex h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add
                    </button>
                  </div>
                </form>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">{activeKind?.label}</h3>
                  <p className="text-xs text-slate-500">{rows.length} option(s)</p>
                </div>
                <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                  {rows.length === 0 ? (
                    <li className="px-5 py-6 text-sm text-slate-500">No options yet. Add a value on the left.</li>
                  ) : (
                    rows.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50">
                        <span className="text-sm text-slate-800">{row.value}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteValue(row.id)}
                          disabled={deletingId === row.id}
                          className="rounded p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          title="Delete option"
                          aria-label={`Delete ${row.value}`}
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kinds.map((k) => {
              const previewOpts = optionsByKindKey[k.kind_key] || [];
              return (
                <div key={k.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                    {k.label}
                    {k.kind_key === ASSIGNEE_KIND_KEY ? (
                      <span className="ml-1 font-medium normal-case text-slate-400">
                        ({previewOpts.length})
                      </span>
                    ) : null}
                  </h4>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-700">
                    {previewOpts.map((r) => (
                      <li key={r.id || r.value} className="truncate" title={r.value}>
                        {r.value}
                      </li>
                    ))}
                    {!previewOpts.length ? (
                      <li className="text-slate-400">
                        {k.kind_key === ASSIGNEE_KIND_KEY ? 'None checked' : 'None selected'}
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
