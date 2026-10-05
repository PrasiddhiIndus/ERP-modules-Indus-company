import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '../../../lib/toast';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import { Modal } from '../../adminOperations/components/AdminUi';
import {
  INHOUSE_MERGE_TOKENS,
  INHOUSE_TEMPLATE_CATEGORIES,
  renderInHouseTokens,
} from '../../../../shared/crmInHouseMail.mjs';
import EmailBodyEditor from '../components/EmailBodyEditor';
import { useInHouseOutreach } from './InHouseOutreachContext';

const PREVIEW_EMPLOYEE = {
  name: 'Ravi Patel',
  email: 'ravi.patel@indusfire.com',
  team: 'Operations',
  employeeCode: 'IFS1024',
};

const renderPreview = (text) => renderInHouseTokens(text, PREVIEW_EMPLOYEE);

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

export default function InHouseTemplateEditorModal() {
  const { templates, templateEditor, closeTemplateEditor, saveTemplate, deleteTemplate } = useInHouseOutreach();
  const existing = useMemo(
    () => templates.find((t) => t.id === templateEditor.id),
    [templates, templateEditor.id]
  );

  const [name, setName] = useState('');
  const [category, setCategory] = useState(INHOUSE_TEMPLATE_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!templateEditor.open) return;
    const src = existing || templateEditor.draft || {};
    setName(existing?.name || '');
    setCategory(src.category || INHOUSE_TEMPLATE_CATEGORIES[0]);
    setSubject(src.subject || '');
    setBody(src.body || '');
    setConfirmDelete(false);
  }, [templateEditor.open, templateEditor.draft, existing]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Give the template a name.');
      return;
    }
    setSaving(true);
    try {
      await saveTemplate({ name, category, subject, body }, templateEditor.id);
      toast.success(templateEditor.id ? 'Template updated.' : 'Template saved.');
      closeTemplateEditor();
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err, 'Could not save the template.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await deleteTemplate(templateEditor.id);
      toast.success('Template deleted.');
      closeTemplateEditor();
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err, 'Could not delete the template.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={templateEditor.open}
      title={templateEditor.id ? 'Edit In-House Template' : 'New In-House Template'}
      onClose={closeTemplateEditor}
      widthClass="max-w-6xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          {templateEditor.id ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="erp-btn-secondary h-8 px-3 text-xs text-critical border-critical-border"
            >
              {confirmDelete ? 'Click again to delete' : 'Delete template'}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="erp-btn-primary h-8 px-4 text-xs disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Template name</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali holiday notice"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {INHOUSE_TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
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
            <span className="text-gray-400 font-normal ml-1">plain text or HTML/CSS · click a token to insert</span>
          </label>
          <EmailBodyEditor
            value={body}
            onChange={setBody}
            tokens={INHOUSE_MERGE_TOKENS}
            renderPreview={renderPreview}
          />
        </div>
      </div>
    </Modal>
  );
}
