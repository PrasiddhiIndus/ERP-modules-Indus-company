import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  fetchQuotationSettings,
  fetchQuotationTemplates,
  projectsTable,
  setAdvancedPricingEnabled,
} from '../../../services/quotationApi';
import { qInput, qLabel } from './quotationConstants';

export default function QuotationTemplates() {
  const [templates, setTemplates] = useState([]);
  const [activeType, setActiveType] = useState('');
  const [draft, setDraft] = useState(null);
  const [advancedPricing, setAdvancedPricing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [newType, setNewType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const [tpls, settings] = await Promise.all([fetchQuotationTemplates(), fetchQuotationSettings()]);
      setTemplates(tpls);
      setAdvancedPricing(settings.advancedPricing);
      const first = tpls[0]?.offer_type || '';
      setActiveType((prev) => prev || first);
      const current = tpls.find((t) => t.offer_type === (activeType || first)) || tpls[0];
      setDraft(current ? { ...current } : null);
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Failed to load templates.' });
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = templates.find((x) => x.offer_type === activeType);
    setDraft(t ? { ...t } : null);
  }, [activeType, templates]);

  const saveTemplate = async () => {
    if (!draft?.offer_type) return;
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        offer_type: draft.offer_type,
        default_margin_pct: Number(draft.default_margin_pct) || 25.45,
        default_type_code: draft.default_type_code || null,
        cover_letter_text: draft.cover_letter_text || null,
        terms_text: draft.terms_text || null,
        payment_terms_text: draft.payment_terms_text || null,
        default_validity_days: Number(draft.default_validity_days) || 10,
        default_delivery_period: draft.default_delivery_period || null,
      };
      const { error } = await projectsTable('quotation_templates').upsert(payload, { onConflict: 'offer_type' });
      if (error) throw error;
      setMessage({ type: 'success', text: `Template for ${draft.offer_type} saved.` });
      const tpls = await fetchQuotationTemplates();
      setTemplates(tpls);
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not save template.' });
    } finally {
      setSaving(false);
    }
  };

  const saveAdvanced = async (enabled) => {
    setAdvancedPricing(enabled);
    try {
      await setAdvancedPricingEnabled(enabled);
      setMessage({ type: 'success', text: `Advanced pricing ${enabled ? 'enabled' : 'disabled'} org-wide.` });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not update setting.' });
      setAdvancedPricing(!enabled);
    }
  };

  const addOfferType = async (e) => {
    e.preventDefault();
    const t = newType.trim().toUpperCase();
    if (!t) return;
    setSaving(true);
    try {
      const { error } = await projectsTable('quotation_templates').insert({
        offer_type: t,
        default_margin_pct: 25.45,
        default_type_code: t,
        default_validity_days: 10,
        default_delivery_period: 'as mutually agreed',
        cover_letter_text: '',
        terms_text:
          '1. GST extra as applicable.\n2. Payment Terms: as mutually agreed.\n3. Work order cancellation is strictly not acceptable.\n4. Offer Validity : {{validityDays}} Days.\n5. Delivery period : {{deliveryPeriod}} from the date of receipt of PO',
      });
      if (error) throw error;
      setNewType('');
      const tpls = await fetchQuotationTemplates();
      setTemplates(tpls);
      setActiveType(t);
      setMessage({ type: 'success', text: `Offer type ${t} added.` });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not add offer type.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Quotation Templates</h2>
        <p className="text-sm text-slate-500 mt-1">
          Cover letter, payment/T&amp;C wording, default margin and type code — scoped by Offer Type (Excel settings
          table).
        </p>
      </div>

      {message.text && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <label className="flex items-center gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={advancedPricing}
            onChange={(e) => saveAdvanced(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Advanced pricing fields</span>
            <span className="block text-xs text-slate-500">
              When off, New Quotation shows only Basic Rate, Qty, and Margin % (Accessories/Transport/Inflation run at
              0%).
            </span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b text-xs font-semibold text-slate-600">Offer types</div>
          <ul className="divide-y">
            {templates.map((t) => (
              <li key={t.id || t.offer_type}>
                <button
                  type="button"
                  onClick={() => setActiveType(t.offer_type)}
                  className={`w-full text-left px-3 py-2.5 text-sm ${
                    activeType === t.offer_type ? 'bg-blue-50 text-blue-800 font-semibold' : 'hover:bg-slate-50'
                  }`}
                >
                  {t.offer_type}
                  <span className="block text-[10px] font-normal text-slate-400">
                    Margin {t.default_margin_pct}% · {t.default_type_code || '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addOfferType} className="p-3 border-t space-y-2">
            <input
              className={qInput}
              placeholder="New type e.g. MISC"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            />
            <button type="submit" className="w-full text-xs font-semibold py-2 rounded-lg bg-slate-800 text-white">
              Add type
            </button>
          </form>
        </div>

        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          {!draft ? (
            <p className="text-sm text-slate-500">Select or add an offer type.</p>
          ) : (
            <>
              <div className="flex justify-between items-center gap-2">
                <h3 className="font-semibold text-slate-900">Template — {draft.offer_type}</h3>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save template
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label>
                  <span className={qLabel}>Default margin %</span>
                  <input
                    type="number"
                    step="0.01"
                    className={qInput}
                    value={draft.default_margin_pct ?? 25.45}
                    onChange={(e) => setDraft({ ...draft, default_margin_pct: e.target.value })}
                  />
                </label>
                <label>
                  <span className={qLabel}>Default type code</span>
                  <input
                    className={qInput}
                    value={draft.default_type_code || ''}
                    onChange={(e) => setDraft({ ...draft, default_type_code: e.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  <span className={qLabel}>Default validity days</span>
                  <input
                    type="number"
                    className={qInput}
                    value={draft.default_validity_days ?? 10}
                    onChange={(e) => setDraft({ ...draft, default_validity_days: e.target.value })}
                  />
                </label>
                <label className="md:col-span-3">
                  <span className={qLabel}>Default delivery period</span>
                  <input
                    className={qInput}
                    value={draft.default_delivery_period || ''}
                    onChange={(e) => setDraft({ ...draft, default_delivery_period: e.target.value })}
                  />
                </label>
              </div>
              <label className="block">
                <span className={qLabel}>Cover letter paragraphs</span>
                <textarea
                  rows={8}
                  className={qInput}
                  value={draft.cover_letter_text || ''}
                  onChange={(e) => setDraft({ ...draft, cover_letter_text: e.target.value })}
                />
              </label>
              <label className="block">
                <span className={qLabel}>Terms &amp; Conditions (use {'{{validityDays}}'} / {'{{deliveryPeriod}}'})</span>
                <textarea
                  rows={10}
                  className={qInput}
                  value={draft.terms_text || ''}
                  onChange={(e) => setDraft({ ...draft, terms_text: e.target.value })}
                />
              </label>
              <label className="block">
                <span className={qLabel}>Payment terms (supply vs installation notes)</span>
                <textarea
                  rows={4}
                  className={qInput}
                  value={draft.payment_terms_text || ''}
                  onChange={(e) => setDraft({ ...draft, payment_terms_text: e.target.value })}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
