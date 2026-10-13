import React, { useEffect, useState } from 'react';
import { ClipboardList, Loader2, RotateCcw, Save, X } from 'lucide-react';
import {
  applyEnquiryDefaults,
  buildEmptyFormFromFields,
  buildEnquiryDataPayload,
  projectsErrorMsg,
  projectsTable,
} from '../../../services/projectsApi';
import { peLabel, SECTION_LABELS, todayIsoDate } from './enquiryConstants';
import { useEnquiryFieldDefinitions } from './useEnquiryFieldDefinitions';
import { useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';
import EnquiryFieldInput from './EnquiryFieldInput';
import {
  addWorkingDays,
  orderAssignmentFields,
  TARGET_BASIS_KEY,
  TARGET_WORKING_DAYS,
  withAutoTargetDate,
} from './enquiryDeadlines';

function Field({ field, children }) {
  return (
    <label className="block">
      <span className={peLabel}>
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {field.entry_hint && <p className="text-[11px] text-slate-400 mt-1">{field.entry_hint}</p>}
      {field.field_key === 'target_date' && (
        <p className="text-[11px] text-slate-400 mt-1">
          Set automatically to {TARGET_WORKING_DAYS} working days (Mon–Sat) after the assigned on date. You can change it.
        </p>
      )}
    </label>
  );
}

const SECTION_ORDER = ['main', 'contact', 'assignment'];
const FULL_WIDTH_KEYS = new Set(['scope_of_work']);

export default function EnquiryEntry({ onSaved, onClose }) {
  const {
    fields,
    entryFields,
    fieldsBySection,
    loading: fieldsLoading,
    error: fieldsError,
  } = useEnquiryFieldDefinitions();
  const { valuesForKindKey, valuesForKindId, loading: dropdownLoading, error: dropdownError } =
    useProjectsEnquiryDropdowns();

  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (entryFields.length) {
      setForm(withAutoTargetDate(buildEmptyFormFromFields(entryFields, { receiptDateDefault: todayIsoDate() })));
    }
  }, [entryFields]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const setField = (key, value) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return key === TARGET_BASIS_KEY ? withAutoTargetDate(next) : next;
    });

  const handleClear = () => {
    setForm(withAutoTargetDate(buildEmptyFormFromFields(entryFields, { receiptDateDefault: todayIsoDate() })));
    setMessage({ type: '', text: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    for (const f of entryFields.filter((x) => x.required)) {
      const v = form[f.field_key];
      if (v == null || String(v).trim() === '') {
        setMessage({ type: 'error', text: `${f.label} is required.` });
        return;
      }
    }

    setSubmitting(true);
    try {
      let data = buildEnquiryDataPayload(form, entryFields);
      data = applyEnquiryDefaults(data, fields);
      if (!data.target_date && data[TARGET_BASIS_KEY]) {
        data.target_date = addWorkingDays(data[TARGET_BASIS_KEY]) || null;
      }
      const { data: saved, error } = await projectsTable('enquiries').insert({ data }).select('serial_number').single();
      if (error) throw error;
      if (onSaved) {
        onSaved(saved);
        return;
      }
      setMessage({ type: 'success', text: 'Enquiry saved successfully.' });
      handleClear();
    } catch (err) {
      setMessage({ type: 'error', text: projectsErrorMsg(err, 'Save enquiry') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  };

  const loading = fieldsLoading || dropdownLoading;
  const configError = fieldsError || dropdownError;

  const renderField = (field) => (
    <div
      key={field.id}
      className={FULL_WIDTH_KEYS.has(field.field_key) ? 'md:col-span-2 xl:col-span-3' : ''}
    >
      <Field field={field}>
        <EnquiryFieldInput
          field={field}
          value={form[field.field_key]}
          onChange={(v) => setField(field.field_key, v)}
          disabled={loading}
          valuesForKindKey={valuesForKindKey}
          valuesForKindId={valuesForKindId}
        />
      </Field>
    </div>
  );

  return (
    <section
      className="rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
      aria-label="Add enquiry"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <div className="sticky top-0 z-10 rounded-t-xl px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Add Enquiry</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Use <strong>Input New Enquiry Data</strong> to save — Enter in a field will not register the enquiry.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting || loading || fieldsLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 shadow-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Clear Form
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="w-full p-4 sm:p-5 space-y-5">
            {configError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {configError}
              </div>
            )}

            {message.text && (
              <div
                className={`rounded-lg px-4 py-2.5 text-sm ${
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {message.text}
              </div>
            )}

            {fieldsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 sm:p-6 space-y-6">
                {SECTION_ORDER.map((sectionKey) => {
                  const sectionFields = orderAssignmentFields(fieldsBySection[sectionKey]);
                  if (!sectionFields?.length) return null;
                  const sectionTitle = SECTION_LABELS[sectionKey];

                  if (!sectionTitle) {
                    return (
                      <div key={sectionKey} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {sectionFields.map(renderField)}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={sectionKey}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 space-y-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {sectionTitle}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {sectionFields.map(renderField)}
                      </div>
                    </div>
                  );
                })}

                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Fields not on this form start with their default values (e.g. Current Status).
                </p>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
