import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { projectsTable } from '../../../services/quotationApi';
import { formatCurrency, qInput, qLabel } from './quotationConstants';

export default function ConvertToProjectModal({ quotation, onClose, onConverted }) {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState(
    quotation ? `${quotation.client_name || 'Client'} — ${quotation.location || 'Site'}` : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!quotation) return null;

  const handleConvert = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const code = `PRJ-${String(quotation.offer_no || '').replace(/\//g, '-').slice(0, 40)}`;
      const { data: project, error: pErr } = await projectsTable('project_records')
        .insert({
          project_code: code,
          project_name: projectName.trim() || code,
          client_name: quotation.client_name,
          location: quotation.location,
          scope: quotation.scope,
          contract_value: quotation.quoted_rate,
          contact_person: quotation.contact_person,
          contact_no: quotation.contact_no,
          email_id: quotation.email_id,
          source_quotation_id: quotation.id,
          status: 'Active',
          created_by: user?.id || null,
        })
        .select('*')
        .single();
      if (pErr) throw pErr;

      const { error: qErr } = await projectsTable('quotations')
        .update({
          linked_project_id: project.id,
          linked_project_name: project.project_name,
        })
        .eq('id', quotation.id);
      if (qErr) throw qErr;

      onConverted?.(project);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not create project from quotation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Create Project from Quotation?</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pre-filled from {quotation.offer_no} · {formatCurrency(quotation.quoted_rate)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleConvert} className="p-5 space-y-3">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
          )}
          <label>
            <span className={qLabel}>Project name</span>
            <input className={qInput} value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
          </label>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 space-y-1">
            <div>
              <span className="font-semibold">Client:</span> {quotation.client_name || '—'}
            </div>
            <div>
              <span className="font-semibold">Location:</span> {quotation.location || '—'}
            </div>
            <div>
              <span className="font-semibold">Contact:</span> {quotation.contact_person || '—'}
            </div>
            <div>
              <span className="font-semibold">Value:</span> {formatCurrency(quotation.quoted_rate)}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium">
              Skip for now
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
