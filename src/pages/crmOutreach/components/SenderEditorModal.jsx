import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '../../../lib/toast';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import { useCrmOutreach } from '../contexts/CrmOutreachContext';

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

const SENDER_STATUSES = ['Verified', 'Pending Verification', 'Disabled'];

export default function SenderEditorModal() {
  const {
    senders,
    senderEditorOpen,
    editingSenderId,
    closeSenderEditor,
    saveSender,
    deleteSender,
  } = useCrmOutreach();

  const existing = useMemo(
    () => senders.find((s) => s.id === editingSenderId),
    [senders, editingSenderId]
  );

  const [mail, setMail] = useState('');
  const [name, setName] = useState('');
  const [used, setUsed] = useState('');
  const [status, setStatus] = useState('Pending Verification');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!senderEditorOpen) return;
    setMail(existing?.mail || '');
    setName(existing?.name || '');
    setUsed(existing?.used || '');
    setStatus(existing?.status || 'Pending Verification');
  }, [senderEditorOpen, existing]);

  if (!senderEditorOpen) return null;

  const handleSave = async () => {
    const trimmed = mail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid mail ID.');
      return;
    }
    setSaving(true);
    try {
      await saveSender(
        {
          mail: trimmed,
          name: name.trim() || trimmed,
          used: used.trim() || 'General outreach',
          status,
        },
        editingSenderId
      );
      toast.success(editingSenderId ? 'Mailbox updated.' : 'Mailbox added.');
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingSenderId) return;
    setSaving(true);
    try {
      await deleteSender(editingSenderId);
      toast.success('Mailbox removed.');
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={closeSenderEditor}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="erp-card-header border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="type-card-title text-gray-900">
              {editingSenderId ? 'Edit Sender Mailbox' : 'New Sender Mailbox'}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Available as a &quot;From&quot; option everywhere in this module
            </p>
          </div>
          <button type="button" onClick={closeSenderEditor} className="text-gray-500 hover:text-gray-800 text-lg leading-none px-1">
            ×
          </button>
        </div>

        <div className="erp-card-body overflow-y-auto text-sm space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Mail ID</label>
            <input
              className={inputCls}
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder="e.g. expo2026@indusfiresafety.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Display Name</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Indus Expo Desk"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Used For
              <span className="text-gray-400 font-normal ml-1">short note</span>
            </label>
            <input
              className={inputCls}
              value={used}
              onChange={(e) => setUsed(e.target.value)}
              placeholder="e.g. Expo & event invites"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {SENDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="erp-card-header border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between gap-2">
          {editingSenderId ? (
            <button
              type="button"
              onClick={handleDelete}
              className="erp-btn-secondary h-8 px-3 text-xs text-critical border-critical-border"
            >
              Remove Mailbox
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={handleSave} disabled={saving} className="erp-btn-primary h-8 px-4 text-xs disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Mailbox'}
          </button>
        </div>
      </div>
    </div>
  );
}
