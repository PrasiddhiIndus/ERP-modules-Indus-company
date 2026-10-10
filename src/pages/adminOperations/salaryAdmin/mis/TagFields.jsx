import React from 'react';
import { TinyInput, TinySelect } from '../../components/AdminUi';
import { MIS_VERTICALS } from './misMetrics';

/** Payroll reporting tags for one employee. */
export default function TagFields({ value, onChange }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <label className="block text-xs text-ink-secondary">Vertical
        <TinySelect value={value.vertical_code || ''} onChange={set('vertical_code')} className="w-full mt-1">
          <option value="">From department</option>
          {MIS_VERTICALS.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
        </TinySelect>
      </label>
      <label className="block text-xs text-ink-secondary">Grade<TinyInput value={value.grade || ''} onChange={set('grade')} className="w-full mt-1" /></label>
      <label className="block text-xs text-ink-secondary">Cost centre<TinyInput value={value.cost_centre || ''} onChange={set('cost_centre')} className="w-full mt-1" /></label>
      <label className="block text-xs text-ink-secondary">Position type
        <TinySelect value={value.position_type || ''} onChange={set('position_type')} className="w-full mt-1">
          <option value="">—</option>
          <option value="new">New position</option>
          <option value="replacement">Replacement</option>
        </TinySelect>
      </label>
      <label className="block text-xs text-ink-secondary">Work state
        <TinyInput value={value.work_state || ''} onChange={set('work_state')} className="w-full mt-1" placeholder="e.g. GJ" />
      </label>
      <label className="block text-xs text-ink-secondary">Exit reason<TinyInput value={value.exit_reason || ''} onChange={set('exit_reason')} className="w-full mt-1" /></label>
    </div>
  );
}
