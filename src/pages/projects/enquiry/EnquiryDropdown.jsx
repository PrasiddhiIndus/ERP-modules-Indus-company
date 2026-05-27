import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { projectsTable } from '../../../services/projectsApi';
import { peInput, peLabel, slugifyKindKey } from './enquiryConstants';
import { useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';

export default function EnquiryDropdown() {
  const { kinds, loading, error, fetchDropdowns, setError } = useProjectsEnquiryDropdowns();
  const [activeKindId, setActiveKindId] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [newKindLabel, setNewKindLabel] = useState('');
  const [newKindKey, setNewKindKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingKind, setAddingKind] = useState(false);
  const [localError, setLocalError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (kinds.length && !activeKindId) setActiveKindId(kinds[0].id);
    if (kinds.length && activeKindId && !kinds.find((k) => k.id === activeKindId)) {
      setActiveKindId(kinds[0]?.id ?? null);
    }
  }, [kinds, activeKindId]);

  const activeKind = kinds.find((k) => k.id === activeKindId);
  const rows = activeKind?.options || [];

  const handleAddKind = async (e) => {
    e.preventDefault();
    const label = newKindLabel.trim();
    const kindKey = (newKindKey.trim() || slugifyKindKey(label));
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
      setLocalError(err?.message || 'Could not add dropdown kind.');
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
      setLocalError(err?.message || 'Could not add dropdown value.');
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
      setLocalError(err?.message || 'Could not delete option.');
    } finally {
      setDeletingId(null);
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
      setLocalError(err?.message || 'Could not delete kind.');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Add dropdown <strong>kinds</strong> (categories) and <strong>values</strong>. Link kinds to fields in{' '}
        <code className="text-xs bg-slate-100 px-1 rounded">projects.enquiry_field_definitions</code> (field type
        dropdown). Entry and Database forms load options dynamically.
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
              <h3 className="text-base font-semibold text-slate-900 mb-1">
                Add value — {activeKind?.label}
              </h3>
              <p className="text-xs text-slate-500 mb-4">Key: <code className="bg-slate-100 px-1">{activeKind?.kind_key}</code></p>
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
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 h-[42px] mt-5"
                  >
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800">{activeKind?.label}</h3>
                <p className="text-xs text-slate-500">{rows.length} option(s)</p>
              </div>
              <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50">
                    <span className="text-sm text-slate-800">{row.value}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteValue(row.id)}
                      disabled={deletingId === row.id}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-50"
                    >
                      {deletingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kinds.map((k) => (
              <div key={k.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">{k.label}</h4>
                <ul className="text-xs text-slate-700 space-y-0.5 max-h-32 overflow-y-auto">
                  {(k.options || []).map((r) => (
                    <li key={r.id} className="truncate" title={r.value}>
                      {r.value}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
