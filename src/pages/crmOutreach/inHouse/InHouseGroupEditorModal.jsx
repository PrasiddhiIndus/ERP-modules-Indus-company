import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '../../../lib/toast';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import { Modal } from '../../adminOperations/components/AdminUi';
import EmployeePicker from './EmployeePicker';
import { useInHouseOutreach } from './InHouseOutreachContext';

const inputCls =
  'h-9 w-full border border-slate-200 rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

export default function InHouseGroupEditorModal() {
  const { groups, employees, groupEditor, closeGroupEditor, saveGroup, deleteGroup } = useInHouseOutreach();
  const existing = useMemo(() => groups.find((g) => g.id === groupEditor.id), [groups, groupEditor.id]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!groupEditor.open) return;
    setName(existing?.name || '');
    setDescription(existing?.description || '');
    setMemberIds(new Set(existing?.memberIds || groupEditor.initialMemberIds || []));
    setConfirmDelete(false);
  }, [groupEditor.open, groupEditor.initialMemberIds, existing]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Give the group a name.');
      return;
    }
    setSaving(true);
    try {
      await saveGroup({ name, description, memberIds: [...memberIds] }, groupEditor.id);
      toast.success(groupEditor.id ? 'Group updated.' : 'Group created.');
      closeGroupEditor();
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err, 'Could not save the group.'));
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
      await deleteGroup(groupEditor.id);
      toast.success('Group deleted.');
      closeGroupEditor();
    } catch (err) {
      toast.error(crmOutreachErrorMsg(err, 'Could not delete the group.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={groupEditor.open}
      title={groupEditor.id ? 'Manage Group' : 'New Group'}
      onClose={closeGroupEditor}
      widthClass="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          {groupEditor.id ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="erp-btn-secondary h-8 px-3 text-xs text-critical border-critical-border"
            >
              {confirmDelete ? 'Click again to delete' : 'Delete group'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={closeGroupEditor} className="erp-btn-secondary h-8 px-3 text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="erp-btn-primary h-8 px-4 text-xs disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save group'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Group name</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Site supervisors – Gujarat"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description (optional)</label>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div>
          <p className="block text-xs font-semibold text-gray-700 mb-1">Members</p>
          <EmployeePicker
            employees={employees}
            selectedIds={memberIds}
            onChange={setMemberIds}
            maxHeightClass="max-h-[45vh]"
          />
        </div>
      </div>
    </Modal>
  );
}
