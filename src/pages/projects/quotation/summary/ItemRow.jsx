import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { formatCurrency } from '../quotationConstants';
import { itemTotals } from './summaryHelpers';

const cellInput =
  'w-full min-w-[4rem] px-1.5 py-1 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400';

export default function ItemRow({
  item,
  canMoveUp,
  canMoveDown,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  addedToQuotation = false,
}) {
  const hasNote = Boolean(String(item.note || '').trim());
  const [noteOpen, setNoteOpen] = useState(hasNote);
  const totals = itemTotals(item);

  useEffect(() => {
    if (hasNote) setNoteOpen(true);
  }, [hasNote]);

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-2 py-1.5 text-xs font-medium text-slate-600 whitespace-nowrap w-10">
        {item.srNo}
      </td>
      <td className="px-2 py-1.5 min-w-[200px]">
        <textarea
          className={`${cellInput} min-h-[2.5rem] resize-y`}
          rows={2}
          value={item.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Item description"
        />
        {addedToQuotation && (
          <span className="mt-1.5 inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 border border-emerald-200">
            Added to Quotation
          </span>
        )}
        {noteOpen || hasNote ? (
          <div className="mt-1.5">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
              Note
            </label>
            <textarea
              className={`${cellInput} min-h-[2rem] resize-y text-slate-600`}
              rows={2}
              value={item.note || ''}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="e.g. Capacity: 171 m³/hr."
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="mt-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            + Add Note
          </button>
        )}
      </td>
      <td className="px-2 py-1.5">
        <input
          className={cellInput}
          value={item.hsnCode || ''}
          onChange={(e) => onChange({ hsnCode: e.target.value })}
          placeholder="HSN"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={cellInput}
          value={item.unit || ''}
          onChange={(e) => onChange({ unit: e.target.value })}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          className={`${cellInput} text-right`}
          value={item.qty ?? ''}
          onChange={(e) => onChange({ qty: e.target.value === '' ? '' : Number(e.target.value) })}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          className={`${cellInput} text-right`}
          value={item.supplyRate ?? ''}
          onChange={(e) =>
            onChange({ supplyRate: e.target.value === '' ? '' : Number(e.target.value) })
          }
        />
      </td>
      <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap text-slate-700">
        {formatCurrency(totals.supplyTotal)}
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          className={`${cellInput} text-right`}
          value={item.installationRate ?? ''}
          onChange={(e) =>
            onChange({ installationRate: e.target.value === '' ? '' : Number(e.target.value) })
          }
        />
      </td>
      <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap text-slate-700">
        {formatCurrency(totals.installationTotal)}
      </td>
      <td className="px-2 py-1.5">
        <input
          className={cellInput}
          value={item.make || ''}
          onChange={(e) => onChange({ make: e.target.value })}
          placeholder="Make"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={cellInput}
          value={item.remarks || ''}
          onChange={(e) => onChange({ remarks: e.target.value })}
          placeholder="Remarks"
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Move up"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete item"
            onClick={onDelete}
            className="p-1 text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
