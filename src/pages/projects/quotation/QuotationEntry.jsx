import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { DateInput } from '../../../components/DateInput';
import { useAuth } from '../../../contexts/AuthContext';
import {
  addDaysIso,
  applyTermsPlaceholders,
  buildFilename,
  buildOfferNo,
  deriveClientCode,
  emptyQuotationForm,
  fetchQuotationSettings,
  fetchTemplateForOfferType,
  fiscalYearFromDate,
  nextJobNumber,
  normalizeQuotationPayload,
  projectsTable,
  replaceLineItems,
  revisionLabel,
} from '../../../services/quotationApi';
import {
  formatCurrency,
  qInput,
  qLabel,
  qSelect,
  todayIsoDate,
} from './quotationConstants';
import {
  calculateAllLines,
  emptyLineItem,
  emptySectionRow,
  summarizeLines,
} from './pricingEngine';
import QuotationPreview from './QuotationPreview';
import { downloadQuotationPdf } from './quotationPrint.js';
import { useQuotationDropdowns } from './useQuotationDropdowns';

const cellInput =
  'w-full min-w-[4rem] px-1.5 py-1 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400';

export default function QuotationEntry() {
  const { user, userProfile } = useAuth();
  const { valuesForKindKey, loading: dropdownLoading, error: dropdownError } = useQuotationDropdowns();
  const ownerDefault = userProfile?.username || user?.email?.split('@')[0] || '';

  const [form, setForm] = useState(() =>
    emptyQuotationForm({ owner_name: ownerDefault, prepared_by_name: ownerDefault })
  );
  const [lines, setLines] = useState(() => [
    emptySectionRow(1, '1. Supply & Installation'),
    emptyLineItem({ section_no: 1, sub_letter: 'A', description: 'Supply', margin_pct: 25.45 }),
    emptyLineItem({ section_no: 1, sub_letter: 'B', description: 'Installation Charge', margin_pct: 25.45 }),
  ]);
  const [advancedPricing, setAdvancedPricing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [offerNoTouched, setOfferNoTouched] = useState(false);
  const [jobReserved, setJobReserved] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const recalculated = useMemo(
    () => calculateAllLines(lines, { advancedPricing }),
    [lines, advancedPricing]
  );
  const summary = useMemo(() => summarizeLines(recalculated), [recalculated]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      quoted_rate: summary.grand_total,
      basic_total: summary.basic_total,
      accessories_total: summary.accessories_total,
      transport_total: summary.transport_total,
      inflation_total: summary.inflation_total,
      margin_total: summary.margin_total,
      scope: prev.subject || prev.scope,
    }));
  }, [summary]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      owner_name: prev.owner_name || ownerDefault,
      prepared_by_name: prev.prepared_by_name || ownerDefault,
    }));
  }, [ownerDefault]);

  const loadTemplate = useCallback(async (offerType) => {
    if (!offerType) return;
    try {
      const tpl = await fetchTemplateForOfferType(offerType);
      if (!tpl) return;
      setForm((prev) => ({
        ...prev,
        offer_type: offerType,
        type_code: prev.type_code || tpl.default_type_code || offerType,
        validity_days: tpl.default_validity_days ?? 10,
        delivery_period: tpl.default_delivery_period || 'as mutually agreed',
        cover_letter_text: tpl.cover_letter_text || prev.cover_letter_text,
        terms_text: applyTermsPlaceholders(tpl.terms_text || prev.terms_text, {
          validityDays: tpl.default_validity_days ?? 10,
          deliveryPeriod: tpl.default_delivery_period,
        }),
      }));
      setLines((prev) =>
        prev.map((l) =>
          l.row_type === 'section'
            ? l
            : { ...l, margin_pct: Number(tpl.default_margin_pct) || l.margin_pct || 25.45 }
        )
      );
    } catch {
      /* templates table may not exist until migration */
    }
  }, []);

  useEffect(() => {
    fetchQuotationSettings()
      .then((s) => setAdvancedPricing(s.advancedPricing))
      .catch(() => {});
    void loadTemplate('FFTG');
  }, [loadTemplate]);

  const syncOfferIdentity = async (patch = {}, forceNewJob = false) => {
    const next = { ...form, ...patch };
    const branch = next.branch_code || 'SRE';
    const clientCode = (next.client_code || deriveClientCode(next.client_name)).toUpperCase();
    const offerDate = next.offer_date || todayIsoDate();
    const fy = fiscalYearFromDate(offerDate);
    const monthTag = String(new Date(offerDate + 'T12:00:00').getMonth() + 1).padStart(2, '0');

    setReserving(true);
    try {
      let jobNo = next.job_no;
      let sequenceTag = next.sequence_tag;
      if ((!jobNo || forceNewJob) && !jobReserved) {
        const seq = await nextJobNumber(branch, offerDate);
        jobNo = seq.jobNo;
        sequenceTag = seq.sequenceTag;
        setJobReserved(true);
      } else if (jobNo) {
        sequenceTag = `${monthTag}-${jobNo}`;
      }

      const rev = Number(next.revision_no) || 0;
      const offerNo = buildOfferNo({
        branchCode: branch,
        clientCode,
        monthTag,
        jobNo,
        sequenceTag,
        typeCode: next.type_code,
        fiscalYear: fy,
        revisionNo: rev,
      });
      const filename = buildFilename({
        jobNo,
        clientCode,
        typeCode: next.type_code,
        fiscalYear: fy,
        revisionNo: rev,
      });

      setForm((prev) => ({
        ...prev,
        ...patch,
        client_code: clientCode,
        job_no: jobNo,
        sequence_tag: sequenceTag,
        fiscal_year: fy,
        revision_label: revisionLabel(rev),
        filename,
        offer_no: offerNoTouched && prev.offer_no && !forceNewJob ? prev.offer_no : offerNo,
      }));
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not reserve offer number.' });
    } finally {
      setReserving(false);
    }
  };

  const updateLine = (id, patch) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addSection = () => {
    const maxSec = lines.reduce((m, l) => Math.max(m, Number(l.section_no) || 0), 0);
    const n = maxSec + 1;
    setLines((prev) => [
      ...prev,
      emptySectionRow(n, `${n}. New section`),
      emptyLineItem({
        section_no: n,
        sub_letter: 'A',
        description: 'Supply',
        margin_pct: lines.find((l) => l.row_type === 'line')?.margin_pct ?? 25.45,
      }),
    ]);
  };

  const addSubLine = (sectionNo) => {
    const letters = lines
      .filter((l) => l.row_type === 'line' && l.section_no === sectionNo)
      .map((l) => l.sub_letter);
    const nextLetter = String.fromCharCode(65 + letters.length);
    const margin = lines.find((l) => l.row_type === 'line')?.margin_pct ?? 25.45;
    const sectionIdx = lines.findIndex(
      (l, i) =>
        l.section_no === sectionNo &&
        (i === lines.length - 1 || lines[i + 1]?.section_no !== sectionNo)
    );
    const row = emptyLineItem({
      section_no: sectionNo,
      sub_letter: nextLetter,
      description: '',
      margin_pct: margin,
    });
    setLines((prev) => {
      const copy = [...prev];
      const insertAt = sectionIdx >= 0 ? sectionIdx + 1 : copy.length;
      copy.splice(insertAt, 0, row);
      return copy;
    });
  };

  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleClear = () => {
    setOfferNoTouched(false);
    setJobReserved(false);
    setShowPreview(false);
    setForm(emptyQuotationForm({ owner_name: ownerDefault, prepared_by_name: ownerDefault }));
    setLines([
      emptySectionRow(1, '1. Supply & Installation'),
      emptyLineItem({ section_no: 1, sub_letter: 'A', description: 'Supply', margin_pct: 25.45 }),
      emptyLineItem({ section_no: 1, sub_letter: 'B', description: 'Installation Charge', margin_pct: 25.45 }),
    ]);
    setMessage({ type: '', text: '' });
    void loadTemplate('FFTG');
  };

  const saveQuotation = async (mode) => {
    setMessage({ type: '', text: '' });
    if (!form.client_name?.trim()) {
      setMessage({ type: 'error', text: 'Client Name is required.' });
      return;
    }
    if (!form.contact_person?.trim()) {
      setMessage({ type: 'error', text: 'Contact Person (To) is required.' });
      return;
    }
    if (!form.location?.trim()) {
      setMessage({ type: 'error', text: 'Location is required.' });
      return;
    }
    if (!form.contact_no && !form.email_id) {
      setMessage({ type: 'error', text: 'Contact No or Email ID is required.' });
      return;
    }
    if (!form.subject?.trim() && !form.scope?.trim()) {
      setMessage({ type: 'error', text: 'Subject is required.' });
      return;
    }
    if (!form.offer_type) {
      setMessage({ type: 'error', text: 'Offer Type is required.' });
      return;
    }
    const priced = calculateAllLines(lines, { advancedPricing });
    const hasLine = priced.some((l) => l.row_type === 'line' && (Number(l.basic_unit_rate) > 0 || Number(l.qty) > 0));
    if (!hasLine) {
      setMessage({ type: 'error', text: 'Add at least one priced line item.' });
      return;
    }

    setSubmitting(true);
    try {
      let working = { ...form };
      if (!working.job_no || !working.offer_no) {
        const branch = working.branch_code || 'SRE';
        const clientCode = (working.client_code || deriveClientCode(working.client_name)).toUpperCase();
        const seq = await nextJobNumber(branch, working.offer_date || todayIsoDate());
        working = {
          ...working,
          client_code: clientCode,
          job_no: seq.jobNo,
          sequence_tag: seq.sequenceTag,
          fiscal_year: seq.fiscalYear,
          revision_label: revisionLabel(0),
          offer_no:
            working.offer_no ||
            buildOfferNo({
              branchCode: branch,
              clientCode,
              monthTag: seq.monthTag,
              jobNo: seq.jobNo,
              sequenceTag: seq.sequenceTag,
              typeCode: working.type_code,
              fiscalYear: seq.fiscalYear,
              revisionNo: 0,
            }),
          filename: buildFilename({
            jobNo: seq.jobNo,
            clientCode,
            typeCode: working.type_code,
            fiscalYear: seq.fiscalYear,
            revisionNo: 0,
          }),
        };
      }

      const totals = summarizeLines(priced);
      const status = mode === 'send' ? 'Awaiting Client Response' : 'Draft';
      const nextFollowup =
        mode === 'send' ? addDaysIso(working.offer_date || todayIsoDate(), 7) : working.next_followup_date;

      const row = normalizeQuotationPayload({
        ...working,
        quoted_rate: totals.grand_total,
        basic_total: totals.basic_total,
        accessories_total: totals.accessories_total,
        transport_total: totals.transport_total,
        inflation_total: totals.inflation_total,
        margin_total: totals.margin_total,
        offer_status: status,
        next_followup_date: nextFollowup,
        scope: working.subject || working.scope,
        subject: working.subject || working.scope,
        terms_text: applyTermsPlaceholders(working.terms_text, {
          validityDays: working.validity_days,
          deliveryPeriod: working.delivery_period,
        }),
      });
      row.created_by = user?.id || null;
      row.owner_name = row.owner_name || ownerDefault || null;
      row.prepared_by_name = row.prepared_by_name || ownerDefault || null;

      const { data: inserted, error } = await projectsTable('quotations').insert(row).select('*').single();
      if (error) throw error;

      await replaceLineItems(inserted.id, priced);

      setMessage({
        type: 'success',
        text:
          mode === 'send'
            ? `Quotation ${row.offer_no} saved and marked Awaiting Client Response.`
            : `Quotation ${row.offer_no} saved as Draft (tracker + archive).`,
      });
      handleClear();
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not save quotation.' });
    } finally {
      setSubmitting(false);
    }
  };

  const types = valuesForKindKey('offer_type');
  const sources = valuesForKindKey('enquiry_source');
  const branches = valuesForKindKey('branch_code');
  const typeCodes = valuesForKindKey('type_code');

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setMessage({ type: '', text: '' });
    try {
      await downloadQuotationPdf();
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not generate PDF.' });
    } finally {
      setPdfBusy(false);
    }
  };

  if (showPreview) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="quotation-print-toolbar flex flex-wrap gap-2 justify-between items-center">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium"
          >
            ← Back to editor
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold disabled:opacity-60"
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => saveQuotation('draft')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </button>
          </div>
        </div>
        <QuotationPreview form={{ ...form, quoted_rate: summary.grand_total }} lines={recalculated} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      {(dropdownError || message.text) && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {message.text || dropdownError}
          {dropdownError && (
            <span className="block text-xs mt-1">
              Apply migrations <code className="text-[11px]">…quotation_master.sql</code> and{' '}
              <code className="text-[11px]">…quotation_pricing_engine.sql</code>.
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Quotation</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Offer Format pricing engine · Quoted Rate auto-totals from line items · one Save replaces PDF + Excel + Database macros
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold"
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
            <button
              type="button"
              disabled={submitting || reserving}
              onClick={() => saveQuotation('draft')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </button>
            <button
              type="button"
              disabled={submitting || reserving}
              onClick={() => saveQuotation('send')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> Save &amp; Send
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold"
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Identity */}
          <section>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Offer identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="md:col-span-2">
                <span className={qLabel}>Offer No (Ref)</span>
                <div className="flex gap-2">
                  <input
                    className={qInput}
                    value={form.offer_no}
                    onChange={(e) => {
                      setOfferNoTouched(true);
                      setField('offer_no', e.target.value);
                    }}
                    placeholder="Auto IFSPL/P/…/REV00"
                  />
                  <button
                    type="button"
                    className="shrink-0 px-3 py-2 rounded-lg border text-xs font-semibold"
                    disabled={reserving || dropdownLoading}
                    onClick={() => {
                      setOfferNoTouched(false);
                      void syncOfferIdentity({}, !jobReserved);
                    }}
                  >
                    {reserving ? '…' : 'Reserve No'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">File: {form.filename || '—'}</p>
              </label>
              <label>
                <span className={qLabel}>Date</span>
                <DateInput
                  className={qInput}
                  value={form.offer_date}
                  onChange={(v) => {
                    setField('offer_date', v);
                    if (form.job_no) void syncOfferIdentity({ offer_date: v });
                  }}
                />
              </label>
              <label>
                <span className={qLabel}>Branch</span>
                <select
                  className={qSelect}
                  value={form.branch_code}
                  onChange={(e) => {
                    setField('branch_code', e.target.value);
                    setJobReserved(false);
                  }}
                >
                  {(branches.length ? branches : ['SRE']).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={qLabel}>Client Code</span>
                <input
                  className={qInput}
                  value={form.client_code}
                  onChange={(e) => setField('client_code', e.target.value.toUpperCase())}
                />
              </label>
              <label>
                <span className={qLabel}>Type Code</span>
                <select
                  className={qSelect}
                  value={form.type_code}
                  onChange={(e) => {
                    setField('type_code', e.target.value);
                    if (form.job_no) void syncOfferIdentity({ type_code: e.target.value });
                  }}
                >
                  <option value="">(optional)</option>
                  {(typeCodes.length ? typeCodes : ['SITC', 'FFTG', 'FDS', 'DBM', 'AUD']).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={qLabel}>Offer Type</span>
                <select
                  className={qSelect}
                  value={form.offer_type}
                  onChange={(e) => {
                    setField('offer_type', e.target.value);
                    void loadTemplate(e.target.value);
                  }}
                >
                  <option value="">Select…</option>
                  {(types.length ? types : ['FFTG', 'FDS', 'DBM', 'AUD']).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={qLabel}>Job No</span>
                <input className={qInput} value={form.job_no ?? ''} readOnly />
              </label>
              <label>
                <span className={qLabel}>Revision</span>
                <input className={qInput} value={form.revision_label || 'REV00'} readOnly />
              </label>
              <label>
                <span className={qLabel}>Quoted Rate (auto)</span>
                <input className={qInput} value={formatCurrency(summary.grand_total)} readOnly />
              </label>
            </div>
          </section>

          {/* Recipient */}
          <section>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Recipient &amp; subject</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label>
                <span className={qLabel}>
                  To / Contact Person <span className="text-red-500">*</span>
                </span>
                <input
                  className={qInput}
                  value={form.contact_person}
                  onChange={(e) => setField('contact_person', e.target.value)}
                />
              </label>
              <label>
                <span className={qLabel}>
                  Client Name <span className="text-red-500">*</span>
                </span>
                <input
                  className={qInput}
                  value={form.client_name}
                  onChange={(e) => setField('client_name', e.target.value)}
                  onBlur={() => {
                    const code = form.client_code || deriveClientCode(form.client_name);
                    setField('client_code', code);
                    void syncOfferIdentity({ client_name: form.client_name, client_code: code });
                  }}
                />
              </label>
              <label>
                <span className={qLabel}>
                  Location <span className="text-red-500">*</span>
                </span>
                <input className={qInput} value={form.location} onChange={(e) => setField('location', e.target.value)} />
              </label>
              <label>
                <span className={qLabel}>Contact No</span>
                <input className={qInput} value={form.contact_no} onChange={(e) => setField('contact_no', e.target.value)} />
              </label>
              <label>
                <span className={qLabel}>Email ID</span>
                <input
                  type="email"
                  className={qInput}
                  value={form.email_id}
                  onChange={(e) => setField('email_id', e.target.value)}
                />
              </label>
              <label>
                <span className={qLabel}>Enquiry Received From</span>
                <select
                  className={qSelect}
                  value={form.enquiry_received_from}
                  onChange={(e) => setField('enquiry_received_from', e.target.value)}
                >
                  <option value="">Select…</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className={qLabel}>
                  Subject <span className="text-red-500">*</span>
                </span>
                <input
                  className={qInput}
                  value={form.subject}
                  onChange={(e) => setField('subject', e.target.value)}
                  placeholder="Scope one-liner"
                />
              </label>
            </div>
          </section>

          {/* Line items */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Line items — pricing engine</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={advancedPricing}
                    onChange={(e) => setAdvancedPricing(e.target.checked)}
                  />
                  Advanced % (Accessories / Transport / Inflation)
                </label>
                <button
                  type="button"
                  onClick={addSection}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" /> Section
                </button>
              </div>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Sr</th>
                    <th className="px-2 py-2 text-left min-w-[160px]">Description</th>
                    <th className="px-2 py-2 text-left">HSN/SAC</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-left">Unit</th>
                    <th className="px-2 py-2 text-right">Basic Rate (N)</th>
                    {advancedPricing && (
                      <>
                        <th className="px-2 py-2 text-right">Acc % (P)</th>
                        <th className="px-2 py-2 text-right">Trans % (T)</th>
                        <th className="px-2 py-2 text-right">Infl % (X)</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-right">Margin % (AB)</th>
                    <th className="px-2 py-2 text-right">Unit Rate</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-left">Make</th>
                    <th className="px-2 py-2 text-left">Remarks</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {recalculated.map((line) => (
                    <tr
                      key={line.id}
                      className={line.row_type === 'section' ? 'bg-slate-100 font-semibold' : 'border-t border-slate-100'}
                    >
                      <td className="px-2 py-1 whitespace-nowrap">
                        {line.row_type === 'section' ? line.section_no : `${line.section_no}.${line.sub_letter}`}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type === 'section' ? (
                          <input
                            className={cellInput}
                            value={line.section_label || ''}
                            onChange={(e) => updateLine(line.id, { section_label: e.target.value })}
                          />
                        ) : (
                          <input
                            className={cellInput}
                            value={line.description || ''}
                            onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            className={cellInput}
                            value={line.hsn_sac || ''}
                            onChange={(e) => updateLine(line.id, { hsn_sac: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            type="number"
                            className={`${cellInput} text-right`}
                            value={line.qty}
                            onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            className={cellInput}
                            value={line.unit || ''}
                            onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            type="number"
                            className={`${cellInput} text-right`}
                            value={line.basic_unit_rate}
                            onChange={(e) => updateLine(line.id, { basic_unit_rate: e.target.value })}
                          />
                        )}
                      </td>
                      {advancedPricing &&
                        (line.row_type === 'section' ? (
                          <>
                            <td />
                            <td />
                            <td />
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                className={`${cellInput} text-right`}
                                value={line.accessories_pct}
                                onChange={(e) => updateLine(line.id, { accessories_pct: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                className={`${cellInput} text-right`}
                                value={line.transport_pct}
                                onChange={(e) => updateLine(line.id, { transport_pct: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                className={`${cellInput} text-right`}
                                value={line.inflation_pct}
                                onChange={(e) => updateLine(line.id, { inflation_pct: e.target.value })}
                              />
                            </td>
                          </>
                        ))}
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            type="number"
                            className={`${cellInput} text-right`}
                            value={line.margin_pct}
                            onChange={(e) => updateLine(line.id, { margin_pct: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {line.row_type === 'section' ? '' : formatCurrency(line.unit_rate)}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap font-semibold">
                        {line.row_type === 'section' ? (
                          <button
                            type="button"
                            className="text-[10px] text-blue-600 font-semibold"
                            onClick={() => addSubLine(line.section_no)}
                          >
                            + sub-line
                          </button>
                        ) : (
                          formatCurrency(line.line_amount)
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            className={cellInput}
                            value={line.make || ''}
                            onChange={(e) => updateLine(line.id, { make: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {line.row_type !== 'section' && (
                          <input
                            className={cellInput}
                            value={line.remarks || ''}
                            onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <button type="button" onClick={() => removeLine(line.id)} className="p-1 text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <SummaryTile label="Basic Total" value={summary.basic_total} />
              <SummaryTile label="Accessories" value={summary.accessories_total} />
              <SummaryTile label="Transportation" value={summary.transport_total} />
              <SummaryTile label="Inflation / OH" value={summary.inflation_total} />
              <SummaryTile label="Margin" value={summary.margin_total} />
              <SummaryTile label="Grand Total" value={summary.grand_total} strong />
            </div>
          </section>

          {/* Terms */}
          <section>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Terms &amp; signature</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <label>
                <span className={qLabel}>Offer validity (days)</span>
                <input
                  type="number"
                  className={qInput}
                  value={form.validity_days}
                  onChange={(e) => setField('validity_days', e.target.value)}
                />
              </label>
              <label>
                <span className={qLabel}>Delivery period</span>
                <input
                  className={qInput}
                  value={form.delivery_period}
                  onChange={(e) => setField('delivery_period', e.target.value)}
                />
              </label>
              <label>
                <span className={qLabel}>Prepared by</span>
                <input
                  className={qInput}
                  value={form.prepared_by_name}
                  onChange={(e) => setField('prepared_by_name', e.target.value)}
                />
              </label>
              <label>
                <span className={qLabel}>Designation</span>
                <input
                  className={qInput}
                  value={form.prepared_by_designation}
                  onChange={(e) => setField('prepared_by_designation', e.target.value)}
                />
              </label>
            </div>
            <label className="block mb-3">
              <span className={qLabel}>Cover letter (from template — editable)</span>
              <textarea
                rows={5}
                className={qInput}
                value={form.cover_letter_text}
                onChange={(e) => setField('cover_letter_text', e.target.value)}
              />
            </label>
            <label className="block">
              <span className={qLabel}>Terms &amp; Conditions (editable)</span>
              <textarea
                rows={8}
                className={qInput}
                value={form.terms_text}
                onChange={(e) => setField('terms_text', e.target.value)}
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, strong }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm ${strong ? 'font-bold text-blue-900' : 'font-semibold text-slate-800'}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
