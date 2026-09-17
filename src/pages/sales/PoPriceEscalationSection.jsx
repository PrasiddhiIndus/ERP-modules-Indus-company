import React, { useMemo, useState } from 'react';
import FormDateInput from '../../components/FormDateInput';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import {
  ESCALATION_TYPE_FIXED,
  ESCALATION_TYPE_PERCENTAGE,
  buildPricingPeriods,
  emptyEscalationEvent,
  enrichEscalationScheduleForDisplay,
  generateEscalationDates,
  previewEscalation,
  readPriceEscalationHistory,
  roundMoney2,
} from '../../utils/poPriceEscalation';

function money(n) {
  if (n === '' || n == null || Number.isNaN(Number(n))) return '–';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

/**
 * Price Escalation configuration panel for Manpower/Training PO Entry.
 * Inactive when priceEscalationEnabled is false (parent still owns the Yes/No toggle).
 */
export default function PoPriceEscalationSection({
  formData,
  setFormData,
  canEdit,
  updateHistory = [],
}) {
  const [draft, setDraft] = useState(() => emptyEscalationEvent());
  const [shortcut, setShortcut] = useState('custom');
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const enriched = useMemo(
    () =>
      enrichEscalationScheduleForDisplay({
        ...formData,
        priceEscalationEnabled: true,
      }),
    [formData]
  );

  const built = useMemo(
    () =>
      buildPricingPeriods({
        ...formData,
        priceEscalationEnabled: true,
        priceEscalationSchedule: enriched,
      }),
    [formData, enriched]
  );

  const preview = useMemo(
    () =>
      previewEscalation(
        {
          ...formData,
          priceEscalationEnabled: true,
          priceEscalationSchedule: (formData.priceEscalationSchedule || []).filter(
            (e) => e.id !== draft.id
          ),
        },
        draft
      ),
    [formData, draft]
  );

  const history = useMemo(() => readPriceEscalationHistory(updateHistory), [updateHistory]);

  const nextEscalation = enriched.find((e) => e.status === 'upcoming') || null;

  const commitDraft = () => {
    if (!canEdit) return;
    const next = emptyEscalationEvent({
      ...draft,
      previousMonthlyValue: preview.currentEffectiveRate,
      newMonthlyValue: preview.newEffectiveRate,
    });
    setFormData((prev) => {
      const list = Array.isArray(prev.priceEscalationSchedule)
        ? [...prev.priceEscalationSchedule]
        : [];
      const idx = list.findIndex((e) => e.id === next.id);
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      list.sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
      return {
        ...prev,
        priceEscalationSchedule: list,
      };
    });
    setDraft(emptyEscalationEvent());
    setEditingId(null);
    setShortcut('custom');
  };

  const removeEscalation = (id) => {
    if (!canEdit) return;
    setFormData((prev) => ({
      ...prev,
      priceEscalationSchedule: (prev.priceEscalationSchedule || []).filter((e) => e.id !== id),
    }));
  };

  const applyShortcut = (mode) => {
    setShortcut(mode);
    if (mode === 'custom') return;
    const every = mode === '6m' ? 6 : 12;
    const from =
      formData.poEffectiveDate || formData.startDate || '';
    const until = formData.endDate || '';
    const dates = generateEscalationDates({ fromDate: from, untilDate: until, everyMonths: every });
    if (!dates.length) return;
    setFormData((prev) => {
      const existing = Array.isArray(prev.priceEscalationSchedule)
        ? [...prev.priceEscalationSchedule]
        : [];
      const byDate = new Set(existing.map((e) => e.effectiveDate));
      for (const d of dates) {
        if (byDate.has(d)) continue;
        existing.push(
          emptyEscalationEvent({
            effectiveDate: d,
            escalationType: ESCALATION_TYPE_PERCENTAGE,
            escalationValue: 10,
          })
        );
      }
      existing.sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
      return { ...prev, priceEscalationSchedule: existing };
    });
  };

  return (
    <div className="mt-4 border border-indigo-100 rounded-xl bg-indigo-50/40 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">Price Escalation Configuration</h5>
          <p className="text-xs text-gray-600 mt-1">
            Base pricing stays historical. Each escalation adds a new effective-dated pricing period.
            Billing uses the latest escalation where effective date ≤ invoice/service date.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-sm text-indigo-700 hover:underline"
        >
          {showHistory ? 'Hide' : 'View'} Escalation History
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Base Monthly Value</p>
          <p className="font-semibold tabular-nums">{money(formData.monthlyValue)}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">PO Effective Date</p>
          <p className="font-semibold">
            {formatDateDdMmYyyy(formData.poEffectiveDate) || '—'}
          </p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Projected Contract Value</p>
          <p className="font-semibold tabular-nums">{money(built.projectedContractValue)}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Next Escalation</p>
          <p className="font-semibold">
            {nextEscalation ? formatDateDdMmYyyy(nextEscalation.effectiveDate) : '—'}
          </p>
          <p className="text-[11px] text-gray-500">{enriched.length} escalation(s)</p>
        </div>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-600">Date shortcuts:</span>
          {[
            { id: '6m', label: 'Every 6 months' },
            { id: '12m', label: 'Every 12 months' },
            { id: 'custom', label: 'Custom' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyShortcut(opt.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                shortcut === opt.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Effective Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Previous Rate</th>
              <th className="px-3 py-2">New Rate</th>
              <th className="px-3 py-2">Status</th>
              {canEdit ? <th className="px-3 py-2">Action</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {enriched.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-3 py-4 text-gray-500 text-center">
                  No escalations yet — base pricing applies for the full PO term.
                </td>
              </tr>
            ) : (
              enriched.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{formatDateDdMmYyyy(row.effectiveDate)}</td>
                  <td className="px-3 py-2">
                    {row.escalationType === ESCALATION_TYPE_FIXED ? 'Fixed ₹' : '%'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.escalationType === ESCALATION_TYPE_FIXED
                      ? money(row.escalationValue)
                      : `${row.escalationValue}%`}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(row.previousMonthlyValue)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(row.newMonthlyValue)}</td>
                  <td className="px-3 py-2 capitalize">{row.status}</td>
                  {canEdit ? (
                    <td className="px-3 py-2 space-x-2">
                      <button
                        type="button"
                        className="text-indigo-700 hover:underline"
                        onClick={() => {
                          setDraft(emptyEscalationEvent(row));
                          setEditingId(row.id);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => removeEscalation(row.id)}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-800">
            {editingId ? 'Edit escalation' : 'Add escalation'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date</label>
              <FormDateInput
                value={draft.effectiveDate}
                onChange={(e) => setDraft((p) => ({ ...p, effectiveDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={draft.escalationType}
                onChange={(e) => setDraft((p) => ({ ...p, escalationType: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
              >
                <option value={ESCALATION_TYPE_PERCENTAGE}>Percentage Increase</option>
                <option value={ESCALATION_TYPE_FIXED}>Fixed Amount Increase</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {draft.escalationType === ESCALATION_TYPE_FIXED ? 'Amount (₹)' : 'Percent (%)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.escalationValue}
                onChange={(e) => setDraft((p) => ({ ...p, escalationValue: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
              <input
                type="text"
                value={draft.reason}
                onChange={(e) => setDraft((p) => ({ ...p, reason: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
            <p>
              Current Effective Rate:{' '}
              <span className="font-semibold tabular-nums">{money(preview.currentEffectiveRate)}</span>
            </p>
            <p>
              Escalation:{' '}
              <span className="font-semibold">
                {draft.escalationType === ESCALATION_TYPE_FIXED
                  ? `+${money(draft.escalationValue)}`
                  : `+${draft.escalationValue || 0}%`}
              </span>
            </p>
            <p>
              Effective From:{' '}
              <span className="font-semibold">
                {formatDateDdMmYyyy(preview.effectiveFrom) || '—'}
              </span>
            </p>
            <p>
              New Effective Rate:{' '}
              <span className="font-semibold tabular-nums">{money(preview.newEffectiveRate)}</span>
            </p>
            <p className="md:col-span-2">
              Previous period:{' '}
              {preview.previousPricingPeriod
                ? `${formatDateDdMmYyyy(preview.previousPricingPeriod.startDate)} → ${formatDateDdMmYyyy(preview.previousPricingPeriod.endDate)}`
                : '—'}
            </p>
            <p className="md:col-span-2">
              Projected Contract Value:{' '}
              <span className="font-semibold tabular-nums">
                {money(roundMoney2(preview.projectedContractValue))}
              </span>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={commitDraft}
              className="inline-flex items-center rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              {editingId ? 'Update Escalation' : '+ Add Escalation'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyEscalationEvent());
                  setEditingId(null);
                }}
                className="text-sm text-gray-600 hover:underline"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {built.periods.length > 0 ? (
        <div className="text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-gray-800">Pricing periods</p>
          {built.periods.map((p, i) => (
            <p key={`${p.startDate}-${i}`}>
              {formatDateDdMmYyyy(p.startDate)} → {formatDateDdMmYyyy(p.endDate)}:{' '}
              {money(p.monthlyValue)}/month
              {p.months != null ? ` × ${p.months} mo = ${money(p.periodValue)}` : ''}
            </p>
          ))}
        </div>
      ) : null}

      {showHistory ? (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold text-gray-800 mb-2">Escalation history (immutable)</p>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No saved escalation history yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={i} className="border-b border-gray-100 pb-2">
                  <span className="font-medium">{h.summary || 'Escalation saved'}</span>
                  <span className="text-gray-500 text-xs ml-2">{h.at || ''}</span>
                  {h.reason ? <p className="text-xs text-gray-600">Reason: {h.reason}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
