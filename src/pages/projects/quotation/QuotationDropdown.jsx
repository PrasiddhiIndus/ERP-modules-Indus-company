import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { projectsTable } from '../../../services/quotationApi';
import { qInput, qLabel, slugifyKindKey } from './quotationConstants';
import { useQuotationDropdowns } from './useQuotationDropdowns';

export default function QuotationDropdown() {
  const { kinds, loading, error, fetchDropdowns, setError } = useQuotationDropdowns();
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
    const kindKey = newKindKey.trim() || slugifyKindKey(label);
    if (!label || !kindKey) return;
    setAddingKind(true);
    setLocalError('');
    try {
      const maxSort = kinds.reduce((m, k) => Math.max(m, k.sort_order || 0), 0);
      const { data, error: insertError } = await projectsTable('quotation_dropdown_kinds')
        .insert({ kind_key: kindKey, label, sort_order: maxSort + 1 })
        .select()
        .single();
      if (insertError) throw insertError;
      setNewKindLabel('');
      setNewKindKey('');
      await fetchDropdowns();
      if (data?.id) setActiveKindId(data.id);
    } catch (err) {
      setLocalError(err?.message || 'Could not add master category.');
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
      const { error: insertError } = await projectsTable('quotation_dropdown_options').insert({
        kind_id: activeKindId,
        value: trimmed,
        sort_order: maxSort + 1,
      });
      if (insertError) throw insertError;
      setNewValue('');
      await fetchDropdowns();
    } catch (err) {
      setLocalError(err?.message || 'Could not add value.');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteValue = async (id) => {
    if (!window.confirm('Remove this option?')) return;
    setDeletingId(id);
    setLocalError('');
    try {
      const { error: delError } = await projectsTable('quotation_dropdown_options').delete().eq('id', id);
      if (delError) throw delError;
      await fetchDropdowns();
    } catch (err) {
      setLocalError(err?.message || 'Could not delete option.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteKind = async (kind) => {
    if (!window.confirm(`Delete "${kind.label}" and all its options?`)) return;
    setLocalError('');
    try {
      const { error: delError } = await projectsTable('quotation_dropdown_kinds').delete().eq('id', kind.id);
      if (delError) throw delError;
      await fetchDropdowns();
      setActiveKindId(null);
    } catch (err) {
      setLocalError(err?.message || 'Could not delete category.');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Manage Offer Status, Offer Type, Enquiry Source, and Branch Code lists (Excel “Dropdown list” sheet). Values appear
        on New Quotation, List filters, and Board.
      </p>

      {(error || localError) && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {localError || error}
          {error && (
            <span className="block text-xs mt-1">
              Apply migration <code className="text-[11px]">20260729120000_projects_quotation_master.sql</code> if tables are
              missing.
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Tag className="h-4 w-4 text-blue-600" />
          Add master category
        </h3>
        <form onSubmit={handleAddKind} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mt-3">
          <label className="text-sm">
            <span className={qLabel}>Display label</span>
            <input
              type="text"
              className={qInput}
              value={newKindLabel}
              onChange={(e) => {
                setNewKindLabel(e.target.value);
                if (!newKindKey.trim()) setNewKindKey(slugifyKindKey(e.target.value));
              }}
              placeholder="e.g. Offer Type"
            />
          </label>
          <label className="text-sm">
            <span className={qLabel}>Kind key</span>
            <input
              type="text"
              className={qInput}
              value={newKindKey}
              onChange={(e) => setNewKindKey(slugifyKindKey(e.target.value))}
            />
          </label>
          <button
            type="submit"
            disabled={addingKind}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {addingKind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add category
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Categories</div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {kinds.map((k) => (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => setActiveKindId(k.id)}
                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between ${
                      activeKindId === k.id ? 'bg-blue-50 text-blue-800 font-semibold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span>
                      {k.label}
                      <span className="block text-[10px] font-normal text-slate-400">{k.kind_key}</span>
                    </span>
                    <span className="text-xs text-slate-500">{k.options?.length || 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="font-semibold text-sm">{activeKind?.label || 'Select a category'}</div>
            {activeKind && (
              <button
                type="button"
                onClick={() => handleDeleteKind(activeKind)}
                className="text-xs text-rose-600 font-semibold hover:underline"
              >
                Delete category
              </button>
            )}
          </div>
          {activeKind && (
            <>
              <form onSubmit={handleAddValue} className="p-4 flex gap-2 border-b border-slate-100">
                <input
                  className={qInput}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="New option value"
                />
                <button
                  type="submit"
                  disabled={adding}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </form>
              <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {rows.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">No options yet.</li>
                ) : (
                  rows.map((r, idx) => (
                    <li key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-6 text-right shrink-0">{idx + 1}.</span>
                        <span>{r.value}</span>
                      </span>
                      <button
                        type="button"
                        disabled={deletingId === r.id}
                        onClick={() => handleDeleteValue(r.id)}
                        className="p-1.5 rounded-md hover:bg-rose-50 text-rose-600"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
