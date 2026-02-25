import React, { useState, useMemo } from 'react';
import { Bell, Clock, Hash, Receipt } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const PO_EXPIRY_DAYS = 30; // Trigger alert when WO/PO expires within this many days

const BillingNotifications = () => {
  const { wopoList, bills } = useBilling();
  const [expiryDaysFilter, setExpiryDaysFilter] = useState(PO_EXPIRY_DAYS);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // 1. PO Expiry: WO/POs expiring within the next N days
  const poExpiryAlerts = useMemo(() => {
    const list = [];
    wopoList.forEach((w) => {
      if (!w.end_date) return;
      const end = new Date(w.end_date);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= expiryDaysFilter) {
        list.push({
          oc_number: w.oc_number,
          client_name: w.client_name,
          end_date: w.end_date,
          days_left: daysLeft,
          severity: daysLeft <= 7 ? 'high' : daysLeft <= 14 ? 'medium' : 'low',
        });
      } else if (daysLeft < 0) {
        list.push({
          oc_number: w.oc_number,
          client_name: w.client_name,
          end_date: w.end_date,
          days_left: daysLeft,
          severity: 'expired',
        });
      }
    });
    return list.sort((a, b) => a.days_left - b.days_left);
  }, [wopoList, today, expiryDaysFilter]);

  // 2. Quantity Breach: Billed Qty > Work Order Qty
  const quantityBreachAlerts = useMemo(() => {
    const list = [];
    const approvedBills = bills.filter((b) => b.status === 'approved');
    approvedBills.forEach((b) => {
      const billedQty = (b.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const wo = wopoList.find((w) => w.id === b.oc_id);
      const woQty = wo?.wo_quantity;
      if (woQty != null && billedQty > woQty) {
        list.push({
          bill_number: b.bill_number,
          oc_number: b.oc_number,
          client_name: b.client_name,
          wo_quantity: woQty,
          billed_quantity: billedQty,
          breach: billedQty - woQty,
        });
      }
    });
    return list;
  }, [wopoList, bills]);

  // 3. Additional Billing: More than one approved bill per OC = additional payment
  const additionalBillingAlerts = useMemo(() => {
    const approvedBills = bills.filter((b) => b.status === 'approved');
    const countByOc = {};
    approvedBills.forEach((b) => {
      const key = String(b.oc_id ?? b.oc_number);
      countByOc[key] = (countByOc[key] || 0) + 1;
    });
    const list = [];
    Object.entries(countByOc).forEach(([key, count]) => {
      if (count > 1) {
        const ocBills = approvedBills.filter((b) => String(b.oc_id ?? b.oc_number) === key);
        list.push({
          oc_number: ocBills[0]?.oc_number,
          client_name: ocBills[0]?.client_name,
          bill_count: count,
          bills: ocBills.map((b) => b.bill_number),
        });
      }
    });
    return list;
  }, [bills]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-100 p-3 rounded-lg shrink-0">
            <Bell className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">Billing Notifications</h2>
            <p className="text-sm text-gray-600">Automated red-flag alerts: PO expiry, quantity breach, additional billing</p>
          </div>
        </div>
      </div>

      {/* 1. PO Expiry */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <h3 className="font-semibold text-gray-900">PO / Work Order Expiry</h3>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>Alert when expiring within</span>
            <select
              value={expiryDaysFilter}
              onChange={(e) => setExpiryDaysFilter(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500"
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </label>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-3">Work orders expiring within the selected period or already expired.</p>
          {poExpiryAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">No PO/WO expiring in the next {expiryDaysFilter} days.</p>
          ) : (
            <ul className="space-y-2">
              {poExpiryAlerts.map((a, i) => (
                <li
                  key={i}
                  className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${
                    a.severity === 'expired'
                      ? 'bg-red-50 border-red-200'
                      : a.severity === 'high'
                      ? 'bg-red-50 border-red-100'
                      : a.severity === 'medium'
                      ? 'bg-amber-50 border-amber-100'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div>
                    <span className="font-medium text-gray-900">{a.oc_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{a.client_name}</span>
                  </div>
                  <div className="text-sm shrink-0">
                    {a.days_left < 0 ? (
                      <span className="text-red-700 font-medium">Expired {Math.abs(a.days_left)} day(s) ago</span>
                    ) : (
                      <span className={a.severity === 'high' ? 'text-red-700 font-medium' : 'text-gray-700'}>
                        Expires in {a.days_left} day(s) · {a.end_date}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 2. Quantity Breach */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-red-50">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-red-600 shrink-0" />
            <h3 className="font-semibold text-gray-900">Quantity Breach</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Alert when Billed Qty &gt; Work Order Qty</p>
        </div>
        <div className="p-4">
          {quantityBreachAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">No quantity breach. All billed quantities are within WO limits.</p>
          ) : (
            <ul className="space-y-2">
              {quantityBreachAlerts.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-red-50 border-red-200">
                  <div>
                    <span className="font-medium text-gray-900">{a.bill_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{a.oc_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{a.client_name}</span>
                  </div>
                  <div className="text-sm text-red-700 font-medium shrink-0">
                    Billed {a.billed_quantity} &gt; WO Qty {a.wo_quantity} (breach: +{a.breach})
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 3. Additional Billing */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-blue-50">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="font-semibold text-gray-900">Additional Billing</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Alert for any additional payment (multiple bills against same WO/PO)</p>
        </div>
        <div className="p-4">
          {additionalBillingAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">No additional billing. Each OC has at most one approved bill.</p>
          ) : (
            <ul className="space-y-2">
              {additionalBillingAlerts.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-blue-50 border-blue-200">
                  <div>
                    <span className="font-medium text-gray-900">{a.oc_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{a.client_name}</span>
                  </div>
                  <div className="text-sm text-blue-800 shrink-0">
                    <span className="font-medium">{a.bill_count} bill(s)</span>
                    <span className="text-gray-600 ml-1">({a.bills?.join(', ')})</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500 mt-3">Additional payments require approval before invoice generation.</p>
        </div>
      </div>
    </div>
  );
};

export default BillingNotifications;
