import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, FileClock, Loader2, RotateCcw, Save, Send, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
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
  calculatedTargetDate,
  isManualTargetDateOverride,
  orderAssignmentFields,
  TARGET_BASIS_KEY,
  TARGET_WORKING_DAYS,
  withAutoTargetDate,
} from './enquiryDeadlines';
import { editErrorMessage, requestEnquiryEdit } from './enquiryEditApi';
import { canWriteEnquiryDatesOnCreate } from './enquiryRoles';
import {
  clearAllDrafts,
  clearLocalDraft,
  fetchServerDraft,
  hasDraftContent,
  isDraftTableMissing,
  loadLocalDraft,
  mergeDraftIntoForm,
  pickNewerDraft,
  sanitizeDraftForm,
  saveLocalDraft,
  saveServerDraft,
} from './enquiryDraftStore';
import { confirmDialog } from '../../../lib/dialog';
import toast from '../../../lib/toast';

const formKey = (form) => JSON.stringify(sanitizeDraftForm(form));

function formatDraftTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

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
          Set automatically to {TARGET_WORKING_DAYS} working days (Mon–Sat) after the assigned on date.
          Changing that calculated date sends it for L1 approval before it updates the Enquiry Database.
        </p>
      )}
    </label>
  );
}

const SECTION_ORDER = ['main', 'contact', 'assignment'];
const FULL_WIDTH_KEYS = new Set(['scope_of_work']);

