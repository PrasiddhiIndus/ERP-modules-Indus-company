import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from '../../../lib/toast';
import { useCrmOutreach } from '../contexts/CrmOutreachContext';
import { TEMPLATE_CATEGORIES } from '../data/outreachConstants';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import MergeTokenChips from './MergeTokenChips';

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

export default function TemplateEditorModal() {
  const {
    templates,
    activeSenders,
    templateEditorOpen,
    editingTemplateId,
    templateDraft,
    closeTemplateEditor,
    saveTemplate,
    deleteTemplate,
  } = useCrmOutreach();

  const existing = useMemo(
    () => templates.find((t) => t.id === editingTemplateId),
    [templates, editingTemplateId]
  );

  const [name, setName] = useState('');
  const [category, setCategory] = useState(TEMPLATE_CATEGORIES[0]);
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const bodyRef = useRef(null);

  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!templateEditorOpen) return;
    if (templateDraft && !editingTemplateId) {
      setName('');
      setCategory(templateDraft.category || TEMPLATE_CATEGORIES[3]);
      setSender(templateDraft.sender || activeSenders[0]?.mail || '');
      setSubject(templateDraft.subject || '');
      setBody(templateDraft.body || '');
      return;
    }
    setName(existing?.name || '');
    setCategory(existing?.category || TEMPLATE_CATEGORIES[0]);
    setSender(existing?.sender || activeSenders[0]?.mail || '');
    setSubject(existing?.subject || '');
    setBody(existing?.body || '');
  }, [templateEditorOpen, existing, activeSenders, templateDraft, editingTemplateId]);

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

  if (!templateEditorOpen) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the template a name.');
      return;
    }
    setSaving(true);
    try {
      await saveTemplate({ name: trimmed, category, sender, subject, body }, editingTemplateId);
      toast.success(editingTemplateId ? 'Template updated.' : 'Template saved.');
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTemplateId) return;
    setSaving(true);
    try {
      await deleteTemplate(editingTemplateId);
      toast.success('Template removed.');
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
        onClick={closeTemplateEditor}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="erp-card-header border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="type-card-title text-gray-900">
              {editingTemplateId ? 'Edit Template' : 'New Template'}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">Templates can be reused across future campaigns</p>
          </div>
          <button type="button" onClick={closeTemplateEditor} className="text-gray-500 hover:text-gray-800 text-lg leading-none px-1">
            ×
          </button>
        </div>

        <div className="erp-card-body overflow-y-auto text-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Template Name</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fire Expo 2026 Invite"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Default Sender
              <span className="text-gray-400 font-normal ml-1">from Sender Mailboxes</span>
            </label>
            <select className={inputCls} value={sender} onChange={(e) => setSender(e.target.value)}>
              {activeSenders.length === 0 ? (
                <option value="">No active sender configured</option>
              ) : (
                activeSenders.map((s) => (
                  <option key={s.id} value={s.mail}>
                    {s.mail} — {s.name}
                  </option>
                ))
              )}
            </select>
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
              className={`${inputCls} min-h-[150px] py-2 resize-y leading-relaxed`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <MergeTokenChips onInsert={insertToken} />
          </div>
        </div>

        <div className="erp-card-header border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between gap-2">
          {editingTemplateId ? (
            <button
              type="button"
              onClick={handleDelete}
              className="erp-btn-secondary h-8 px-3 text-xs text-critical border-critical-border"
            >
              Delete Template
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={handleSave} disabled={saving} className="erp-btn-primary h-8 px-4 text-xs disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
