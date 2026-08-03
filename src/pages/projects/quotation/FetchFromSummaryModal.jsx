import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { QUOTATION_BASE, formatCurrency } from './quotationConstants';
import { computeNumbering, itemTotals } from './summary/summaryHelpers';

function collectItemIdsUnderMain(main) {
  const ids = [];
  for (const child of main.childHeads || []) {
    for (const item of child.items || []) ids.push(item.id);
  }
  return ids;
}

function collectItemIdsUnderChild(child) {
  return (child.items || []).map((i) => i.id);
}

function checkboxState(ids, selected, already) {
  const actionable = ids.filter((id) => !already.has(id));
  if (!actionable.length) {
    return ids.length && ids.every((id) => already.has(id)) ? 'all-fetched' : 'empty';
  }
  const checkedCount = actionable.filter((id) => selected.has(id)).length;
  if (checkedCount === 0) return 'none';
  if (checkedCount === actionable.length) return 'all';
  return 'partial';
}

export default function FetchFromSummaryModal({
  mainHeads,
  existingLines,
  alreadyFetchedIds,
  onConfirm,
  onResync,
  onClose,
}) {
  const navigate = useNavigate();
  const numbered = useMemo(() => computeNumbering(mainHeads || []), [mainHeads]);
  const already = useMemo(
    () => (alreadyFetchedIds instanceof Set ? alreadyFetchedIds : new Set(alreadyFetchedIds || [])),
    [alreadyFetchedIds]
  );

  const allItemIds = useMemo(() => {
    const ids = [];
    for (const main of numbered) ids.push(...collectItemIdsUnderMain(main));
    return ids;
  }, [numbered]);

  const [selected, setSelected] = useState(() => new Set());
  const [expandedMains, setExpandedMains] = useState(() => new Set());
  const [expandedChildren, setExpandedChildren] = useState(() => new Set());

  useEffect(() => {
    // Default: everything checked except already-fetched
    const next = new Set();
    for (const id of allItemIds) {
      if (!already.has(id)) next.add(id);
    }
    setSelected(next);
    setExpandedMains(new Set(numbered.map((m) => m.id)));
    const childIds = new Set();
    for (const m of numbered) {
      for (const c of m.childHeads || []) childIds.add(c.id);
    }
    setExpandedChildren(childIds);
  }, [allItemIds, already, numbered]);

  const toggleIds = (ids, force) => {
    const actionable = ids.filter((id) => !already.has(id));
    if (!actionable.length) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const shouldCheck =
        force != null ? force : !actionable.every((id) => next.has(id));
      for (const id of actionable) {
        if (shouldCheck) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm?.([...selected]);
  };

  const empty = numbered.length === 0 || allItemIds.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Fetch from Summary</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select items to insert as Supply / Installation lines in the pricing grid
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {empty ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm text-slate-500 mb-3">No Summary items yet for this quotation</p>
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  navigate(`${QUOTATION_BASE}/quotation-summary`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold"
              >
                Open Summary
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {numbered.map((main) => {
                const mainIds = collectItemIdsUnderMain(main);
                const state = checkboxState(mainIds, selected, already);
                const mainOpen = expandedMains.has(main.id);
                return (
                  <div key={main.id} className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
                      <button
                        type="button"
                        className="p-0.5 text-slate-500"
                        onClick={() =>
                          setExpandedMains((prev) => {
                            const next = new Set(prev);
                            if (next.has(main.id)) next.delete(main.id);
                            else next.add(main.id);
                            return next;
                          })
                        }
                      >
                        {mainOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <input
                        type="checkbox"
                        disabled={state === 'all-fetched' || state === 'empty'}
                        checked={state === 'all' || state === 'all-fetched'}
                        ref={(el) => {
                          if (el) el.indeterminate = state === 'partial';
                        }}
                        onChange={() => toggleIds(mainIds)}
                      />
                      <span className="text-sm font-bold text-slate-900">
                        {main.displayNo}. {main.label || '(Untitled)'}
                      </span>
                    </div>
                    {mainOpen && (
                      <div className="border-t border-slate-100">
                        {(main.childHeads || []).map((child) => {
                          const childIds = collectItemIdsUnderChild(child);
                          const cState = checkboxState(childIds, selected, already);
                          const childOpen = expandedChildren.has(child.id);
                          return (
                            <div key={child.id} className="border-b border-slate-50 last:border-0">
                              <div className="flex items-center gap-2 px-3 py-2 pl-8">
                                <button
                                  type="button"
                                  className="p-0.5 text-slate-500"
                                  onClick={() =>
                                    setExpandedChildren((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(child.id)) next.delete(child.id);
                                      else next.add(child.id);
                                      return next;
                                    })
                                  }
                                >
                                  {childOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <input
                                  type="checkbox"
                                  disabled={cState === 'all-fetched' || cState === 'empty'}
                                  checked={cState === 'all' || cState === 'all-fetched'}
                                  ref={(el) => {
                                    if (el) el.indeterminate = cState === 'partial';
                                  }}
                                  onChange={() => toggleIds(childIds)}
                                />
                                <span className="text-sm font-semibold text-slate-800">
                                  {child.displayLetter}. {child.label || '(Untitled)'}
                                </span>
                              </div>
                              {childOpen && (
                                <ul className="pb-2">
                                  {(child.items || []).map((item) => {
                                    const fetched = already.has(item.id);
                                    const t = itemTotals(item);
                                    return (
                                      <li
                                        key={item.id}
                                        className="flex flex-wrap items-start gap-2 px-3 py-1.5 pl-14 text-sm"
                                      >
                                        <input
                                          type="checkbox"
                                          className="mt-1"
                                          disabled={fetched}
                                          checked={fetched || selected.has(item.id)}
                                          onChange={() => toggleIds([item.id])}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-slate-800 leading-snug">
                                            {item.description || '(No description)'}
                                          </p>
                                          <p className="text-[11px] text-slate-500 mt-0.5">
                                            Qty {item.qty ?? 0} · Supply{' '}
                                            {formatCurrency(t.supplyTotal)} · Inst.{' '}
                                            {formatCurrency(t.installationTotal)}
                                          </p>
                                          {fetched && (
                                            <p className="text-[11px] font-medium text-emerald-700 mt-0.5">
                                              Already in quotation
                                            </p>
                                          )}
                                        </div>
                                        {fetched && (
                                          <button
                                            type="button"
                                            title="Re-sync from Summary"
                                            onClick={() => onResync?.(item, child.id)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
                                          >
                                            <RefreshCw className="h-3 w-3" /> Re-sync
                                          </button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={empty || selected.size === 0}
            onClick={handleConfirm}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            Fetch {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
