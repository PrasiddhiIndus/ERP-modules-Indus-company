import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Send, Users, X, XCircle } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { InlineAlert, Modal } from '../../adminOperations/components/AdminUi';
import {
  INHOUSE_MERGE_TOKENS,
  INHOUSE_SENDER_LABEL,
  renderInHouseTokens,
  usesPersonalTokens,
} from '../../../../shared/crmInHouseMail.mjs';
import MergeTokenChips from '../components/MergeTokenChips';
import EmailPreviewFrame from '../components/EmailPreviewFrame';
import { escapeTokenValues, looksLikeHtmlEmail } from '../../../../shared/emailHtml.mjs';
import { useInHouseOutreach } from './InHouseOutreachContext';
import useTokenInsert from './useTokenInsert';

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

function DeliveryNote({ personal }) {
  return (
    <p className="text-[11px] text-ink-muted mt-2">
      {personal
        ? 'Personalised mail: each employee gets their own copy with their details filled in. This takes a little longer for large lists.'
        : 'Sent at once as a single mail. Employees are added as hidden (BCC) recipients, so they do not see each other.'}
    </p>
  );
}

function ProgressView({ progress }) {
  const queued = Math.max(0, progress.total - progress.skipped);
  const processed = progress.delivered + progress.failed;
  const pct = queued ? Math.round((processed / queued) * 100) : progress.phase === 'done' ? 100 : 0;
  const failures = progress.results.filter((r) => r.status === 'Failed');
  const finished = progress.phase === 'done' || progress.phase === 'error';

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-ink">
            {progress.phase === 'starting'
              ? 'Preparing recipients…'
              : finished
                ? 'Sending finished'
                : `Sending… ${processed} of ${queued}`}
          </span>
          <span className="text-ink-muted">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-sunken overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2">
          <p className="text-lg font-semibold text-emerald-800">{progress.delivered}</p>
          <p className="text-[11px] text-emerald-900">Delivered</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-2">
          <p className="text-lg font-semibold text-red-800">{progress.failed}</p>
          <p className="text-[11px] text-red-900">Failed</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
          <p className="text-lg font-semibold text-slate-800">{progress.skipped}</p>
          <p className="text-[11px] text-slate-700">Skipped (no usable email)</p>
        </div>
      </div>

      {progress.error ? <InlineAlert tone="error">{progress.error}</InlineAlert> : null}
      {finished && progress.remaining > 0 ? (
        <InlineAlert tone="warning">
          {progress.remaining} mail{progress.remaining !== 1 ? 's were' : ' was'} not sent. Check Mail History for details.
        </InlineAlert>
      ) : null}

      {failures.length ? (
        <div>
          <p className="text-xs font-semibold text-ink mb-1">Failed recipients</p>
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-gray-100 text-xs">
            {failures.map((f, i) => (
              <li key={`${f.email}-${i}`} className="px-3 py-1.5 flex items-start gap-2">
                <XCircle className="w-3.5 h-3.5 text-critical shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="font-medium">{f.name || f.email}</span>
                  <span className="text-ink-muted"> · {f.email}</span>
                  <span className="block text-ink-secondary">{f.error}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {progress.phase === 'done' && !failures.length && progress.delivered > 0 ? (
        <p className="flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4" /> All mails were delivered to Microsoft for sending.
        </p>
      ) : null}
    </div>
  );
}

export default function InHouseComposeModal() {
  const {
    employees,
    employeesById,
    groups,
    templates,
    selectedEmployeeIds,
    setSelectedEmployeeIds,
    composeOpen,
    composeGroupIds,
    composeIncludeSelected,
    closeCompose,
    progress,
    sendMail,
    openTemplateEditor,
  } = useInHouseOutreach();

  const [step, setStep] = useState('compose');
  const [employeeIds, setEmployeeIds] = useState(() => new Set());
  const [groupIds, setGroupIds] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { bodyRef, insertToken } = useTokenInsert(body, setBody);

  useEffect(() => {
    if (!composeOpen) return;
    setStep('compose');
    setEmployeeIds(new Set(composeIncludeSelected ? selectedEmployeeIds : []));
    setGroupIds(composeGroupIds);
    setTemplateId('');
    setSubject('');
    setBody('');
    // Initialise once per open; later selection changes are handled inside the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const recipients = useMemo(() => {
    const ids = new Set(employeeIds);
    for (const gid of groupIds) {
      for (const pid of groupsById.get(gid)?.memberIds || []) ids.add(pid);
    }
    return [...ids].map((id) => employeesById.get(id)).filter(Boolean);
  }, [employeeIds, groupIds, groupsById, employeesById]);

  const loadTemplate = (id) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const personal = usesPersonalTokens(subject, body);
  const sending = progress.phase === 'starting' || progress.phase === 'sending';
  const canSend = recipients.length > 0 && subject.trim() && body.trim();

  const handleSend = async () => {
    const tpl = templates.find((t) => t.id === templateId);
    setStep('sending');
    try {
      const result = await sendMail({
        subject,
        bodyTemplate: body,
        templateId: templateId || null,
        templateName: tpl?.name,
        recipientProfileIds: [...employeeIds],
        groupIds,
      });
      if (result.phase === 'done' && result.failed === 0 && result.remaining === 0) {
        toast.success(`Sent to ${result.delivered} employee${result.delivered !== 1 ? 's' : ''}.`);
        if (composeIncludeSelected) setSelectedEmployeeIds(new Set());
      } else if (result.delivered > 0) {
        toast.warning(`Sent to ${result.delivered}; ${result.failed} failed. See Mail History for details.`);
      }
    } catch {
      // Error is shown in the progress view.
    }
  };

  const handleSaveAsTemplate = () => {
    closeCompose();
    openTemplateEditor(null, { subject, body });
  };

  const previewEmployee = recipients[0] || employees[0] || null;
  const availableGroups = groups.filter((g) => !groupIds.includes(g.id));

  const footer =
    step === 'sending' ? (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={closeCompose}
          disabled={sending}
          className="erp-btn-primary h-8 px-4 text-xs disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Done'}
        </button>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleSaveAsTemplate}
          className="erp-btn-secondary h-8 px-3 text-xs"
          disabled={!subject.trim() && !body.trim()}
        >
          Save as new template
        </button>
        <div className="flex gap-2">
          {step === 'compose' ? (
            <button
              type="button"
              onClick={() => setStep('preview')}
              className="erp-btn-secondary h-8 px-3 text-xs"
              disabled={!canSend}
            >
              Preview →
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setStep('compose')} className="erp-btn-secondary h-8 px-3 text-xs">
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="erp-btn-primary h-8 px-4 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Send to {recipients.length} employee{recipients.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
      </div>
    );

  return (
    <Modal
      open={composeOpen}
      title="Send Mail to Employees"
      onClose={sending ? () => {} : closeCompose}
      widthClass="max-w-3xl"
      footer={footer}
    >
      {step === 'sending' ? (
        <ProgressView progress={progress} />
      ) : (
        <>
          <div className="flex gap-1 mb-4 bg-surface-sunken p-1 rounded-lg">
            {['compose', 'preview'].map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => (s === 'preview' && !canSend ? null : setStep(s))}
                className={`flex-1 text-center py-2 rounded-md text-xs font-semibold transition-colors ${
                  step === s ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {i + 1} · {s === 'compose' ? 'Compose' : 'Preview'}
              </button>
            ))}
          </div>

          {step === 'compose' ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-accent-border bg-accent-soft px-3 py-2.5 text-xs text-accent">
                <div className="flex items-center gap-2 font-medium">
                  <Users className="w-4 h-4 shrink-0" />
                  Sending to {recipients.length} employee{recipients.length !== 1 ? 's' : ''}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {employeeIds.size ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white border border-accent-border px-2 py-0.5">
                      {employeeIds.size} selected employee{employeeIds.size !== 1 ? 's' : ''}
                      <button type="button" aria-label="Remove selected employees" onClick={() => setEmployeeIds(new Set())}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null}
                  {groupIds.map((gid) => (
                    <span key={gid} className="inline-flex items-center gap-1 rounded-full bg-white border border-accent-border px-2 py-0.5">
                      Group: {groupsById.get(gid)?.name || 'Unknown'}
                      <button
                        type="button"
                        aria-label="Remove group"
                        onClick={() => setGroupIds((prev) => prev.filter((id) => id !== gid))}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {availableGroups.length ? (
                    <select
                      className="h-7 border border-accent-border rounded-full px-2 text-[11px] bg-white text-ink"
                      value=""
                      onChange={(e) => e.target.value && setGroupIds((prev) => [...prev, e.target.value])}
                      aria-label="Add a group"
                    >
                      <option value="">+ Add group</option>
                      {availableGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
              {recipients.length === 0 ? (
                <InlineAlert tone="warning">
                  Add a group, or close this window and select employees on the Employees tab.
                </InlineAlert>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">From</label>
                  <div className={`${inputCls} flex items-center bg-surface-sunken text-ink-secondary`}>
                    {INHOUSE_SENDER_LABEL}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Template</label>
                  <select className={inputCls} value={templateId} onChange={(e) => loadTemplate(e.target.value)}>
                    <option value="">Blank message</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Body
                  <span className="text-gray-400 font-normal ml-1">click a token to insert</span>
                </label>
                <textarea
                  ref={bodyRef}
                  className={`${inputCls} min-h-[160px] py-2 resize-y leading-relaxed`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <MergeTokenChips tokens={INHOUSE_MERGE_TOKENS} onInsert={insertToken} />
              </div>
              <DeliveryNote personal={personal} />
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">
                {personal
                  ? `Previewing as first recipient${previewEmployee ? ` — ${previewEmployee.name}` : ''}`
                  : 'Preview — every employee receives this same mail'}
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted border-b border-border">
                  From: {INHOUSE_SENDER_LABEL} ·{' '}
                  {personal
                    ? `To: ${previewEmployee?.email || '—'}`
                    : `BCC: ${recipients.length} employee${recipients.length !== 1 ? 's' : ''}`}
                  <br />
                  Subject: {renderInHouseTokens(subject, previewEmployee)}
                </div>
                <div className="h-[360px]">
                  <EmailPreviewFrame
                    body={
                      looksLikeHtmlEmail(body)
                        ? renderInHouseTokens(body, escapeTokenValues(previewEmployee))
                        : renderInHouseTokens(body, previewEmployee)
                    }
                  />
                </div>
              </div>
              <DeliveryNote personal={personal} />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
