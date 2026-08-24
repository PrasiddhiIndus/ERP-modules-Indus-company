import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '../../../lib/toast';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import { useCrmOutreach } from '../contexts/CrmOutreachContext';
import {
  BUSINESS_MODULES,
  OUTREACH_STATUSES,
  SITE_STATUSES,
} from '../data/outreachConstants';

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

const textareaCls =
  'w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 min-h-[72px]';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function OutreachClientEditorModal() {
  const {
    clients,
    clientEditorOpen,
    editingClientId,
    closeClientEditor,
    saveClient,
  } = useCrmOutreach();

  const existing = useMemo(
    () => clients.find((c) => c.id === editingClientId),
    [clients, editingClientId]
  );

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [primaryDesignation, setPrimaryDesignation] = useState('');
  const [primaryMobile, setPrimaryMobile] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [module, setModule] = useState('fire');
  const [status, setStatus] = useState('Active');
  const [manpowerRequired, setManpowerRequired] = useState('');
  const [siteStatus, setSiteStatus] = useState('');
  const [secondaryName, setSecondaryName] = useState('');
  const [secondaryDesignation, setSecondaryDesignation] = useState('');
  const [secondaryMobile, setSecondaryMobile] = useState('');
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientEditorOpen) return;
    setName(existing?.name || '');
    setContact(existing?.contact || '');
    setPrimaryDesignation(existing?.primaryDesignation || '');
    setPrimaryMobile(existing?.primaryMobile || '');
    setEmail(existing?.email || '');
    setCity(existing?.city || '');
    setState(existing?.state || '');
    setModule(existing?.module || 'fire');
    setStatus(existing?.status || 'Active');
    setManpowerRequired(
      existing?.manpowerRequired === null || existing?.manpowerRequired === undefined
        ? ''
        : String(existing.manpowerRequired)
    );
    setSiteStatus(existing?.siteStatus || '');
    setSecondaryName(existing?.secondaryName || '');
    setSecondaryDesignation(existing?.secondaryDesignation || '');
    setSecondaryMobile(existing?.secondaryMobile || '');
    setSecondaryEmail(existing?.secondaryEmail || '');
    setRemarks(existing?.remarks || '');
    setRawNotes(existing?.rawNotes || '');
  }, [clientEditorOpen, existing]);

  if (!clientEditorOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const emails = [email, secondaryEmail].filter((e) => String(e || '').trim());
      await saveClient(
        {
          name,
          contact,
          primaryDesignation,
          primaryMobile,
          email,
          city,
          state,
          module,
          status,
          manpowerRequired: manpowerRequired === '' ? null : Number(manpowerRequired),
          siteStatus,
          secondaryName,
          secondaryDesignation,
          secondaryMobile,
          secondaryEmail,
          remarks,
          rawNotes,
          emails,
        },
        editingClientId
      );
      toast.success(editingClientId ? 'Client updated.' : 'Client added.');
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
        onClick={closeClientEditor}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="erp-card-header border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="type-card-title text-gray-900">
              {editingClientId ? 'Edit Client' : 'Add Client'}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">Saved to the CRM outreach client master</p>
          </div>
          <button type="button" onClick={closeClientEditor} className="text-gray-500 hover:text-gray-800 text-lg leading-none px-1">
            ×
          </button>
        </div>

        <div className="erp-card-body overflow-y-auto text-sm space-y-4">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Site</p>
            <Field label="Client / Site Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Location (City)">
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="State">
                <input className={inputCls} value={state} onChange={(e) => setState(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Module">
                <select className={inputCls} value={module} onChange={(e) => setModule(e.target.value)}>
                  {Object.values(BUSINESS_MODULES).map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Manpower Required">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="1"
                  value={manpowerRequired}
                  onChange={(e) => setManpowerRequired(e.target.value)}
                />
              </Field>
              <Field label="Site Status">
                <select className={inputCls} value={siteStatus} onChange={(e) => setSiteStatus(e.target.value)}>
                  <option value="">—</option>
                  {SITE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Outreach Status">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {OUTREACH_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Primary Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Admin-Fire Sup.">
                <input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} />
              </Field>
              <Field label="Designation">
                <input className={inputCls} value={primaryDesignation} onChange={(e) => setPrimaryDesignation(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Mobile">
                <input className={inputCls} value={primaryMobile} onChange={(e) => setPrimaryMobile(e.target.value)} />
              </Field>
              <Field label="mail id">
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Secondary Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name">
                <input className={inputCls} value={secondaryName} onChange={(e) => setSecondaryName(e.target.value)} />
              </Field>
              <Field label="Designation">
                <input className={inputCls} value={secondaryDesignation} onChange={(e) => setSecondaryDesignation(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Mobile">
                <input className={inputCls} value={secondaryMobile} onChange={(e) => setSecondaryMobile(e.target.value)} />
              </Field>
              <Field label="Email">
                <input className={inputCls} type="email" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-3">
            <Field label="Remarks">
              <textarea className={textareaCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
            <Field label="Notes (internal)">
              <textarea className={textareaCls} value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="erp-card-header border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="erp-btn-primary h-8 px-4 text-xs disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Client'}
          </button>
        </div>
      </div>
    </div>
  );
}
