import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  FilePlus,
  Loader2,
  Paperclip,
  Save,
  X,
} from 'lucide-react';
import { DateInput } from '../../../components/DateInput';
import { useAuth } from '../../../contexts/AuthContext';
import {
  addDaysIso,
  canTransitionStatus,
  createQuotationRevision,
  fetchAttachments,
  fetchFollowups,
  fetchLineItems,
  fetchRevisionChain,
  normalizeQuotationPayload,
  projectsTable,
  TERMINAL_CONVERTED,
} from '../../../services/quotationApi';
import QuotationPreview from './QuotationPreview';
import { downloadQuotationPdf } from './quotationPrint.js';
import {
  formatCurrency,
  formatDisplayDate,
  qInput,
  qLabel,
  qSelect,
  todayIsoDate,
} from './quotationConstants';
import StatusBadge from './StatusBadge';
import { useQuotationDropdowns } from './useQuotationDropdowns';
import ConvertToProjectModal from './ConvertToProjectModal';
import FollowupModal from './FollowupModal';

const DETAIL_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'revisions', label: 'Revision History' },
  { id: 'followups', label: 'Follow-up Log' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'project', label: 'Linked Project' },
];

export default function QuotationDetailDrawer({
  quotationId,
  onClose,
  onChanged,
  initialMode = 'view',
}) {
  const { user, userProfile } = useAuth();
  const { valuesForKindKey } = useQuotationDropdowns();
  const [row, setRow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState('details');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(initialMode === 'edit');
  const [revisions, setRevisions] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [showFollowup, setShowFollowup] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [attachName, setAttachName] = useState('');
  const [attachUrl, setAttachUrl] = useState('');
  const [statusRemark, setStatusRemark] = useState('');

  const load = useCallback(async () => {
    if (!quotationId) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await projectsTable('quotations').select('*').eq('id', quotationId).single();
      if (e) throw e;
      setRow(data);
      setDraft({ ...data, quoted_rate: data.quoted_rate ?? '' });
      const [revs, fups, atts, lines] = await Promise.all([
        fetchRevisionChain(data),
        fetchFollowups(quotationId),
        fetchAttachments(quotationId),
        fetchLineItems(quotationId).catch(() => []),
      ]);
      setRevisions(revs);
      setFollowups(fups);
      setAttachments(atts);
      setLineItems(lines);
    } catch (err) {
      setError(err?.message || 'Failed to load quotation.');
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const saveDetails = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setError('');
    try {
      const prevStatus = row.offer_status;
      const nextStatus = draft.offer_status;
      if (prevStatus !== nextStatus && !canTransitionStatus(prevStatus, nextStatus)) {
        throw new Error(`Cannot move from "${prevStatus}" to "${nextStatus}". Follow the offer workflow.`);
      }
      if (
        (nextStatus === 'Order Lost' || nextStatus === 'Client Has Hold Enquiry') &&
        prevStatus !== nextStatus &&
        !statusRemark.trim() &&
        !String(draft.remark || '').trim()
      ) {
        throw new Error('A remark is required when marking Lost or Hold.');
      }

      const payload = normalizeQuotationPayload(draft);
      if (statusRemark.trim() && prevStatus !== nextStatus) {
        payload.remark = [payload.remark, `[Status → ${nextStatus}] ${statusRemark.trim()}`]
          .filter(Boolean)
          .join('\n');
      }
      if (prevStatus !== nextStatus) {
        payload.status_changed_at = new Date().toISOString();
        if (nextStatus === 'Awaiting Client Response' && !payload.next_followup_date) {
          payload.next_followup_date = addDaysIso(todayIsoDate(), 7);
        }
      }

      const { error: upErr } = await projectsTable('quotations').update(payload).eq('id', draft.id);
      if (upErr) throw upErr;

      await load();
      setEditing(false);
      setStatusRemark('');
      onChanged?.();

      if (TERMINAL_CONVERTED.has(nextStatus) && prevStatus !== nextStatus && !payload.linked_project_id) {
        setShowConvert(true);
      }
    } catch (err) {
      setError(err?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const createRevision = async () => {
    if (!row) return;
    if (!window.confirm('Create a revised offer? Clones line items; previous revision marked Superseded.')) return;
    setSaving(true);
    setError('');
    try {
      const inserted = await createQuotationRevision(row, { userId: user?.id });
      onChanged?.();
      setEditing(true);
      const { data: fresh } = await projectsTable('quotations').select('*').eq('id', inserted.id).single();
      setRow(fresh);
      setDraft({ ...fresh, quoted_rate: fresh.quoted_rate ?? '' });
      const [revs, fups, atts, lines] = await Promise.all([
        fetchRevisionChain(fresh),
        fetchFollowups(fresh.id),
        fetchAttachments(fresh.id),
        fetchLineItems(fresh.id).catch(() => []),
      ]);
      setRevisions(revs);
      setFollowups(fups);
      setAttachments(atts);
      setLineItems(lines);
      setTab('revisions');
    } catch (err) {
      setError(err?.message || 'Could not create revision.');
    } finally {
      setSaving(false);
    }
  };

  const addAttachment = async (e) => {
    e.preventDefault();
    if (!attachName.trim() || !attachUrl.trim()) {
      setError('File name and URL are required.');
      return;
    }
    try {
      const { error: aErr } = await projectsTable('quotation_attachments').insert({
        quotation_id: row.id,
        file_name: attachName.trim(),
        file_url: attachUrl.trim(),
        uploaded_by: userProfile?.username || user?.email?.split('@')[0] || null,
        created_by: user?.id || null,
      });
      if (aErr) throw aErr;
      if (!row.offer_link) {
        await projectsTable('quotations').update({ offer_link: attachUrl.trim() }).eq('id', row.id);
      }
      setAttachName('');
      setAttachUrl('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not add attachment.');
    }
  };

  const types = valuesForKindKey('offer_type');
  const sources = valuesForKindKey('enquiry_source');
  const statuses = valuesForKindKey('offer_status').filter(
    (s) => s !== 'Superseded' || row?.offer_status === 'Superseded'
  );
  const selectableStatuses = row
    ? Array.from(
        new Set([row.offer_status, ...statuses.filter((s) => canTransitionStatus(row.offer_status, s))])
      )
    : statuses;

  if (!quotationId) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <button type="button" className="flex-1 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 truncate">{row?.offer_no || 'Quotation'}</h2>
              {row && <StatusBadge status={row.offer_status} />}
              {row?.revision_no > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                  {row.revision_label || `REV${String(row.revision_no).padStart(2, '0')}`}
                </span>
              )}
              {row?.linked_project_id && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Project linked
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1 truncate">{row?.client_name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 flex gap-1 border-b border-slate-100 overflow-x-auto">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : error && !row ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
              )}

              {tab === 'details' && draft && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {!editing ? (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={saveDetails}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFollowup(true)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                    >
                      Add Follow-up
                    </button>
                    {lineItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowDocPreview(true)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                      >
                        Document Preview
                      </button>
                    )}
                    {!row.superseded && row.offer_status !== 'Superseded' && (
                      <button
                        type="button"
                        onClick={createRevision}
                        disabled={saving}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 text-xs font-semibold"
                      >
                        <FilePlus className="h-3.5 w-3.5" />
                        Create Revision
                      </button>
                    )}
                    {TERMINAL_CONVERTED.has(row.offer_status) && !row.linked_project_id && (
                      <button
                        type="button"
                        onClick={() => setShowConvert(true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                      >
                        Convert to Project
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Offer No" readOnly={!editing}>
                      {editing ? (
                        <input className={qInput} value={draft.offer_no || ''} onChange={(e) => setField('offer_no', e.target.value)} />
                      ) : (
                        <ReadVal>{row.offer_no}</ReadVal>
                      )}
                    </Field>
                    <Field label="Date">
                      {editing ? (
                        <DateInput className={qInput} value={draft.offer_date || ''} onChange={(v) => setField('offer_date', v)} />
                      ) : (
                        <ReadVal>{formatDisplayDate(row.offer_date)}</ReadVal>
                      )}
                    </Field>
                    <Field label="Status">
                      {editing ? (
                        <select
                          className={qSelect}
                          value={draft.offer_status}
                          onChange={(e) => setField('offer_status', e.target.value)}
                        >
                          {selectableStatuses.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={row.offer_status} />
                      )}
                    </Field>
                    <Field label="Offer Type">
                      {editing ? (
                        <select className={qSelect} value={draft.offer_type || ''} onChange={(e) => setField('offer_type', e.target.value)}>
                          <option value="">—</option>
                          {types.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <ReadVal>{row.offer_type}</ReadVal>
                      )}
                    </Field>
                    <Field label="Client Name">
                      {editing ? (
                        <input className={qInput} value={draft.client_name || ''} onChange={(e) => setField('client_name', e.target.value)} />
                      ) : (
                        <ReadVal>{row.client_name}</ReadVal>
                      )}
                    </Field>
                    <Field label="Location">
                      {editing ? (
                        <input className={qInput} value={draft.location || ''} onChange={(e) => setField('location', e.target.value)} />
                      ) : (
                        <ReadVal>{row.location}</ReadVal>
                      )}
                    </Field>
                    <Field label="Contact Person">
                      {editing ? (
                        <input
                          className={qInput}
                          value={draft.contact_person || ''}
                          onChange={(e) => setField('contact_person', e.target.value)}
                        />
                      ) : (
                        <ReadVal>{row.contact_person}</ReadVal>
                      )}
                    </Field>
                    <Field label="Contact No">
                      {editing ? (
                        <input className={qInput} value={draft.contact_no || ''} onChange={(e) => setField('contact_no', e.target.value)} />
                      ) : (
                        <ReadVal>{row.contact_no}</ReadVal>
                      )}
                    </Field>
                    <Field label="Email ID">
                      {editing ? (
                        <input className={qInput} value={draft.email_id || ''} onChange={(e) => setField('email_id', e.target.value)} />
                      ) : (
                        <ReadVal>{row.email_id}</ReadVal>
                      )}
                    </Field>
                    <Field label="Quoted Rate">
                      {editing ? (
                        <input
                          type="number"
                          className={qInput}
                          value={draft.quoted_rate}
                          onChange={(e) => setField('quoted_rate', e.target.value)}
                        />
                      ) : (
                        <ReadVal>{formatCurrency(row.quoted_rate)}</ReadVal>
                      )}
                    </Field>
                    <Field label="Subject" className="sm:col-span-2">
                      {editing ? (
                        <input className={qInput} value={draft.subject || ''} onChange={(e) => setField('subject', e.target.value)} />
                      ) : (
                        <ReadVal>{row.subject || row.scope}</ReadVal>
                      )}
                    </Field>
                    <Field label="Enquiry Received From">
                      {editing ? (
                        <select
                          className={qSelect}
                          value={draft.enquiry_received_from || ''}
                          onChange={(e) => setField('enquiry_received_from', e.target.value)}
                        >
                          <option value="">—</option>
                          {sources.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <ReadVal>{row.enquiry_received_from}</ReadVal>
                      )}
                    </Field>
                    <Field label="Owner">
                      {editing ? (
                        <input className={qInput} value={draft.owner_name || ''} onChange={(e) => setField('owner_name', e.target.value)} />
                      ) : (
                        <ReadVal>{row.owner_name}</ReadVal>
                      )}
                    </Field>
                    <Field label="Last Followup">
                      {editing ? (
                        <DateInput
                          className={qInput}
                          value={draft.last_followup_date || ''}
                          onChange={(v) => setField('last_followup_date', v)}
                        />
                      ) : (
                        <ReadVal>{formatDisplayDate(row.last_followup_date)}</ReadVal>
                      )}
                    </Field>
                    <Field label="Next Followup">
                      {editing ? (
                        <DateInput
                          className={qInput}
                          value={draft.next_followup_date || ''}
                          onChange={(v) => setField('next_followup_date', v)}
                        />
                      ) : (
                        <ReadVal>{formatDisplayDate(row.next_followup_date)}</ReadVal>
                      )}
                    </Field>
                    <Field label="Offer Link" className="sm:col-span-2">
                      {editing ? (
                        <input className={qInput} value={draft.offer_link || ''} onChange={(e) => setField('offer_link', e.target.value)} />
                      ) : row.offer_link ? (
                        <a href={row.offer_link} target="_blank" rel="noreferrer" className="text-sm text-blue-600 inline-flex items-center gap-1">
                          Open link <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <ReadVal>—</ReadVal>
                      )}
                    </Field>
                    <Field label="Scope" className="sm:col-span-2">
                      {editing ? (
                        <textarea rows={3} className={qInput} value={draft.scope || ''} onChange={(e) => setField('scope', e.target.value)} />
                      ) : (
                        <ReadVal>{row.scope}</ReadVal>
                      )}
                    </Field>
                    <Field label="Remark" className="sm:col-span-2">
                      {editing ? (
                        <textarea rows={2} className={qInput} value={draft.remark || ''} onChange={(e) => setField('remark', e.target.value)} />
                      ) : (
                        <ReadVal>{row.remark}</ReadVal>
                      )}
                    </Field>
                    {editing &&
                      (draft.offer_status === 'Order Lost' ||
                        draft.offer_status === 'Client Has Hold Enquiry') &&
                      draft.offer_status !== row.offer_status && (
                        <Field label="Status change remark (required)" className="sm:col-span-2">
                          <textarea
                            rows={2}
                            className={qInput}
                            value={statusRemark}
                            onChange={(e) => setStatusRemark(e.target.value)}
                            placeholder="e.g. price gap, competitor, client delayed…"
                          />
                        </Field>
                      )}
                  </div>
                </div>
              )}

              {tab === 'revisions' && (
                <div className="space-y-3">
                  {revisions.length === 0 ? (
                    <p className="text-sm text-slate-500">No revisions yet.</p>
                  ) : (
                    revisions.map((r, idx) => (
                      <div
                        key={r.id}
                        className={`rounded-lg border px-4 py-3 ${r.id === row.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-sm text-slate-900">
                            <span className="text-xs text-slate-400 font-normal mr-2">{idx + 1}.</span>
                            {r.offer_no}
                          </div>
                          <StatusBadge status={r.offer_status} />
                        </div>
                        <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span>Rev {r.revision_no || 0}</span>
                          <span>{formatDisplayDate(r.offer_date)}</span>
                          <span>{formatCurrency(r.quoted_rate)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'followups' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowFollowup(true)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                  >
                    Add Follow-up
                  </button>
                  {followups.length === 0 ? (
                    <p className="text-sm text-slate-500">No follow-ups logged yet.</p>
                  ) : (
                    followups.map((f, idx) => (
                      <div key={f.id} className="rounded-lg border border-slate-200 px-4 py-3">
                        <div className="flex justify-between gap-2 text-xs text-slate-500">
                          <span>
                            <span className="text-slate-400 mr-1.5">{idx + 1}.</span>
                            {formatDisplayDate(f.followup_date)}
                          </span>
                          <span>{f.logged_by || '—'}</span>
                        </div>
                        <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{f.note}</p>
                        {f.next_followup_date && (
                          <p className="text-xs text-slate-500 mt-1">Next: {formatDisplayDate(f.next_followup_date)}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'attachments' && (
                <div className="space-y-4">
                  <form onSubmit={addAttachment} className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Paperclip className="h-4 w-4" /> Add attachment (URL)
                    </div>
                    <input
                      className={qInput}
                      placeholder="File name"
                      value={attachName}
                      onChange={(e) => setAttachName(e.target.value)}
                    />
                    <input
                      className={qInput}
                      placeholder="https://…"
                      value={attachUrl}
                      onChange={(e) => setAttachUrl(e.target.value)}
                    />
                    <button type="submit" className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold">
                      Add
                    </button>
                  </form>
                  {attachments.length === 0 ? (
                    <p className="text-sm text-slate-500">No attachments.</p>
                  ) : (
                    attachments.map((a, idx) => (
                      <a
                        key={a.id}
                        href={a.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
                      >
                        <span className="text-sm font-medium text-slate-800">
                          <span className="text-xs text-slate-400 font-normal mr-2">{idx + 1}.</span>
                          {a.file_name}
                        </span>
                        <ExternalLink className="h-4 w-4 text-slate-400" />
                      </a>
                    ))
                  )}
                </div>
              )}

              {tab === 'project' && (
                <div className="space-y-3">
                  {row.linked_project_id ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Linked project</p>
                      <p className="text-lg font-bold text-emerald-950 mt-1">{row.linked_project_name || row.linked_project_id}</p>
                      <p className="text-xs text-emerald-800 mt-2">
                        Created from this quotation. Open Projects Management when that module is ready for full project tracking.
                      </p>
                    </div>
                  ) : TERMINAL_CONVERTED.has(row.offer_status) ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-600 mb-3">Order converted — create a linked project record?</p>
                      <button
                        type="button"
                        onClick={() => setShowConvert(true)}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
                      >
                        Create Project
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No linked project. Available after Order Converted.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showFollowup && row && (
        <FollowupModal
          quotation={row}
          onClose={() => setShowFollowup(false)}
          onSaved={() => {
            load();
            onChanged?.();
          }}
        />
      )}
      {showConvert && row && (
        <ConvertToProjectModal
          quotation={row}
          onClose={() => setShowConvert(false)}
          onConverted={() => {
            load();
            onChanged?.();
          }}
        />
      )}
      {showDocPreview && row && (
        <div className="quotation-print-overlay-chrome fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-4">
          <div className="max-w-3xl mx-auto my-4">
            <div className="quotation-print-toolbar flex justify-end gap-2 mb-2">
              <button
                type="button"
                disabled={pdfBusy}
                onClick={async () => {
                  setPdfBusy(true);
                  setError('');
                  try {
                    await downloadQuotationPdf();
                  } catch (err) {
                    setError(err?.message || 'Could not generate PDF.');
                  } finally {
                    setPdfBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-60"
              >
                {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {pdfBusy ? 'Generating…' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => setShowDocPreview(false)}
                className="px-3 py-1.5 rounded-lg bg-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
            <QuotationPreview form={row} lines={lineItems} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className={qLabel}>{label}</span>
      {children}
    </label>
  );
}

function ReadVal({ children }) {
  return <div className="text-sm text-slate-900 min-h-[42px] flex items-center">{children == null || children === '' ? '—' : children}</div>;
}
