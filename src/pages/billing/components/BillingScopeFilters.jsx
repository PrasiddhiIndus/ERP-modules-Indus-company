import React from 'react';
import { ChevronDown } from 'lucide-react';
import { PO_BASIS_FILTER_ALL } from '../../../constants/poBasis';

const labelClassName = 'block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1';
const selectWrapClassName = 'relative';
const selectClassName =
  'h-8 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-800 shadow-sm outline-none transition-colors hover:border-slate-300 focus:border-red-400 focus:ring-2 focus:ring-red-100';

export default function BillingScopeFilters({
  billingVerticalFilter,
  setBillingVerticalFilter,
  billingVerticalOptions,
  billingPoBasisFilter,
  setBillingPoBasisFilter,
  billingPoBasisOptions,
  lockedToSingleVertical,
  invoiceKindFilter,
  onInvoiceKindChange,
  draftBillCount,
  className = '',
}) {
  const showBillKind = invoiceKindFilter !== undefined && onInvoiceKindChange;
  const showDraftCard = draftBillCount !== undefined && draftBillCount !== null;
  const showClear =
    !lockedToSingleVertical &&
    (billingVerticalFilter || billingPoBasisFilter !== PO_BASIS_FILTER_ALL);

  return (
    <div className={`flex flex-col xl:flex-row xl:items-end gap-3 w-full ${className}`}>
      <div className="flex flex-1 flex-wrap items-end gap-3 min-w-0">
        <div className="w-full min-w-[10rem] sm:w-[11rem] shrink-0">
          <label className={labelClassName}>Team</label>
          <div className={selectWrapClassName}>
            <select
              value={billingVerticalFilter || ''}
              onChange={(e) => setBillingVerticalFilter(e.target.value)}
              className={selectClassName}
              aria-label="Business line or team"
              title="All verticals shows every business line you can access"
            >
              <option value="">All verticals</option>
              {(billingVerticalOptions || []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        <div className="w-full min-w-[12rem] flex-1">
          <label className={labelClassName}>PO / without PO</label>
          <div className={selectWrapClassName}>
            <select
              value={billingPoBasisFilter || PO_BASIS_FILTER_ALL}
              onChange={(e) => setBillingPoBasisFilter(e.target.value)}
              className={selectClassName}
              title="Filter jobs that have a real PO paper vs jobs billed without one"
              aria-label="PO or without PO"
            >
              {(billingPoBasisOptions || []).map((o) => (
                <option key={o.id || 'all'} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {showBillKind ? (
          <div className="w-full min-w-[13rem] sm:w-[15rem] xl:w-[16rem] shrink-0">
            <label className={labelClassName}>Which bills to count</label>
            <div className={selectWrapClassName}>
              <select
                value={invoiceKindFilter}
                onChange={(e) => onInvoiceKindChange(e.target.value)}
                className={selectClassName}
                aria-label="Which bills to count"
              >
                <option value="all">Everything — real and draft bills</option>
                <option value="tax">Only real tax bills</option>
                <option value="proforma">Only draft (proforma) bills</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2 shrink-0">
        {showClear ? (
          <button
            type="button"
            onClick={() => {
              setBillingVerticalFilter('');
              setBillingPoBasisFilter(PO_BASIS_FILTER_ALL);
            }}
            className="h-8 px-2.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0 text-slate-600"
            title="Reset to all verticals and all job types"
          >
            Clear both
          </button>
        ) : null}

        {showDraftCard ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 min-h-8 shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-700 leading-tight whitespace-nowrap">
                Draft bills in period
              </p>
              <p className="text-[9px] text-slate-500 leading-tight hidden lg:block whitespace-nowrap">
                Not final GST bills — for quotes or drafts only
              </p>
            </div>
            <p className="text-xl font-bold text-slate-900 tabular-nums leading-none shrink-0">{draftBillCount}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
