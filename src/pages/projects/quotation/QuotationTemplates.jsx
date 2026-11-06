import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  DEFAULT_MAKER_CLOSING,
  DEFAULT_MAKER_OPENING,
  fetchQuotationSettings,
  setMakerClosingText,
  setMakerOpeningText,
} from '../../../services/quotationApi';
import { qInput, qLabel } from './quotationConstants';

export default function QuotationTemplates() {
  const [openingText, setOpeningText] = useState(DEFAULT_MAKER_OPENING);
  const [closingText, setClosingText] = useState(DEFAULT_MAKER_CLOSING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const settings = await fetchQuotationSettings();
      setOpeningText(settings.makerOpening == null ? DEFAULT_MAKER_OPENING : settings.makerOpening);
      setClosingText(settings.makerClosing == null ? DEFAULT_MAKER_CLOSING : settings.makerClosing);
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Failed to load template.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveTemplate = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await setMakerOpeningText(openingText);
      await setMakerClosingText(closingText);
      setMessage({ type: 'success', text: 'Template text saved. New previews use this wording.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not save template.' });
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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Quotation template</h2>
          <p className="text-sm text-slate-500 mt-1">
            The opening under the subject, and the closing before Thanks &amp; regards, on every quotation preview. Line breaks are kept.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={saveTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60 shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save template
        </button>
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Opening</h3>
        <label className="block">
          <span className={qLabel}>Text under the subject</span>
          <textarea
            rows={6}
            className={qInput}
            value={openingText}
            onChange={(e) => setOpeningText(e.target.value)}
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Closing</h3>
        <label className="block">
          <span className={qLabel}>Text before Thanks &amp; regards</span>
          <textarea
            rows={6}
            className={qInput}
            value={closingText}
            onChange={(e) => setClosingText(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
