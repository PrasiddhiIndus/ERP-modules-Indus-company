import React, { useEffect, useState } from 'react';
import toast from '../../../../lib/toast';
import { canEditPayrollTags, fetchEmployeeTags, saveEmployeeTags } from './misDb';
import TagFields from './TagFields';

const EMPTY = { vertical_code: '', grade: '', cost_centre: '', position_type: '', work_state: '', exit_reason: '' };

/**
 * Payroll tags for one employee (used by the payroll MIS reports). Saved on its own,
 * separate from the Employee Master save.
 */
export default function EmployeePayrollTagsSection({ employeeMasterId, sectionClass, titleClass }) {
  const [value, setValue] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    canEditPayrollTags().then(async (allowed) => {
      if (!allowed) throw new Error('not allowed');
      const row = await fetchEmployeeTags(employeeMasterId);
      if (cancelled) return;
      const next = { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row?.[k] || ''])) };
      setValue(next);
      setSaved(next);
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('unavailable'); });
    return () => { cancelled = true; };
  }, [employeeMasterId]);

  const dirty = Object.keys(EMPTY).some((k) => (value[k] || '') !== (saved[k] || ''));

  const save = async () => {
    setBusy(true);
    try {
      await saveEmployeeTags(employeeMasterId, value);
      setSaved(value);
      toast.success('Payroll tags saved');
    } catch (e) {
      toast.error('Payroll tags not saved', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'ready') return null;

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={titleClass}>Payroll reporting</h3>
        <button type="button" disabled={!dirty || busy} onClick={save}
          className="h-7 px-2.5 rounded bg-accent text-white text-[11px] font-semibold disabled:opacity-40">
          {busy ? 'Saving…' : 'Save payroll tags'}
        </button>
      </div>
      <TagFields value={value} onChange={setValue} />
      <p className="text-[11px] text-gray-500">
        Used by the payroll MIS reports. Blank vertical = the department&apos;s vertical. Saved separately from the details above and applied to months locked after saving.
      </p>
    </section>
  );
}
