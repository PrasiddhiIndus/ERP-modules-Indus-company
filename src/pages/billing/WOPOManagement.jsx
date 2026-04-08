import React, { useState, useMemo } from 'react';
import { useBilling } from '../../contexts/BillingContext';
import {
  FileCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  XCircle,
  Zap,
} from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const getFinancialYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y.toString().slice(2)}/${(y + 1).toString().slice(2)}`;
  return `${(y - 1).toString().slice(2)}/${y.toString().slice(2)}`;
};

const generateOCNumber = (sequence) => {
  const fy = getFinancialYear();
  const seq = String(sequence).padStart(5, '0');
  return `IFSPL-BILL-OC-${fy}-${seq}`;
};

const initialForm = {
  category: '',
  rates: '',
  designation_rates: [], // [{ designation, rate }] when category is Manpower
  payment_terms: '',
  wo_number: '',
  client_name: '',
  client_address: '',
  hsn_sac: '',
  gst_config: '',
  billing_type: '',
  billing_template: '',
  start_date: '',
  end_date: '',
};

const CATEGORIES = ['Fire Tender', 'Manpower', 'AMC', 'Service', 'Other'];
const BILLING_TYPES = ['Manpower with Fire Tender', 'Manpower', 'Fire Tender', 'AMC', 'Service', 'Other'];
const BILLING_TEMPLATES = ['Monthly Billing', 'Daily Billing', 'Lumpsum Billing'];
const GST_OPTIONS = ['GST 18%', 'GST 12%', 'GST 5%', 'GST 0%', 'Exempt'];
const DESIGNATIONS = ['FM', 'DCPO', 'F Sup', 'Driver', 'Operator', 'Technician', 'Helper', 'Other'];
const APPROVAL_STATUSES = { draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved', rejected: 'Rejected' };

const WOPOManagement = () => {
  const { wopoList: list, setWopoList: setList, quickBillRequests, setQuickBillRequests } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [formData, setFormData] = useState(initialForm);

  const TextCell = ({ value, className = '' }) => {
    const display = value ?? '';
    return (
      <span
        className={`block min-w-0 truncate ${className}`}
        title={typeof display === 'string' ? display : String(display)}
      >
        {display}
      </span>
    );
  };

  const StatusBadge = ({ approvalStatus, status }) => {
    const a = approvalStatus || 'draft';
    const s = status || 'active';
    const approvalClass =
      a === 'approved'
        ? 'bg-green-100 text-green-800'
        : a === 'pending_approval'
        ? 'bg-amber-100 text-amber-800'
        : a === 'rejected'
        ? 'bg-red-100 text-red-800'
        : 'bg-gray-100 text-gray-800';
    const statusClass =
      s === 'active'
        ? 'bg-blue-50 text-blue-700'
        : s === 'inactive'
        ? 'bg-gray-100 text-gray-700'
        : 'bg-gray-100 text-gray-700';
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${approvalClass} whitespace-nowrap`}>
          {APPROVAL_STATUSES[a] || 'Draft'}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass} whitespace-nowrap`}>
          {s}
        </span>
      </div>
    );
  };

  const getDaysUntil = (dateStr) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.ceil((d - t) / (1000 * 60 * 60 * 24));
  };

  const expiringSoon = useMemo(() => {
    return list.filter((row) => {
      const days = getDaysUntil(row.end_date);
      return days >= 0 && days <= 30;
    });
  }, [list]);

  const expired = useMemo(() => {
    return list.filter((row) => getDaysUntil(row.end_date) < 0);
  }, [list]);

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return list;
    const s = searchTerm.toLowerCase();
    return list.filter(
      (row) =>
        row.oc_number?.toLowerCase().includes(s) ||
        row.wo_number?.toLowerCase().includes(s) ||
        row.client_name?.toLowerCase().includes(s) ||
        row.category?.toLowerCase().includes(s) ||
        row.billing_type?.toLowerCase().includes(s)
    );
  }, [list, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedList = filteredList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleDelete = (id) => {
    setList((prev) => prev.filter((row) => row.id !== id));
    setDeleteConfirmId(null);
    if (paginatedList.length === 1 && currentPage > 1) setCurrentPage((p) => p - 1);
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-3 rounded-lg shrink-0">
            <FileCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">WO/PO Management</h2>
            <p className="text-sm text-gray-600">Work orders & purchase orders – OC numbers, client details, GST</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(true);
            setEditId(null);
            setFormData(initialForm);
          }}
          className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2 shrink-0"
        >
          <Plus className="h-5 w-5" />
          <span>Add WO/PO</span>
        </button>
      </div>

      {/* Small dashboard – dates approaching / expired */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="font-semibold text-amber-800 text-sm">Expiring within 30 days</span>
          </div>
          <div className="p-4 max-h-40 overflow-y-auto">
            {expiringSoon.length === 0 ? (
              <p className="text-sm text-gray-500">None</p>
            ) : (
              <ul className="space-y-2">
                {expiringSoon.map((row) => (
                  <li key={row.id} className="text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                    <span className="font-medium text-gray-900 block truncate">{row.oc_number}</span>
                    <span className="text-gray-500 block truncate">{row.client_name}</span>
                    <span className="text-amber-600 text-xs">Ends: {row.end_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-semibold text-red-800 text-sm">Expired</span>
          </div>
          <div className="p-4 max-h-40 overflow-y-auto">
            {expired.length === 0 ? (
              <p className="text-sm text-gray-500">None</p>
            ) : (
              <ul className="space-y-2">
                {expired.map((row) => (
                  <li key={row.id} className="text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                    <span className="font-medium text-gray-900 block truncate">{row.oc_number}</span>
                    <span className="text-gray-500 block truncate">{row.client_name}</span>
                    <span className="text-red-600 text-xs">Ended: {row.end_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <span className="font-semibold text-green-800 text-sm">Total WO/PO</span>
          </div>
          <div className="p-4 flex items-center justify-center">
            <span className="text-3xl font-bold text-gray-900">{list.length}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="relative max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by OC number, WO number, client, category..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* All WO/PO – card list with vertical scroll */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            PO / WO Management ({filteredList.length} records)
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">
              {filteredList.length === 0 ? 0 : startIndex + 1}–
              {Math.min(startIndex + ITEMS_PER_PAGE, filteredList.length)} of {filteredList.length}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-sm whitespace-nowrap">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-28rem)] min-h-[200px]">
          {paginatedList.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No WO/PO records found.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="min-w-[1100px] w-full table-fixed">
                <thead>
                  <tr className="bg-[#f2f6ff]">
                    <th className="px-4 py-3 text-left text-sm font-bold text-black border-b border-gray-200 w-[170px]">
                      OC Number
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-black border-b border-gray-200 w-[200px]">
                      Site / Location
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-black border-b border-gray-200 w-[260px]">
                      Client (Legal Name)
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-black border-b border-gray-200 w-[190px]">
                      PO/WO
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-black border-b border-gray-200 w-[180px]">
                      Start – End
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-black border-b border-gray-200 w-[190px]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-black border-b border-gray-200 w-[210px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedList.map((row) => {
                    const ocNumber = row.oc_number || row.ocNumber || '';
                    const siteLocation =
                      row.location_name ||
                      row.locationName ||
                      row.site_id ||
                      row.siteId ||
                      row.site ||
                      row.location ||
                      '';
                    const legalName = row.legal_name || row.legalName || row.client_name || row.clientName || '';
                    const poWo = row.po_wo_number || row.poWoNumber || row.wo_number || row.woNumber || '';
                    const startEnd = `${row.start_date || row.startDate || ''}${(row.start_date || row.startDate) && (row.end_date || row.endDate) ? ' – ' : ''}${row.end_date || row.endDate || ''}`;
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className="bg-white hover:bg-gray-50 cursor-pointer align-top"
                          onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <TextCell value={ocNumber} className="font-semibold" />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <TextCell value={siteLocation} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <TextCell value={legalName} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <TextCell value={poWo} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <TextCell value={startEnd} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <StatusBadge approvalStatus={row.approval_status} status={row.status} />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {row.approval_status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setList((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id ? { ...r, approval_status: 'pending_approval' } : r
                                      )
                                    );
                                  }}
                                  className="p-2 rounded-lg text-amber-700 hover:bg-amber-50 transition-colors"
                                  title="Submit for approval"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                              {row.approval_status === 'pending_approval' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setList((prev) =>
                                        prev.map((r) =>
                                          r.id === row.id ? { ...r, approval_status: 'approved' } : r
                                        )
                                      );
                                    }}
                                    className="p-2 rounded-lg text-green-700 hover:bg-green-50 transition-colors"
                                    title="Approve"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setList((prev) =>
                                        prev.map((r) =>
                                          r.id === row.id ? { ...r, approval_status: 'rejected' } : r
                                        )
                                      );
                                    }}
                                    className="p-2 rounded-lg text-red-700 hover:bg-red-50 transition-colors"
                                    title="Reject"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickBillRequests((prev) => [
                                    ...prev,
                                    {
                                      id: Math.max(0, ...prev.map((q) => q.id), 0) + 1,
                                      oc_id: row.id,
                                      oc_number: row.oc_number,
                                      requested_at: new Date().toISOString().slice(0, 10),
                                      status: 'pending_approval',
                                    },
                                  ]);
                                }}
                                className="p-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
                                title="Quick WO/PO – request quick bill (requires approval)"
                              >
                                <Zap className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const r = list.find((x) => x.id === row.id);
                                  if (r) {
                                    setFormData({
                                      category: r.category || '',
                                      rates: r.rates || '',
                                      designation_rates: Array.isArray(r.designation_rates)
                                        ? r.designation_rates.map((dr) => ({ designation: dr.designation || '', rate: dr.rate || '' }))
                                        : [],
                                      payment_terms: r.payment_terms || '',
                                      wo_number: r.wo_number || '',
                                      client_name: r.client_name || '',
                                      client_address: r.client_address || '',
                                      hsn_sac: r.hsn_sac || '',
                                      gst_config: r.gst_config || '',
                                      billing_type: r.billing_type || '',
                                      billing_template: r.billing_template || '',
                                      start_date: r.start_date || '',
                                      end_date: r.end_date || '',
                                    });
                                    setEditId(r.id);
                                    setShowAddForm(false);
                                  }
                                }}
                                className="p-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {deleteConfirmId === row.id ? (
                                <span className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(row.id);
                                    }}
                                    className="px-2 py-1 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmId(null);
                                    }}
                                    className="px-2 py-1 text-xs font-semibold rounded border border-gray-300 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmId(row.id);
                                  }}
                                  className="p-2 rounded-lg text-red-700 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedId((prev) => (prev === row.id ? null : row.id));
                                }}
                                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                                aria-expanded={expandedId === row.id}
                                title={expandedId === row.id ? 'Collapse' : 'Expand'}
                              >
                                {expandedId === row.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === row.id && (
                          <tr className="bg-gray-50">
                            <td className="px-4 pb-4 pt-3" colSpan={7}>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                <div className={row.designation_rates?.length ? 'sm:col-span-2 lg:col-span-3' : ''}>
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Rates</p>
                                  {row.designation_rates?.length ? (
                                    <ul className="text-gray-900 mt-0.5 space-y-1">
                                      {row.designation_rates.map((dr, i) => (
                                        <li key={i} className="flex justify-between gap-2">
                                          <span className="font-medium">{dr.designation}</span>
                                          <span>{dr.rate}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-gray-900 mt-0.5">{row.rates}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Payment terms</p>
                                  <p className="text-gray-900 mt-0.5">{row.payment_terms}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">HSN/SAC</p>
                                  <p className="text-gray-900 mt-0.5">{row.hsn_sac}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">GST config</p>
                                  <p className="text-gray-900 mt-0.5">{row.gst_config}</p>
                                </div>
                                {row.billing_template && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Billing template</p>
                                    <p className="text-gray-900 mt-0.5">{row.billing_template}</p>
                                  </div>
                                )}
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Client address</p>
                                  <p className="text-gray-900 mt-0.5">{row.client_address}</p>
                                </div>
                                {quickBillRequests.filter((q) => q.oc_id === row.id).length > 0 && (
                                  <div className="sm:col-span-2 lg:col-span-3">
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Quick WO/PO requests</p>
                                    <ul className="mt-1 space-y-1">
                                      {quickBillRequests
                                        .filter((q) => q.oc_id === row.id)
                                        .map((qb) => (
                                          <li key={qb.id} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="min-w-0">
                                              <span className="truncate block" title={`Requested ${qb.requested_at}`}>
                                                Requested {qb.requested_at}
                                              </span>
                                              <span
                                                className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded ${
                                                  qb.status === 'approved'
                                                    ? 'bg-green-100 text-green-800'
                                                    : qb.status === 'rejected'
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-amber-100 text-amber-800'
                                                }`}
                                              >
                                                {qb.status === 'pending_approval' ? 'Pending approval' : qb.status === 'approved' ? 'Approved' : 'Rejected'}
                                              </span>
                                            </span>
                                            {qb.status === 'pending_approval' && (
                                              <span className="flex gap-1 shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setQuickBillRequests((prev) =>
                                                      prev.map((r) =>
                                                        r.id === qb.id ? { ...r, status: 'approved' } : r
                                                      )
                                                    );
                                                  }}
                                                  className="px-2 py-1 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700"
                                                >
                                                  Approve
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setQuickBillRequests((prev) =>
                                                      prev.map((r) =>
                                                        r.id === qb.id ? { ...r, status: 'rejected' } : r
                                                      )
                                                    );
                                                  }}
                                                  className="px-2 py-1 text-xs font-semibold rounded border border-gray-300 hover:bg-gray-50"
                                                >
                                                  Reject
                                                </button>
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                    </ul>
                                    <p className="text-xs text-gray-500 mt-1">Approved quick bills will be available for invoicing in E-invoice / next step.</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit WO/PO modal – full form */}
      {(showAddForm || editId) && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditId(null);
            setShowAddForm(false);
            setFormData(initialForm);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {editId ? 'Edit WO/PO' : 'Add WO/PO'}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {editId ? 'Update work order / purchase order details.' : 'Create a new work order or purchase order.'}
              </p>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                {/* OC Number (read-only) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">OC Number</label>
                  <input
                    type="text"
                    readOnly
                    value={
                      editId
                        ? (list.find((x) => x.id === editId)?.oc_number ?? '')
                        : generateOCNumber(list.length + 1)
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setFormData((f) => ({
                          ...f,
                          category: cat,
                          rates: cat === 'Manpower' ? '' : f.rates,
                          designation_rates: cat === 'Manpower' ? f.designation_rates : [],
                        }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WO Number *</label>
                    <input
                      type="text"
                      value={formData.wo_number}
                      onChange={(e) => setFormData((f) => ({ ...f, wo_number: e.target.value }))}
                      placeholder="e.g. WO-2025-001"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {formData.category === 'Manpower' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Designation-wise rates *</label>
                    <p className="text-xs text-gray-500 mb-2">Add one or more designations and their rates.</p>
                    <div className="space-y-2">
                      {(formData.designation_rates || []).map((dr, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            value={dr.designation}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                designation_rates: f.designation_rates.map((d, i) =>
                                  i === idx ? { ...d, designation: e.target.value } : d
                                ),
                              }))
                            }
                            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select designation</option>
                            {DESIGNATIONS.filter(
                              (d) => !formData.designation_rates.some((r, i) => i !== idx && r.designation === d)
                            ).map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={dr.rate}
                            onChange={(e) =>
                              setFormData((f) => ({
                                ...f,
                                designation_rates: f.designation_rates.map((d, i) =>
                                  i === idx ? { ...d, rate: e.target.value } : d
                                ),
                              }))
                            }
                            placeholder="e.g. ₹45,000"
                            className="w-36 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((f) => ({
                                ...f,
                                designation_rates: f.designation_rates.filter((_, i) => i !== idx),
                              }))
                            }
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((f) => ({
                            ...f,
                            designation_rates: [...(f.designation_rates || []), { designation: '', rate: '' }],
                          }))
                        }
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                        Add designation & rate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rates *</label>
                    <input
                      type="text"
                      value={formData.rates}
                      onChange={(e) => setFormData((f) => ({ ...f, rates: e.target.value }))}
                      placeholder="e.g. ₹12,50,000 or ₹45,000/month"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms *</label>
                  <input
                    type="text"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData((f) => ({ ...f, payment_terms: e.target.value }))}
                    placeholder="e.g. 30% Advance, 70% on Delivery"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                  <input
                    type="text"
                    value={formData.client_name}
                    onChange={(e) => setFormData((f) => ({ ...f, client_name: e.target.value }))}
                    placeholder="Client or company name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Address *</label>
                  <textarea
                    value={formData.client_address}
                    onChange={(e) => setFormData((f) => ({ ...f, client_address: e.target.value }))}
                    placeholder="Full address"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HSN/SAC Code *</label>
                    <input
                      type="text"
                      value={formData.hsn_sac}
                      onChange={(e) => setFormData((f) => ({ ...f, hsn_sac: e.target.value }))}
                      placeholder="e.g. 9985, 9983"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GST Configuration *</label>
                    <select
                      value={formData.gst_config}
                      onChange={(e) => setFormData((f) => ({ ...f, gst_config: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select GST</option>
                      {GST_OPTIONS.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Billing Type *</label>
                  <select
                    value={formData.billing_type}
                    onChange={(e) => setFormData((f) => ({ ...f, billing_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select billing type</option>
                    {BILLING_TYPES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Billing template *</label>
                  <select
                    value={formData.billing_template}
                    onChange={(e) => setFormData((f) => ({ ...f, billing_template: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select template</option>
                    {BILLING_TEMPLATES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData((f) => ({ ...f, start_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData((f) => ({ ...f, end_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setShowAddForm(false);
                  setFormData(initialForm);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const isManpower = formData.category === 'Manpower';
                  const hasDesignationRates = isManpower && formData.designation_rates?.length > 0
                    && formData.designation_rates.some((dr) => dr.designation && dr.rate);
                  const ratesDisplay = hasDesignationRates
                    ? formData.designation_rates
                        .filter((dr) => dr.designation && dr.rate)
                        .map((dr) => `${dr.designation}: ${dr.rate}`)
                        .join('; ')
                    : formData.rates;
                  const payload = {
                    oc_number: editId
                      ? list.find((x) => x.id === editId)?.oc_number
                      : generateOCNumber(list.length + 1),
                    category: formData.category,
                    rates: ratesDisplay,
                    designation_rates: hasDesignationRates ? formData.designation_rates.filter((dr) => dr.designation && dr.rate) : [],
                    payment_terms: formData.payment_terms,
                    wo_number: formData.wo_number,
                    client_name: formData.client_name,
                    client_address: formData.client_address,
                    hsn_sac: formData.hsn_sac,
                    gst_config: formData.gst_config,
                    billing_type: formData.billing_type,
                    billing_template: formData.billing_template || '',
                    start_date: formData.start_date,
                    end_date: formData.end_date,
                    status: 'active',
                    approval_status: editId ? list.find((x) => x.id === editId)?.approval_status : 'draft',
                  };
                  if (editId) {
                    setList((prev) =>
                      prev.map((row) => (row.id === editId ? { ...row, ...payload } : row))
                    );
                    setEditId(null);
                  } else {
                    setList((prev) => [
                      ...prev,
                      { id: Math.max(0, ...prev.map((r) => r.id)) + 1, ...payload },
                    ]);
                    setShowAddForm(false);
                  }
                  setFormData(initialForm);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editId ? 'Save' : 'Add WO/PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WOPOManagement;
