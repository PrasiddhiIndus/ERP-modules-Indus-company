import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Plus,
  Send,
  CheckCircle,
  XCircle,
  Receipt,
  Paperclip,
  Lock,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const BILLING_TEMPLATES = ['Monthly Billing', 'Daily Billing', 'Lumpsum Billing'];
const BILLING_METHODS = ['Per Day', 'Monthly', 'Lump Sum'];

const getFinancialYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y}`;
  return `${y - 1}`;
};

const generateBillNumber = (sequence) => {
  const y = getFinancialYear();
  const seq = String(sequence).padStart(4, '0');
  return `INV-${y}-${seq}`;
};

const CreateInvoice = () => {
  const { wopoList, bills, setBills, billingHistory, setBillingHistory } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [ocNumberSearch, setOcNumberSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedWopo, setSelectedWopo] = useState(null);
  const [billingMethod, setBillingMethod] = useState('');
  const [billItems, setBillItems] = useState([]);
  const [billNumber] = useState(() => generateBillNumber((bills?.length || 0) + 1));
  const [attachments, setAttachments] = useState([]);

  const approvedWopo = useMemo(
    () => wopoList.filter((w) => w.approval_status === 'approved'),
    [wopoList]
  );

  const approvedBillOcIds = useMemo(
    () => new Set(bills.filter((b) => b.status === 'approved').map((b) => b.oc_id)),
    [bills]
  );

  const pendingForInvoicing = useMemo(
    () => approvedWopo.filter((w) => !approvedBillOcIds.has(w.id)),
    [approvedWopo, approvedBillOcIds]
  );

  const pendingByTemplate = useMemo(() => {
    const counts = { 'Monthly Billing': 0, 'Daily Billing': 0, 'Lumpsum Billing': 0 };
    pendingForInvoicing.forEach((w) => {
      const t = w.billing_template || '';
      if (counts[t] !== undefined) counts[t]++;
    });
    return counts;
  }, [pendingForInvoicing]);

  const filteredPending = useMemo(() => {
    if (!searchTerm.trim()) return pendingForInvoicing;
    const s = searchTerm.toLowerCase();
    return pendingForInvoicing.filter(
      (w) =>
        w.oc_number?.toLowerCase().includes(s) ||
        w.wo_number?.toLowerCase().includes(s) ||
        w.client_name?.toLowerCase().includes(s)
    );
  }, [pendingForInvoicing, searchTerm]);

  const filteredBills = useMemo(() => {
    if (!searchTerm.trim()) return bills;
    const s = searchTerm.toLowerCase();
    return bills.filter(
      (b) =>
        b.oc_number?.toLowerCase().includes(s) ||
        b.bill_number?.toLowerCase().includes(s) ||
        b.client_name?.toLowerCase().includes(s)
    );
  }, [bills, searchTerm]);

  // Auto-fetch WO/PO by OC number: returns first approved match
  const wopoByOcNumber = useMemo(() => {
    if (!ocNumberSearch.trim()) return null;
    const oc = ocNumberSearch.trim().toUpperCase();
    return approvedWopo.find(
      (w) => w.oc_number && w.oc_number.toUpperCase().includes(oc)
    ) || null;
  }, [approvedWopo, ocNumberSearch]);

  const openCreateBill = (wopo) => {
    setSelectedWopo(wopo);
    setBillingMethod(wopo.billing_template === 'Monthly Billing' ? 'Monthly' : wopo.billing_template === 'Daily Billing' ? 'Per Day' : 'Lump Sum');
    setBillItems(buildLockedLineItems(wopo));
    setAttachments([]);
    setCreateModalOpen(true);
  };

  function buildLockedLineItems(wopo) {
    if (wopo.designation_rates && wopo.designation_rates.length) {
      return wopo.designation_rates.map((dr) => ({
        description: dr.designation ? `${dr.designation} – ${dr.rate}` : dr.rate,
        quantity: 1,
        rate: dr.rate,
        amount: dr.rate,
        source_ref: `${wopo.oc_number} | Designation: ${dr.designation || '–'}`,
      }));
    }
    return [{
      description: wopo.rates || 'Bill amount',
      quantity: 1,
      rate: wopo.rates || '0',
      amount: wopo.rates || '0',
      source_ref: `${wopo.oc_number} | Rates`,
    }];
  }

  const updateBillItemQuantity = (idx, quantity) => {
    const q = Number(quantity) || 0;
    setBillItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, quantity: q, amount: item.rate } : item
      )
    );
  };

  const submitBill = () => {
    if (!selectedWopo || !billingMethod) return;
    const items = billItems.map((i) => ({
      ...i,
      source_ref: i.source_ref || selectedWopo.oc_number,
    }));
    const newBill = {
      id: Math.max(0, ...bills.map((b) => b.id), 0) + 1,
      oc_id: selectedWopo.id,
      oc_number: selectedWopo.oc_number,
      client_name: selectedWopo.client_name,
      wo_number: selectedWopo.wo_number,
      billing_template: selectedWopo.billing_template || '',
      billing_method: billingMethod,
      bill_number: generateBillNumber(bills.length + 1),
      status: 'pending_approval',
      items,
      credit_note_status: null,
      attachments: attachments.map((a) => ({ name: a.name || 'file', type: a.type || 'pdf', url: a.url || '' })),
      created_at: new Date().toISOString().slice(0, 10),
      site: selectedWopo.client_name,
    };
    setBills((prev) => [...prev, newBill]);
    setCreateModalOpen(false);
    setSelectedWopo(null);
  };

  const setBillStatus = (billId, status) => {
    if (status === 'rejected') {
      const bill = bills.find((b) => b.id === billId);
      if (bill) {
        setBillingHistory((prev) => [...prev, { ...bill, status: 'cancelled', cancelled_at: new Date().toISOString().slice(0, 10) }]);
        setBills((prev) => prev.filter((b) => b.id !== billId));
      }
      return;
    }
    setBills((prev) =>
      prev.map((b) => (b.id === billId ? { ...b, status } : b))
    );
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-100 p-3 rounded-lg shrink-0">
            <FileText className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">Create Invoice</h2>
            <p className="text-sm text-gray-600">Create bills from approved WO/POs – sent for approval before finalisation</p>
          </div>
        </div>
      </div>

      {/* Dashboard: Pending bills by billing template */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {BILLING_TEMPLATES.map((template) => (
          <div
            key={template}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 p-2 rounded-lg">
                <Receipt className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{template}</p>
                <p className="text-2xl font-bold text-gray-900">{pendingByTemplate[template] ?? 0}</p>
                <p className="text-xs text-gray-500">pending for invoicing</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* OC Number – auto-fetch Client/Commercial for site */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Enter OC Number (auto-fetch site data)</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="e.g. IFSPL-BILL-OC-25/26-00001"
            value={ocNumberSearch}
            onChange={(e) => setOcNumberSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {wopoByOcNumber && (
            <div className="w-full mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-sm">
              <p className="font-medium text-emerald-800">Client / Commercial data</p>
              <p className="text-gray-700">{wopoByOcNumber.client_name} · {wopoByOcNumber.oc_number}</p>
              <p className="text-gray-600">{wopoByOcNumber.client_address}</p>
              <p className="text-gray-500 mt-1">WO: {wopoByOcNumber.wo_number} · {wopoByOcNumber.billing_template}</p>
              {wopoByOcNumber.approval_status === 'approved' && (
                <button
                  type="button"
                  onClick={() => openCreateBill(wopoByOcNumber)}
                  className="mt-2 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
                >
                  Create bill from this OC
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by OC number, bill number, client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Approved WO/POs pending bill – Create bill */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Approved WO/POs – Create bill</h3>
          <p className="text-sm text-gray-500">Select an approved WO/PO to create a bill. Bill will be sent for approval.</p>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto">
          {filteredPending.length === 0 ? (
            <p className="text-sm text-gray-500">No approved WO/POs pending invoicing.</p>
          ) : (
            <ul className="space-y-2">
              {filteredPending.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <span className="font-medium text-gray-900">{w.oc_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{w.client_name}</span>
                    <span className="text-xs text-gray-400 ml-2">({w.billing_template})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateBill(w)}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Create bill
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bills created – status & approve/reject */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Bills created</h3>
          <p className="text-sm text-gray-500">All bills from this page appear in Credit Notes. Approve to finalise.</p>
        </div>
        <div className="overflow-x-auto">
          {filteredBills.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No bills created yet.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredBills.map((b) => (
                <li key={b.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{b.bill_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{b.oc_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{b.client_name}</span>
                    <span className="text-xs text-gray-400 ml-2">({b.billing_template})</span>
                    <span
                      className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        b.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : b.status === 'pending_approval'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {b.status === 'approved' ? 'Approved' : b.status === 'pending_approval' ? 'Pending approval' : 'Draft'}
                    </span>
                  </div>
                  {b.status === 'pending_approval' && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setBillStatus(b.id, 'approved')}
                        className="p-2 rounded-lg text-green-600 hover:bg-green-50"
                        title="Approve"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillStatus(b.id, 'rejected')}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Create bill modal */}
      {createModalOpen && selectedWopo && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Create bill</h3>
              <p className="text-sm text-gray-500">Select billing method. Only Quantity is editable; rates and taxes are locked from WO. Rate changes (e.g. Min Wages / Billing method) require senior approval before invoice generation.</p>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">OC Number</span>
                    <p className="font-medium">{selectedWopo.oc_number}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Client</span>
                    <p className="font-medium">{selectedWopo.client_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Billing template (WO)</span>
                    <p className="font-medium">{selectedWopo.billing_template || '–'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Bill number</span>
                    <p className="font-medium">{billNumber}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Billing method (before invoice) *</label>
                  <select
                    value={billingMethod}
                    onChange={(e) => setBillingMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select method</option>
                    {BILLING_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Line items (only Quantity editable; rates/taxes locked)</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-2 pr-2">Description</th>
                        <th className="py-2 pr-2">Quantity</th>
                        <th className="py-2 pr-2"><span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Rate</span></th>
                        <th className="py-2 pr-2"><span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Amount</span></th>
                        <th className="py-2">Source (traceability)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2 pr-2 text-gray-900">{item.description}</td>
                          <td className="py-2 pr-2">
                            <input
                              type="number"
                              min={0}
                              value={item.quantity}
                              onChange={(e) => updateBillItemQuantity(idx, e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="py-2 pr-2 bg-gray-50 text-gray-700">{item.rate}</td>
                          <td className="py-2 pr-2 bg-gray-50 text-gray-700">{item.amount}</td>
                          <td className="py-2 text-xs text-gray-500" title={item.source_ref}>{item.source_ref}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachments (PDF/Excel attendance)</label>
                <div className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <Paperclip className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">Upload or link PDF/Excel attendance sheets</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBill}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit for approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateInvoice;
