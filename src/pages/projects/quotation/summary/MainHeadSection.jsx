import React, { useState } from 'react';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import { formatCurrency, qInput } from '../quotationConstants';
import { mainHeadTotal } from './summaryHelpers';
import ChildHeadSection from './ChildHeadSection';

export default function MainHeadSection({
  mainHead,
  canMoveUp,
  canMoveDown,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddChildHead,
  onUpdateChildHead,
  onMoveChildHead,
  onDeleteChildHead,
  onAddItem,
  onUpdateItem,
  onMoveItem,
  onDeleteItem,
  onCalculate,
  onExportPdf,
  onExportExcel,
  lastCalculated,
  flashTotals,
  exportBusy,
  fetchedItemIds,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totals = mainHeadTotal(mainHead);
  const children = mainHead.childHeads || [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-white border-b border-slate-100 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 text-slate-500 hover:text-slate-800"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="shrink-0 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
          {mainHead.displayNo}
        </span>
        <input
          className={`${qInput} flex-1 min-w-[14rem] font-bold text-slate-900`}
          value={mainHead.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Main head label (e.g. MECHANICAL PART)"
        />
        <div
          className={`text-xs sm:text-sm font-semibold whitespace-nowrap rounded-md px-2 py-1 transition-colors ${
            flashTotals
              ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-300'
              : 'text-slate-700'
          }`}
        >
          Supply {formatCurrency(totals.supplyTotal)}
          <span className="mx-1.5 text-slate-300 font-normal">·</span>
          Inst. {formatCurrency(totals.installationTotal)}
          {lastCalculated ? (
            <span className="ml-2 text-[10px] font-medium text-slate-500">
              Last calculated {lastCalculated}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Calculate"
            onClick={onCalculate}
            className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md"
          >
            <Calculator className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Export PDF"
            disabled={exportBusy}
            onClick={onExportPdf}
            className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md disabled:opacity-40"
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Export Excel"
            disabled={exportBusy}
            onClick={onExportExcel}
            className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" />
          </button>
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
            title="Delete main head"
            onClick={onDelete}
            className="p-1.5 text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {children.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-2">
              No child heads yet under this main head.
            </p>
          ) : (
            children.map((child, index) => (
              <ChildHeadSection
                key={child.id}
                childHead={child}
                canMoveUp={index > 0}
                canMoveDown={index < children.length - 1}
                onChange={(patch) => onUpdateChildHead(child.id, patch)}
                onMoveUp={() => onMoveChildHead(child.id, 'up')}
                onMoveDown={() => onMoveChildHead(child.id, 'down')}
                onDelete={() => onDeleteChildHead(child.id)}
                onAddItem={() => onAddItem(child.id)}
                onUpdateItem={(itemId, patch) => onUpdateItem(child.id, itemId, patch)}
                onMoveItem={(itemId, direction) => onMoveItem(child.id, itemId, direction)}
                onDeleteItem={(itemId) => onDeleteItem(child.id, itemId)}
                fetchedItemIds={fetchedItemIds}
              />
            ))
          )}

          <button
            type="button"
            onClick={onAddChildHead}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Add Child Head
          </button>
        </div>
      )}
    </div>
  );
}
