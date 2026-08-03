import React from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, qInput } from '../quotationConstants';
import { childHeadTotal } from './summaryHelpers';
import ItemRow from './ItemRow';

export default function ChildHeadSection({
  childHead,
  canMoveUp,
  canMoveDown,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddItem,
  onUpdateItem,
  onMoveItem,
  onDeleteItem,
  fetchedItemIds,
}) {
  const totals = childHeadTotal(childHead);
  const items = childHead.items || [];
  const fetched = fetchedItemIds instanceof Set ? fetchedItemIds : new Set(fetchedItemIds || []);

  return (
    <div className="ml-4 sm:ml-6 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-start gap-2">
        <span className="shrink-0 mt-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-800">
          {childHead.displayLetter}
        </span>
        <div className="flex-1 min-w-[12rem] space-y-1.5">
          <input
            className={`${qInput} font-semibold`}
            value={childHead.label || ''}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Child head label (e.g. PUMP HOUSE EQUIPMENT)"
          />
          <input
            className={qInput}
            value={childHead.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Optional description"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Move up"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Delete child head"
            onClick={onDelete}
            className="p-1.5 text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="pl-3 sm:pl-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Sr</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600 min-w-[160px]">
                  Description
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">HSN Code</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Unit</th>
                <th className="px-2 py-2 text-right font-semibold text-slate-600">Qty</th>
                <th className="px-2 py-2 text-right font-semibold text-slate-600">Supply Rate</th>
                <th className="px-2 py-2 text-right font-semibold text-slate-600">Supply Total</th>
                <th className="px-2 py-2 text-right font-semibold text-slate-600">Inst. Rate</th>
                <th className="px-2 py-2 text-right font-semibold text-slate-600">Inst. Total</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Make</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Remarks</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-4 text-center text-xs text-slate-400">
                    No items yet — add the first line under this child head.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    canMoveUp={index > 0}
                    canMoveDown={index < items.length - 1}
                    onChange={(patch) => onUpdateItem(item.id, patch)}
                    onMoveUp={() => onMoveItem(item.id, 'up')}
                    onMoveDown={() => onMoveItem(item.id, 'down')}
                    onDelete={() => onDeleteItem(item.id)}
                    addedToQuotation={fetched.has(item.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Hard requirement: Total row at end of each Child Head */}
        <div className="mx-2 mb-2 mt-0 border-t-2 border-slate-300 px-2 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 rounded-b-md">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Total</span>
          <div className="text-sm font-bold text-slate-900 text-right">
            Supply {formatCurrency(totals.supplyTotal)}
            <span className="mx-2 text-slate-300 font-normal">·</span>
            Installation {formatCurrency(totals.installationTotal)}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add Item
        </button>
      </div>
    </div>
  );
}
