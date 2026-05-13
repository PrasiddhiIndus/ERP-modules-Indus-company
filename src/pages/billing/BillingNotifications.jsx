import React, { useMemo } from 'react';
import { Bell, Clock, FileCheck, CalendarDays } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import {
  rollupMainPoBilling,
  resolveContractForBillingParentPo,
} from '../../utils/billingInvoiceRollup';

const PO_EXPIRY_ALERT_DAYS = 10;
const PA_MISSING_ALERT_DAYS = 5;
/** Show POs whose computed next billing date falls within this many days (includes overdue). */
const NEXT_BILLING_ALERT_DAYS = 14;

const BillingNotifications = () => {
  const {
    commercialPOs,
    commercialPOsAllModules,
    invoices,
    invoicesAll,
    billingVerticalFilter,
    billingPoBasisFilter,
  } = useBilling();

  const verticalNotSelected = !billingVerticalFilter;
  const billingPoBasisLabel =
    billingPoBasisFilter === 'with_po'
      ? 'With PO only'
      : billingPoBasisFilter === 'without_po'
        ? 'Without PO only'
        : 'All — With PO & Without PO';

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const poExpiringIn10Days = useMemo(() => {
    const list = [];
    (commercialPOs || []).forEach((po) => {
      const endDate = po.endDate || po.end_date;
      if (!endDate) return;
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= PO_EXPIRY_ALERT_DAYS) {
        list.push({
          message: `Job ${po.poWoNumber || po.ocNumber} (${po.siteId ? `site ${po.siteId}` : 'no site'}) ends in ${daysLeft} day(s) — check renewal.`,
          ocNumber: po.ocNumber,
          siteId: po.siteId,
          endDate,
          daysLeft,
        });
      }
    });
    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [commercialPOs, today]);

  const paymentReceivedPaMissing = useMemo(() => {
    const list = [];
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - PA_MISSING_ALERT_DAYS);
    (invoices || []).forEach((inv) => {
      if (inv.paymentStatus !== true) return;
      if (inv.paStatus === 'Received') return;
      const created = inv.created_at ? new Date(inv.created_at) : null;
      if (created && created < cutoff) {
        list.push({
          message: `Client paid (site ${inv.siteId || '—'}) but payment proof paper is still missing after 5 days.`,
          invoiceNumber: inv.taxInvoiceNumber || inv.bill_number,
          siteId: inv.siteId,
          created_at: inv.created_at,
        });
      }
    });
    return list;
  }, [invoices, today]);

  /** Next billing window: last tax invoice date + PO billing cycle (days). */
  const upcomingBillingCycles = useMemo(() => {
    const invSrc = invoicesAll?.length ? invoicesAll : invoices;
    const allPosForChildren = commercialPOsAllModules?.length ? commercialPOsAllModules : commercialPOs;
    const list = [];
    (commercialPOs || []).forEach((po) => {
      if (po.isSupplementary) return;
      const { contract, poQty } = resolveContractForBillingParentPo(po);
      const roll = rollupMainPoBilling(po, allPosForChildren, invSrc, contract, poQty);
      if (!roll.nextBillingDate) return;
      const next = new Date(roll.nextBillingDate);
      if (Number.isNaN(next.getTime())) return;
      next.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
      if (daysUntil <= NEXT_BILLING_ALERT_DAYS) {
        list.push({
          poWo: po.poWoNumber || po.po_wo_number || '–',
          oc: po.ocNumber || po.oc_number || '–',
          siteId: po.siteId || po.site_id || '',
          locationName: po.locationName || po.location_name || '',
          nextBillingDate: roll.nextBillingDate,
          lastInvoiceDate: roll.lastInvoiceDate,
          daysUntil,
          cycleDays: roll.billingCycleDays,
        });
      }
    });
    return list.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [commercialPOs, commercialPOsAllModules, invoices, invoicesAll, today]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Pick a team first</p>
          <p className="text-sm mt-1">Choose who you bill up top — then you’ll see reminders about dates and money.</p>
        </div>
      ) : null}
      <div className="flex items-center space-x-3">
        <div className="bg-indigo-100 p-3 rounded-lg shrink-0">
          <Bell className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Reminders</h2>
          <p className="text-sm text-gray-600">
            Three simple checks: contract ending soon · time to send the next bill · client paid but proof missing.
          </p>
          {!verticalNotSelected ? (
            <p className="text-xs text-slate-600 mt-1">
              Job-type filter (top): <strong>{billingPoBasisLabel}</strong>
            </p>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-sky-50 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-sky-700" />
          <div>
            <h3 className="font-semibold text-gray-900">When to send the next bill</h3>
            <p className="text-xs text-gray-600">
              We take your <strong>last real bill date</strong> and add the <strong>days written on the job card</strong>.
              Shows jobs due in the next {NEXT_BILLING_ALERT_DAYS} days or already late.
            </p>
          </div>
        </div>
        <div className="p-4">
          {upcomingBillingCycles.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing due soon — or no tax bill was raised before, so we cannot guess the next date yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {upcomingBillingCycles.map((a, i) => (
                <li
                  key={`${a.oc}-${a.poWo}-${i}`}
                  className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-3 rounded-lg border ${
                    a.daysUntil <= 0 ? 'bg-rose-50 border-rose-200' : 'bg-sky-50 border-sky-200'
                  }`}
                >
                  <CalendarDays className={`w-4 h-4 shrink-0 sm:mt-0.5 ${a.daysUntil <= 0 ? 'text-rose-700' : 'text-sky-700'}`} />
                  <span className="text-sm text-gray-800">
                    <span className="font-mono font-semibold">{a.oc}</span> · PO/WO {a.poWo}
                    {a.siteId ? (
                      <span className="text-gray-600">
                        {' '}
                        · Site {a.siteId}
                        {a.locationName ? ` — ${a.locationName}` : ''}
                      </span>
                    ) : null}
                    . Send next bill by:{' '}
                    <strong>
                      {a.nextBillingDate
                        ? new Date(a.nextBillingDate).toLocaleDateString('en-IN')
                        : '–'}
                    </strong>{' '}
                    ({a.daysUntil <= 0 ? `${Math.abs(a.daysUntil)} day(s) late` : `in ${a.daysUntil} day(s)`}; every{' '}
                    {a.cycleDays} days
                    {a.lastInvoiceDate ? ` · last bill ${new Date(a.lastInvoiceDate).toLocaleDateString('en-IN')}` : ''}
                    ).
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Contract ending in 10 days</h3>
        </div>
        <div className="p-4">
          {poExpiringIn10Days.length === 0 ? (
            <p className="text-sm text-gray-500">No contract ending in the next 10 days.</p>
          ) : (
            <ul className="space-y-2">
              {poExpiringIn10Days.map((a, i) => (
                <li key={i} className="flex items-center gap-2 p-3 rounded-lg border bg-amber-50 border-amber-200">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-sm text-gray-800">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-red-50 flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-red-600" />
          <h3 className="font-semibold text-gray-900">Paid — but proof missing 5+ days</h3>
        </div>
        <div className="p-4">
          {paymentReceivedPaMissing.length === 0 ? (
            <p className="text-sm text-gray-500">All good — either proof is in or payment just arrived.</p>
          ) : (
            <ul className="space-y-2">
              {paymentReceivedPaMissing.map((a, i) => (
                <li key={i} className="flex items-center gap-2 p-3 rounded-lg border bg-red-50 border-red-200">
                  <FileCheck className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="text-sm text-gray-800">{a.message}</span>
                  <span className="text-xs text-gray-500">({a.invoiceNumber})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingNotifications;
