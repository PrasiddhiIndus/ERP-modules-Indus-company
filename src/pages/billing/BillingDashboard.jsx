import React, { useState, useMemo } from 'react';
import {
  FileText,
  FileCheck,
  Receipt,
  FileDigit,
  BarChart3,
  Bell,
  Calendar,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const PO_EXPIRY_DAYS = 30;

const BillingDashboard = ({ onNavigateTab }) => {
  const { wopoList, bills } = useBilling();
  const [stats] = useState({
    totalInvoices: 0,
    pendingWOPO: 0,
    creditNotesCount: 0,
    eInvoicesGenerated: 0,
  });

  const alerts = useMemo(() => {
    const list = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    wopoList.forEach((w) => {
      if (!w.end_date) return;
      const end = new Date(w.end_date);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= PO_EXPIRY_DAYS) {
        list.push({
          type: 'po_expiry',
          severity: daysLeft <= 7 ? 'high' : 'medium',
          message: `PO/WO expires in ${daysLeft} day(s): ${w.oc_number} (${w.client_name})`,
          oc_number: w.oc_number,
        });
      }
    });
    bills.filter((b) => b.status === 'approved').forEach((b) => {
      const totalQty = (b.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const wo = wopoList.find((w) => w.id === b.oc_id);
      const woQty = wo?.wo_quantity ?? null;
      if (woQty != null && totalQty > woQty) {
        list.push({
          type: 'qty_breach',
          severity: 'high',
          message: `Billed Qty (${totalQty}) > WO Qty (${woQty}): ${b.bill_number}`,
          bill_number: b.bill_number,
        });
      }
    });
    list.push({
      type: 'additional_billing',
      severity: 'info',
      message: 'Additional billing: any extra payment requires approval before invoice generation.',
    });
    return list;
  }, [wopoList, bills]);

  const quickActionCards = [
    {
      id: 'wopo',
      icon: FileCheck,
      label: 'WO/PO Management',
      description: 'Work orders & purchase orders',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
    },
    {
      id: 'create-invoice',
      icon: FileText,
      label: 'Create Invoice',
      description: 'Create bills from approved WO/POs',
      color: 'bg-emerald-500',
      hoverColor: 'hover:bg-emerald-600',
    },
    {
      id: 'credit-notes',
      icon: Receipt,
      label: 'Credit Notes',
      description: 'Create and manage credit notes',
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
    },
    {
      id: 'e-invoice',
      icon: FileDigit,
      label: 'E-invoice',
      description: 'Generate e-invoices',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
    },
    {
      id: 'reports',
      icon: BarChart3,
      label: 'Reports',
      description: 'Billing & revenue reports',
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'Notifications',
      description: 'Billing alerts & reminders',
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
    },
  ];

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6">
      <div className="bg-white shadow rounded-lg p-4 sm:p-6 mb-6">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Billing Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">Overview of billing, WO/PO, credit notes and e-invoicing</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalInvoices}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending WO/PO</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pendingWOPO}</p>
              </div>
              <div className="bg-amber-100 p-3 rounded-lg">
                <FileCheck className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Credit Notes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.creditNotesCount}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <Receipt className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">E-invoices</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.eInvoicesGenerated}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <FileDigit className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {quickActionCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onNavigateTab && onNavigateTab(card.id)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 ${card.hoverColor} hover:border-gray-300 hover:shadow-md transition-all text-left group`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`${card.color} p-2.5 rounded-lg text-white group-hover:opacity-90`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{card.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{card.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Red-flag alerts: PO Expiry, Quantity Breach, Additional Billing */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Alerts
          </h3>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 p-3 rounded-lg border ${
                  a.severity === 'high' ? 'bg-red-50 border-red-200' : a.severity === 'medium' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === 'high' ? 'text-red-600' : a.severity === 'medium' ? 'text-amber-600' : 'text-blue-600'}`} />
                <span className="text-sm text-gray-800">{a.message}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500 text-sm">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Recent invoices and WO/PO activity will appear here once data is available.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingDashboard;
