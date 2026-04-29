import React, { useMemo } from 'react';
import { Bell, Clock, FileCheck } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const PO_EXPIRY_ALERT_DAYS = 10;
const PA_MISSING_ALERT_DAYS = 5;

const BillingNotifications = () => {
  const { commercialPOs, invoices, billingVerticalFilter } = useBilling();

  const verticalNotSelected = !billingVerticalFilter;

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
          message: `PO ${po.poWoNumber || po.ocNumber} for Site ${po.siteId || po.id} is expiring in ${daysLeft} days.`,
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
          message: `Payment received for Site ${inv.siteId}, but Payment Advice is missing for 5+ days.`,
          invoiceNumber: inv.taxInvoiceNumber || inv.bill_number,
          siteId: inv.siteId,
          created_at: inv.created_at,
        });
      }
    });
    return list;
  }, [invoices]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Select a vertical to view notifications</p>
          <p className="text-sm mt-1">Choose a vertical above to load PO expiry and compliance alerts.</p>
        </div>
      ) : null}
      <div className="flex items-center space-x-3">
        <div className="bg-indigo-100 p-3 rounded-lg shrink-0">
          <Bell className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Notification Alerts</h2>
          <p className="text-sm text-gray-600">PO expiring in 10 days; Payment received but PA missing 5+ days</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">PO expiring in 10 days</h3>
        </div>
        <div className="p-4">
          {poExpiringIn10Days.length === 0 ? (
            <p className="text-sm text-gray-500">No PO expiring in the next 10 days.</p>
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
          <h3 className="font-semibold text-gray-900">Payment received – PA missing 5+ days</h3>
        </div>
        <div className="p-4">
          {paymentReceivedPaMissing.length === 0 ? (
            <p className="text-sm text-gray-500">No such cases. All paid invoices have PA or are within 5 days.</p>
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
