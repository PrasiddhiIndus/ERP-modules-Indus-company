import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { DateInput } from '../../../components/DateInput';
import { useAuth } from '../../../contexts/AuthContext';
import { addDaysIso, projectsTable } from '../../../services/quotationApi';
import { qInput, qLabel, todayIsoDate } from './quotationConstants';

export default function FollowupModal({ quotation, onClose, onSaved }) {
  const { user, userProfile } = useAuth();
  const [note, setNote] = useState('');
  const [followupDate, setFollowupDate] = useState(todayIsoDate());
  const [nextFollowup, setNextFollowup] = useState(addDaysIso(todayIsoDate(), 7));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!quotation) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('Follow-up note is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const loggedBy = userProfile?.username || user?.email?.split('@')[0] || 'User';
      const { error: insErr } = await projectsTable('quotation_followups').insert({
        quotation_id: quotation.id,
        followup_date: followupDate || todayIsoDate(),
        note: note.trim(),
        next_followup_date: nextFollowup || null,
        logged_by: loggedBy,
        created_by: user?.id || null,
      });
      if (insErr) throw insErr;

      const { error: upErr } = await projectsTable('quotations')
        .update({
          last_followup_date: followupDate || todayIsoDate(),
          next_followup_date: nextFollowup || null,
        })
        .eq('id', quotation.id);
      if (upErr) throw upErr;

      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not save follow-up.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Add Follow-up Note</h3>
            <p className="text-xs text-slate-500 mt-0.5">{quotation.offer_no}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
          )}
          <label>
            <span className={qLabel}>Follow-up date</span>
            <DateInput className={qInput} value={followupDate} onChange={setFollowupDate} />
          </label>
          <label>
            <span className={qLabel}>
              Note <span className="text-red-500">*</span>
            </span>
            <textarea
              rows={4}
              className={qInput}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Call / email summary…"
              autoFocus
            />
          </label>
          <label>
            <span className={qLabel}>Next follow-up date</span>
            <DateInput className={qInput} value={nextFollowup} onChange={setNextFollowup} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save follow-up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
