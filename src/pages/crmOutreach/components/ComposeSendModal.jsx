import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Users } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import { PREVIEW_SAMPLE } from '../data/outreachConstants';
import { useCrmOutreach } from '../contexts/CrmOutreachContext';
import MergeTokenChips from './MergeTokenChips';
import { InlineAlert } from '../../adminOperations/components/AdminUi';

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

export default function ComposeSendModal() {
  const {
    clients,
    templates,
    verifiedSenders,
    composeOpen,
    composeRecipientIds,
    closeCompose,
    sendCampaign,
    sending,
    renderTokens,
    openTemplateEditor,
  } = useCrmOutreach();

  const [step, setStep] = useState('compose');
  const [templateId, setTemplateId] = useState('');
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState('');
  const bodyRef = useRef(null);

  const recipients = useMemo(
    () => clients.filter((c) => composeRecipientIds.includes(c.id)),
    [clients, composeRecipientIds]
  );

  const selectedMailbox = useMemo(
    () => verifiedSenders.find((s) => s.mail === sender),
    [verifiedSenders, sender]
  );

  const senderError = useMemo(() => {
    if (!sender) {
      return verifiedSenders.length
        ? 'Select a verified sender mailbox.'
        : 'No verified sender mailboxes. Mark a mailbox as Verified in Sender Mailboxes before sending.';
    }
    if (!selectedMailbox) {
      return 'Only verified sender mailboxes can send from the ERP.';
    }
    return '';
  }, [sender, selectedMailbox, verifiedSenders.length]);

  const loadTemplate = useCallback(
    (id) => {
      const tpl = templates.find((t) => t.id === id);
      if (!tpl) return;
      setTemplateId(tpl.id);
      if (tpl.sender && verifiedSenders.some((s) => s.mail === tpl.sender)) {
        setSender(tpl.sender);
      }
      setSubject(tpl.subject);
      setBody(tpl.body);
    },
    [templates, verifiedSenders]
  );

  useEffect(() => {
    if (!composeOpen) return;
    setStep('compose');
    setSendError('');
    const firstTpl = templates[0];
    if (firstTpl) loadTemplate(firstTpl.id);
    else {
      setTemplateId('');
      setSender(verifiedSenders[0]?.mail || '');
      setSubject('');
      setBody('');
    }
  }, [composeOpen, templates, verifiedSenders, loadTemplate]);

  const insertToken = useCallback((token) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((prev) => prev + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody((prev) => prev.slice(0, start) + token + prev.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }, [body.length]);

  const previewClient = recipients[0] || clients[0];
  const previewBody = renderTokens(body, previewClient, PREVIEW_SAMPLE);

  const handleConfirmSend = async () => {
    if (senderError) {
      setSendError(senderError);
      return;
    }

    setSendError('');
    const tpl = templates.find((t) => t.id === templateId);
    try {
      const result = await sendCampaign({
        subject,
        bodyTemplate: body,
        senderMailboxId: selectedMailbox?.id || null,
        senderMail: sender,
        templateId: templateId || null,
        templateName: tpl?.name,
        recipientClientIds: composeRecipientIds,
        previewSample: PREVIEW_SAMPLE,
      });

      const delivered = result?.delivered || 0;
      const failed = result?.failed || 0;
      const skipped = result?.skipped || 0;

      if (delivered > 0 && failed === 0) {
        toast.success(
          `Sent to ${delivered} client${delivered !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}.`
        );
        closeCompose();
      } else if (delivered > 0) {
        toast.warning(
          `Sent to ${delivered}; ${failed} failed${skipped ? `; ${skipped} skipped` : ''}. See Campaign Log for details.`
        );
        closeCompose();
      } else {
        setSendError(
          failed
            ? `No messages were delivered. ${failed} failed${skipped ? `; ${skipped} skipped` : ''}.`
            : 'No messages were delivered.'
        );
      }
    } catch (err) {
      const message = crmOutreachErrorMsg(err, 'Could not send campaign.');
      setSendError(message);
      toast.error(message);
    }
  };

  const handleSaveAsTemplate = () => {
    const draft = { sender, subject, body, category: 'General Update' };
    closeCompose();
    openTemplateEditor(null, draft);
  };

  if (!composeOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={closeCompose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="erp-card-header border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="type-card-title text-gray-900">Send Mail to Clients</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Sends from the ERP using the selected verified sender mailbox
            </p>
          </div>
          <button type="button" onClick={closeCompose} className="text-gray-500 hover:text-gray-800 text-lg leading-none px-1">
            ×
          </button>
        </div>

        <div className="erp-card-body overflow-y-auto text-sm">
          {sendError ? (
            <div className="mb-4">
              <InlineAlert tone="error">{sendError}</InlineAlert>
            </div>
          ) : null}

          <div className="flex gap-1 mb-4 bg-surface-sunken p-1 rounded-lg">
            {['compose', 'preview'].map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setStep(s)}
                className={`flex-1 text-center py-2 rounded-md text-xs font-semibold transition-colors ${
                  step === s ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {i + 1} · {s === 'compose' ? 'Compose' : 'Preview'}
              </button>
            ))}
          </div>

          {step === 'compose' ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-accent-border bg-accent-soft px-3 py-2.5 mb-4 text-xs font-medium text-accent">
                <Users className="w-4 h-4 shrink-0" />
                Sending to {recipients.length} client{recipients.length !== 1 ? 's' : ''}
              </div>

              {verifiedSenders.length === 0 ? (
                <div className="mb-4">
                  <InlineAlert tone="warning">
                    No verified sender mailboxes. Add one under Sender Mailboxes and set its status to Verified before sending.
                  </InlineAlert>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    From (Verified Sender)
                  </label>
                  <select
                    className={inputCls}
                    value={sender}
                    onChange={(e) => {
                      setSender(e.target.value);
                      setSendError('');
                    }}
                  >
                    {verifiedSenders.length === 0 ? (
                      <option value="">No verified senders</option>
                    ) : (
                      verifiedSenders.map((s) => (
                        <option key={s.id} value={s.mail}>
                          {s.mail} — {s.name}
                        </option>
                      ))
                    )}
                  </select>
                  {senderError ? (
                    <p className="text-[11px] text-red-600 mt-1">{senderError}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Template</label>
                  <select
                    className={inputCls}
                    value={templateId}
                    onChange={(e) => loadTemplate(e.target.value)}
                  >
                    {templates.length === 0 ? (
                      <option value="">No templates yet</option>
                    ) : (
                      templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="mb-3">
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
                  className={`${inputCls} min-h-[150px] py-2 resize-y leading-relaxed`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <MergeTokenChips onInsert={insertToken} />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Previewing as first recipient
                {previewClient ? ` — ${previewClient.name}` : ''}
              </label>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted border-b border-border">
                  From: {sender || '—'} · Subject: {subject}
                </div>
                <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto">
                  {previewBody}
                </div>
              </div>
              {senderError ? (
                <p className="text-[11px] text-red-600 mt-2">{senderError}</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="erp-card-header border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSaveAsTemplate}
            className="erp-btn-secondary h-8 px-3 text-xs"
            disabled={sending}
          >
            Save as New Template
          </button>
          <div className="flex gap-2">
            {step === 'compose' ? (
              <button
                type="button"
                onClick={() => setStep('preview')}
                className="erp-btn-secondary h-8 px-3 text-xs"
                disabled={!subject.trim() || !body.trim()}
              >
                Preview →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep('compose')}
                className="erp-btn-secondary h-8 px-3 text-xs"
                disabled={sending}
              >
                ← Back
              </button>
            )}
            {step === 'preview' ? (
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={sending || !subject.trim() || !body.trim() || Boolean(senderError)}
                className="erp-btn-primary h-8 px-4 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? 'Sending…' : 'Confirm & Send'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