export default function EnquiryEntry({ onSaved, onClose }) {
  const { user, userProfile } = useAuth();
  const userId = user?.id || null;
  const canSaveDatesDirect = canWriteEnquiryDatesOnCreate(userProfile);
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
  const [savingDraft, setSavingDraft] = useState(false);
  /** { savedAt, where: 'server' | 'browser', restored? } — last Save as Draft or restore. */
  const [draftInfo, setDraftInfo] = useState(null);

  /** Non-managers who change the auto-calculated Target Date must send for L1. */
  const needsTargetDateL1 = useMemo(() => {
    if (canSaveDatesDirect) return false;
    return isManualTargetDateOverride(form);
  }, [canSaveDatesDirect, form]);

  const baselineRef = useRef({});
  const initializedRef = useRef(false);
  const userEditedRef = useRef(false);
  /** formKey() of what is stored on the server ('' = nothing there). */
  const serverKeyRef = useRef('');
  const formRef = useRef(form);
  formRef.current = form;

  const buildEmptyForm = useCallback(
    () => withAutoTargetDate(buildEmptyFormFromFields(entryFields, { receiptDateDefault: todayIsoDate() })),
    [entryFields]
  );

  // Build the blank form, then restore this user's draft: browser copy at once, server copy when it arrives.
  useEffect(() => {
    if (!entryFields.length) return undefined;
    let cancelled = false;
    const empty = buildEmptyForm();
    baselineRef.current = empty;
    userEditedRef.current = false;

    const local = loadLocalDraft(userId);
    const localHasContent = Boolean(local && hasDraftContent(local.form, empty));
    if (localHasContent) {
      const restored = withAutoTargetDate(mergeDraftIntoForm(empty, local.form));
      setForm(restored);
      serverKeyRef.current = local.serverSynced ? formKey(restored) : '';
      setDraftInfo({
        restored: true,
        savedAt: local.serverSavedAt || local.updatedAt,
        where: local.serverSynced ? 'server' : 'browser',
      });
    } else {
      setForm(empty);
      serverKeyRef.current = '';
      setDraftInfo(null);
    }
    initializedRef.current = true;

    if (userId) {
      fetchServerDraft(userId)
        .then((server) => {
          if (cancelled || !server || !hasDraftContent(server.form, empty)) return;
          const merged = withAutoTargetDate(mergeDraftIntoForm(empty, server.form));
          if (pickNewerDraft(localHasContent ? local : null, server) !== server) return; // browser copy is newer
          if (userEditedRef.current) return; // never overwrite what the user is typing
          serverKeyRef.current = formKey(merged);
          setForm(merged);
          setDraftInfo({ restored: true, savedAt: server.updatedAt, where: 'server' });
        })
        .catch(() => {
          // Draft table not deployed / offline — the browser copy still covers refresh and navigation.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [entryFields, userId, buildEmptyForm]);

  const hasContent = hasDraftContent(form, baselineRef.current);
  const unsavedToServer = hasContent && formKey(form) !== serverKeyRef.current;

  // Autosave every change to this browser (per user) so refresh / switching modules loses nothing.
  useEffect(() => {
    if (!initializedRef.current || !userId) return;
    if (hasDraftContent(form, baselineRef.current)) {
      const synced = formKey(form) === serverKeyRef.current;
      saveLocalDraft(userId, form, {
        serverSynced: synced,
        serverSavedAt: synced && draftInfo?.where === 'server' ? draftInfo.savedAt : null,
      });
    } else if (userEditedRef.current) {
      clearLocalDraft(userId); // user emptied the form themselves
    }
  }, [form, userId, draftInfo]);

  // Warn before refresh / tab close while entries are not yet saved as a draft.
  useEffect(() => {
    if (!unsavedToServer || submitting) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsavedToServer, submitting]);

  const hasContentRef = useRef(false);
  hasContentRef.current = hasContent;

  /** Closing never discards entries: they stay in the per-user draft and come back on reopen. */
  const handleClose = useCallback(() => {
    if (!onClose) return;
    if (hasContentRef.current && userId) {
      // Already in the browser draft (autosave runs on every change).
      toast.info('Entries kept', 'Your unfinished enquiry will be restored when you reopen Add Enquiry.');
    }
    onClose();
  }, [onClose, userId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose && !submitting && !savingDraft) handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, handleClose, submitting, savingDraft]);

  const setField = (key, value) => {
    userEditedRef.current = true;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return key === TARGET_BASIS_KEY ? withAutoTargetDate(next) : next;
    });
  };

  const resetToBlank = () => {
    const empty = buildEmptyForm();
    baselineRef.current = empty;
    serverKeyRef.current = '';
    userEditedRef.current = false;
    setForm(empty);
    setDraftInfo(null);
  };

  const handleClear = async () => {
    if (hasContent || draftInfo) {
      const ok = await confirmDialog({
        title: 'Clear form',
        message: 'Clear all entered details? Your saved draft of this enquiry will also be deleted.',
        confirmLabel: 'Clear',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await clearAllDrafts(userId);
    resetToBlank();
    setMessage({ type: '', text: '' });
  };

  const handleSaveDraft = async () => {
    setMessage({ type: '', text: '' });
    if (!userId) {
      setMessage({ type: 'error', text: 'Your session has expired — sign in again to save a draft.' });
      return;
    }
    if (!hasContent) {
      setMessage({ type: 'error', text: 'Nothing to save yet — enter at least one detail first.' });
      return;
    }
    const snapshot = form;
    setSavingDraft(true);
    try {
      const savedAt = await saveServerDraft(userId, snapshot);
      serverKeyRef.current = formKey(snapshot);
      saveLocalDraft(userId, snapshot, { serverSynced: true, serverSavedAt: savedAt });
      setDraftInfo({ savedAt, where: 'server' });
      const when = formatDraftTime(savedAt);
      setMessage({
        type: 'success',
        text: `Draft saved${when ? ` at ${when}` : ''}. It will be restored when you reopen Add Enquiry, on any device you sign in to.`,
      });
      toast.success('Draft saved', 'Continue this enquiry any time from Add Enquiry.');
    } catch (err) {
      const local = saveLocalDraft(userId, snapshot, { serverSynced: false });
      if (local) {
        setDraftInfo({ savedAt: local.updatedAt, where: 'browser' });
        const reason = isDraftTableMissing(err)
          ? 'server drafts are not enabled yet'
          : projectsErrorMsg(err, 'Save draft');
        setMessage({
          type: 'warning',
          text: `Draft saved on this browser only (${reason}). It will be restored when you reopen Add Enquiry here.`,
        });
        toast.warning('Draft saved on this browser', 'The server copy could not be saved.');
      } else {
        setMessage({ type: 'error', text: projectsErrorMsg(err, 'Save draft') });
      }
    } finally {
      setSavingDraft(false);
    }
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
      // Completed Date is Edit-only.
      data = { ...data, completed_on: null };

      const autoTarget = data[TARGET_BASIS_KEY] ? calculatedTargetDate(data[TARGET_BASIS_KEY]) || null : null;
      if (!data.target_date && autoTarget) data.target_date = autoTarget;

      const proposedData = { ...data };
      let targetDatePendingL1 = false;

      // Non-managers: auto Target Date saves now; a change from the calculated date needs L1.
      if (!canSaveDatesDirect && isManualTargetDateOverride(proposedData) && autoTarget) {
        targetDatePendingL1 = true;
        data = { ...data, target_date: autoTarget };
      }

      const { data: saved, error } = await projectsTable('enquiries')
        .insert({ data })
        .select('id, serial_number')
        .single();
      if (error) throw error;

      if (targetDatePendingL1 && saved?.id) {
        try {
          await requestEnquiryEdit(saved.id, proposedData, null);
        } catch (reqErr) {
          setMessage({
            type: 'error',
            text: `Enquiry #${saved.serial_number} was saved with the calculated Target Date, but the change could not be sent for L1 approval: ${editErrorMessage(reqErr, projectsErrorMsg(reqErr, 'Send Target Date for approval'))}`,
          });
          await clearAllDrafts(userId);
          resetToBlank();
          if (onSaved) {
            onSaved({
              ...saved,
              datesPendingL1: false,
              notice: `Enquiry #${saved.serial_number} saved. Target Date change could not be sent for approval — ask your manager to update it.`,
            });
          }
          return;
        }
      }

      // Registered — the draft has served its purpose.
      await clearAllDrafts(userId);
      resetToBlank();

      if (onSaved) {
        onSaved(
          targetDatePendingL1
            ? {
                ...saved,
                datesPendingL1: true,
                notice: `Enquiry #${saved.serial_number} saved. The changed Target Date was sent for L1 approval and will update the Enquiry Database only after approval.`,
              }
            : saved
        );
        return;
      }
      setMessage({
        type: 'success',
        text: targetDatePendingL1
          ? `Enquiry #${saved.serial_number} saved. Changed Target Date sent for L1 approval.`
          : 'Enquiry saved successfully.',
      });
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
            <p className="text-xs text-slate-500 mt-1" aria-live="polite">
              {!hasContent
                ? 'Your entries are kept automatically while you work.'
                : unsavedToServer
                  ? 'Entries are kept on this browser automatically. Use Save as Draft to continue later from any device.'
                  : `Draft saved${draftInfo?.savedAt ? ` · ${formatDraftTime(draftInfo.savedAt)}` : ''}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting || loading || fieldsLoading}
              title={
                needsTargetDateL1
                  ? 'The changed Target Date will be sent to your L1 manager and will not update the Enquiry Database until approved'
                  : undefined
              }
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60 shadow-sm ${
                needsTargetDateL1 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : needsTargetDateL1 ? (
                <Send className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {submitting
                ? needsTargetDateL1
                  ? 'Sending…'
                  : 'Saving…'
                : needsTargetDateL1
                  ? 'Send for L1 Approval'
                  : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || submitting || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-blue-300 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60 shadow-sm"
            >
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileClock className="h-4 w-4" />}
              Save as Draft
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
                onClick={handleClose}
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

            {draftInfo?.restored && !message.text && (
              <div className="rounded-lg px-4 py-2.5 text-sm bg-blue-50 text-blue-800 border border-blue-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Restored your unfinished enquiry
                  {draftInfo.savedAt ? ` (last saved ${formatDraftTime(draftInfo.savedAt)})` : ''}. Continue where you left off.
                </span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs font-semibold text-blue-700 underline hover:text-blue-900"
                >
                  Discard draft
                </button>
              </div>
            )}

            {message.text && (
              <div
                role={message.type === 'error' ? 'alert' : 'status'}
                className={`rounded-lg px-4 py-2.5 text-sm ${
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : message.type === 'warning'
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
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
