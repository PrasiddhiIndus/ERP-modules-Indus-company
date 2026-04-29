import React, { useState, useMemo } from 'react';
import { FileCheck, Plus, Search, Pencil, Trash2, History, Send } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';

const VERTICALS = ['MANP', 'AMC', 'FIRE', 'SERV'];
const BILLING_TYPES = ['Per Day', 'Monthly', 'Lump Sum'];
const BILLING_CYCLES = ['30', '45', '60'];
const ALLOWED_MANPOWER_PO_TYPES = new Set(BILLING_TYPES);
const DEFAULT_SAC = '9985';
const APPROVAL_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent_for_approval',
};

function getApprovalBadge(status) {
  if (status === APPROVAL_STATUS.SENT) {
    return { label: 'Sent', cls: 'bg-indigo-100 text-indigo-800' };
  }
  return { label: 'Draft', cls: 'bg-gray-100 text-gray-700' };
}

function getFinancialYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y.toString().slice(2)}/${(y + 1).toString().slice(2)}` : `${(y - 1).toString().slice(2)}/${y.toString().slice(2)}`;
}

function generateOCNumber(vertical, series) {
  const fy = getFinancialYear();
  const seq = String(series).padStart(5, '0');
  return `IFSPL-${vertical}-OC-${fy}-${seq}`;
}

function validateGSTIN(value) {
  if (!value || value.length !== 15) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value.toUpperCase());
}

function isValidDateInput(value) {
  const raw = String(value || '');
  if (!raw) return true;
  if (raw.length > 10) return false;
  const [year = ''] = raw.split('-');
  return year.length <= 4;
}

const initialForm = {
  siteId: '',
  locationName: '',
  legalName: '',
  billingAddress: '',
  gstin: '',
  currentCoordinator: '',
  contactNumber: '',
  ocNumber: '',
  vertical: 'MANP',
  ocSeries: '1',
  poWoNumber: '',
  ratePerCategory: [{ description: '', rate: '' }],
  totalContractValue: '',
  sacCode: DEFAULT_SAC,
  hsnCode: '',
  serviceDescription: '',
  startDate: '',
  endDate: '',
  billingType: 'Monthly',
  billingCycle: '30',
  paymentTerms: '',
  revisedPO: false,
  renewalPending: false,
};

const POEntry = () => {
  const { commercialPOs, setCommercialPOs } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [viewHistoryPoId, setViewHistoryPoId] = useState(null);
  const [gstinError, setGstinError] = useState('');
  const [saveError, setSaveError] = useState('');

  const TextCell = ({ value, className = '' }) => {
    const display = value ?? '';
    return (
      <span className={`block min-w-0 truncate ${className}`} title={typeof display === 'string' ? display : String(display)}>
        {display || '–'}
      </span>
    );
  };

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return commercialPOs;
    const s = searchTerm.toLowerCase();
    return commercialPOs.filter(
      (p) =>
        p.ocNumber?.toLowerCase().includes(s) ||
        p.poWoNumber?.toLowerCase().includes(s) ||
        p.legalName?.toLowerCase().includes(s) ||
        p.siteId?.toLowerCase().includes(s)
    );
  }, [commercialPOs, searchTerm]);

  const nextId = useMemo(() => Math.max(0, ...commercialPOs.map((p) => p.id), 0) + 1, [commercialPOs]);
  const nextSeries = useMemo(() => {
    const fy = getFinancialYear();
    const sameFy = commercialPOs.filter((p) => p.ocNumber && p.ocNumber.includes(fy));
    const nums = sameFy.map((p) => parseInt(p.ocNumber?.split('-').pop() || '0', 10));
    return (Math.max(0, ...nums) + 1).toString().padStart(5, '0');
  }, [commercialPOs]);

  const handleOpenAdd = () => {
    setEditId(null);
    setFormData({
      ...initialForm,
      ocNumber: generateOCNumber('MANP', nextSeries),
      ocSeries: nextSeries,
    });
    setGstinError('');
    setSaveError('');
    setShowForm(true);
  };

  const handleOpenEdit = (po) => {
    setEditId(po.id);
    setFormData({
      siteId: po.siteId || '',
      locationName: po.locationName || '',
      legalName: po.legalName || '',
      billingAddress: po.billingAddress || '',
      gstin: po.gstin || '',
      currentCoordinator: po.currentCoordinator || '',
      contactNumber: po.contactNumber || '',
      ocNumber: po.ocNumber || '',
      vertical: (po.ocNumber && po.ocNumber.split('-')[1]) || 'MANP',
      ocSeries: (po.ocNumber && po.ocNumber.split('-').pop()) || '1',
      poWoNumber: po.poWoNumber || '',
      ratePerCategory: Array.isArray(po.ratePerCategory) && po.ratePerCategory.length
        ? po.ratePerCategory.map((r) => ({ description: r.description || r.designation || '', rate: r.rate ?? '' }))
        : [{ description: '', rate: '' }],
      totalContractValue: po.totalContractValue ?? '',
      sacCode: po.sacCode || DEFAULT_SAC,
      hsnCode: po.hsnCode || '',
      serviceDescription: po.serviceDescription || '',
      startDate: po.startDate || '',
      endDate: po.endDate || '',
      billingType: po.billingType || 'Monthly',
      billingCycle: String(po.billingCycle || '30'),
      paymentTerms: po.paymentTerms || '',
      revisedPO: !!po.revisedPO,
      renewalPending: !!po.renewalPending,
    });
    setGstinError('');
    setSaveError('');
    setShowForm(true);
  };

  const handleGstinBlur = () => {
    if (formData.gstin && !validateGSTIN(formData.gstin)) {
      setGstinError('GSTIN must be 15-digit alphanumeric (e.g. 27AABCU9603R1ZM)');
    } else {
      setGstinError('');
    }
  };

  const addRateRow = () => {
    setFormData((prev) => ({
      ...prev,
      ratePerCategory: [...prev.ratePerCategory, { description: '', rate: '' }],
    }));
  };

  const updateRateRow = (idx, field, value) => {
    setFormData((prev) => ({
      ...prev,
      ratePerCategory: prev.ratePerCategory.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r
      ),
    }));
  };

  const removeRateRow = (idx) => {
    if (formData.ratePerCategory.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      ratePerCategory: prev.ratePerCategory.filter((_, i) => i !== idx),
    }));
  };

  const handleDateInputChange = (field, value) => {
    if (!isValidDateInput(value)) return;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const sendToApproval = (id) => {
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              approvalStatus: APPROVAL_STATUS.SENT,
              approvalSentAt: p.approvalSentAt || new Date().toISOString(),
            }
          : p
      )
    );
  };

  const savePO = () => {
    if (formData.gstin && !validateGSTIN(formData.gstin)) {
      setGstinError('Fix GSTIN before saving');
      return;
    }
    const trimmedOcNumber = (formData.ocNumber || '').trim();
    const trimmedPoWoNumber = (formData.poWoNumber || '').trim();
    const hasDuplicatePO = commercialPOs.some((p) => {
      if (editId && p.id === editId) return false;
      const sameOc = trimmedOcNumber && (p.ocNumber || '').trim().toLowerCase() === trimmedOcNumber.toLowerCase();
      const samePoWo = trimmedPoWoNumber && (p.poWoNumber || '').trim().toLowerCase() === trimmedPoWoNumber.toLowerCase();
      return sameOc || samePoWo;
    });
    if (hasDuplicatePO) {
      setSaveError('Duplicate OC Number or PO/WO Number found. Please use unique values.');
      return;
    }
    const ocNum = formData.ocNumber || generateOCNumber(formData.vertical || 'MANP', formData.ocSeries || '1');
    const poType = ALLOWED_MANPOWER_PO_TYPES.has(formData.billingType) ? formData.billingType : 'Monthly';
    const ratesMap = new Map();
    formData.ratePerCategory.forEach((r) => {
      const description = (r.description || '').trim() || 'Other';
      const key = description.toLowerCase();
      const rate = Number(r.rate) || 0;
      ratesMap.set(key, { description, rate });
    });
    const rates = Array.from(ratesMap.values());
    const totalVal = Number(formData.totalContractValue) || 0;
    const prevPo = editId ? commercialPOs.find((p) => p.id === editId) : null;
    const newId = editId ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}`);
    const po = {
      id: newId,
      siteId: formData.siteId.trim() || `SITE-${String(newId).slice(0, 8)}`,
      locationName: formData.locationName.trim() || formData.legalName,
      legalName: formData.legalName.trim(),
      billingAddress: formData.billingAddress.trim(),
      gstin: formData.gstin.trim().toUpperCase(),
      currentCoordinator: formData.currentCoordinator.trim(),
      contactNumber: formData.contactNumber.trim(),
      contactHistoryLog: editId
        ? (commercialPOs.find((p) => p.id === editId)?.contactHistoryLog || [])
        : [{ name: formData.currentCoordinator.trim(), number: formData.contactNumber.trim(), from: formData.startDate || new Date().toISOString().slice(0, 10), to: null }],
      ocNumber: ocNum,
      ocSeries: formData.ocSeries || '1',
      vertical: (formData.ocNumber && formData.ocNumber.split('-')[1]) || formData.vertical || 'MANP',
      poWoNumber: formData.poWoNumber.trim(),
      ratePerCategory: rates.length ? rates : [{ description: 'Other', rate: 0 }],
      totalContractValue: totalVal,
      sacCode: formData.sacCode.trim() || DEFAULT_SAC,
      hsnCode: formData.hsnCode.trim(),
      serviceDescription: formData.serviceDescription.trim(),
      startDate: formData.startDate || '',
      endDate: formData.endDate || '',
      billingType: poType,
      billingCycle: Number(formData.billingCycle) || 30,
      paymentTerms: formData.paymentTerms.trim(),
      poReceivedDate: null,
      paymentTermMode: null,
      paymentTermDays: null,
      advancePercent: null,
      revisedPO: formData.revisedPO,
      renewalPending: formData.renewalPending,
      status: formData.endDate && new Date(formData.endDate) < new Date() ? 'expired' : 'active',
      approvalStatus: prevPo?.approvalStatus || APPROVAL_STATUS.DRAFT,
      approvalSentAt: prevPo?.approvalSentAt || null,
    };
    if (editId) {
      setCommercialPOs((prev) => prev.map((p) => (p.id === editId ? po : p)));
    } else {
      setCommercialPOs((prev) => [...prev, po]);
    }
    setSaveError('');
    setShowForm(false);
    setFormData(initialForm);
  };

  const deletePO = (id) => {
    if (window.confirm('Delete this PO? Billing may be affected.')) {
      setCommercialPOs((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const poForHistory = viewHistoryPoId ? commercialPOs.find((p) => p.id === viewHistoryPoId) : null;

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-3 rounded-lg shrink-0">
            <FileCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">PO / WO Management</h2>
            <p className="text-sm text-gray-600">Contract details – master source for Billing (no manual re-entry there)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Add PO/WO
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by OC, PO number, client, site..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-[#f2f6ff]">
        <div className="p-2">
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="w-full max-w-full min-w-0 overflow-x-hidden">
              <table className="w-full min-w-0 max-w-full table-fixed border-collapse">
                <thead>
                  <tr>
                <th className="px-2 sm:px-3 py-2.5 text-left text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[17%] min-w-0 bg-[#f2f6ff]">
                  OC Number
                </th>
                <th className="px-2 sm:px-3 py-2.5 text-left text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[15%] min-w-0 bg-[#f2f6ff]">
                  Site / Location
                </th>
                <th className="px-2 sm:px-3 py-2.5 text-left text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[19%] min-w-0 bg-[#f2f6ff]">
                  Client (Legal Name)
                </th>
                <th className="px-2 sm:px-3 py-2.5 text-left text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[10%] min-w-0 bg-[#f2f6ff]">
                  PO/WO
                </th>
                <th className="px-2 sm:px-3 py-2.5 text-left text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[11%] min-w-0 bg-[#f2f6ff]">
                  Start-End
                </th>
                <th className="px-2 sm:px-3 py-2.5 text-left text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[15%] min-w-0 bg-[#f2f6ff]">
                  Status
                </th>
                <th className="px-2 sm:px-3 py-2.5 text-right text-xs sm:text-sm font-bold text-black border-b border-gray-200 w-[13%] min-w-0 bg-[#f2f6ff]">
                  Actions
                </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredList.map((po) => {
                    const siteLocation = [po.siteId, po.locationName].filter(Boolean).join(' – ');
                    const startFmt = formatDateDdMmYyyy(po.startDate) || '–';
                    const endFmt = formatDateDdMmYyyy(po.endDate) || '–';
                    const approval = getApprovalBadge(po.approvalStatus);
                    return (
                      <tr key={po.id} className="hover:bg-gray-50 align-top">
                        <td className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm text-gray-900 min-w-0">
                          <TextCell value={po.ocNumber} className="font-semibold font-mono" />
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm text-gray-700 min-w-0">
                          <TextCell value={siteLocation} />
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm text-gray-900 min-w-0">
                          <TextCell value={po.legalName} />
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm text-gray-700 min-w-0">
                          <TextCell value={po.poWoNumber} />
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm text-gray-700 min-w-0 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5 leading-none min-w-0">
                            <span
                              className="font-mono tabular-nums tracking-tight truncate max-w-full"
                              title={po.startDate || ''}
                            >
                              {startFmt}
                            </span>
                            <span className="text-gray-400 select-none font-mono text-[10px] leading-none">-</span>
                            <span
                              className="font-mono tabular-nums tracking-tight truncate max-w-full"
                              title={po.endDate || ''}
                            >
                              {endFmt}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2.5 text-xs sm:text-sm text-gray-700 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${approval.cls}`}
                            >
                              {approval.label}
                            </span>
                            {(po.revisedPO || po.renewalPending) && (
                              <span
                                className="text-xs truncate"
                                title={`${po.revisedPO ? 'Revised' : ''}${po.revisedPO && po.renewalPending ? ' · ' : ''}${po.renewalPending ? 'Renewal' : ''}`}
                              >
                                {po.revisedPO && <span className="text-amber-700 font-medium">Revised</span>}
                                {po.revisedPO && po.renewalPending && <span className="text-gray-400"> · </span>}
                                {po.renewalPending && <span className="text-orange-700 font-medium">Renewal</span>}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 min-w-0">
                          <div className="flex items-center justify-end gap-0.5 flex-wrap">
                            {po.approvalStatus !== APPROVAL_STATUS.SENT && (
                              <button
                                type="button"
                                onClick={() => sendToApproval(po.id)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                title="Send to approval"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewHistoryPoId(po.id)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100"
                              title="View History"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(po)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePO(po.id)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredList.length === 0 && (
              <div className="p-8 text-center text-gray-500">No PO/WO found. Add one to start.</div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-start justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">{editId ? 'Edit PO/WO' : 'Add PO/WO'}</h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Client Identity */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">1. Client Identity</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Legal Name (for GST)</label>
                    <input
                      type="text"
                      value={formData.legalName}
                      onChange={(e) => setFormData((p) => ({ ...p, legalName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Full legal name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address (with State)</label>
                    <input
                      type="text"
                      value={formData.billingAddress}
                      onChange={(e) => setFormData((p) => ({ ...p, billingAddress: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Full address including State"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN (15-digit alphanumeric)</label>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => { setFormData((p) => ({ ...p, gstin: e.target.value.toUpperCase() })); setGstinError(''); }}
                      onBlur={handleGstinBlur}
                      maxLength={15}
                      className={`w-full border rounded-lg px-3 py-2 ${gstinError ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="e.g. 27AABCU9603R1ZM"
                    />
                    {gstinError && <p className="text-red-600 text-xs mt-1">{gstinError}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Site / Location ID</label>
                    <input
                      type="text"
                      value={formData.siteId}
                      onChange={(e) => setFormData((p) => ({ ...p, siteId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="e.g. SITE-001"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location Name</label>
                    <input
                      type="text"
                      value={formData.locationName}
                      onChange={(e) => setFormData((p) => ({ ...p, locationName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Site/location description"
                    />
                  </div>
                </div>
              </section>

              {/* Contact Management (POC) */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">2. Contact Management (POC)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Coordinator</label>
                    <input
                      type="text"
                      value={formData.currentCoordinator}
                      onChange={(e) => setFormData((p) => ({ ...p, currentCoordinator: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Client-side contact person"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                    <input
                      type="text"
                      value={formData.contactNumber}
                      onChange={(e) => setFormData((p) => ({ ...p, contactNumber: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Mobile/phone"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Use &quot;View History&quot; in the table to see previous coordinators.</p>
              </section>

              {/* Financials */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">3. Financials</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">OC Number (IFSPL-Vertical-OC-YY/YY-Series)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.ocNumber}
                        onChange={(e) => setFormData((p) => ({ ...p, ocNumber: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                        placeholder="IFSPL-MANP-OC-25/26-00001"
                      />
                      <select
                        value={formData.vertical}
                        onChange={(e) => setFormData((p) => ({ ...p, vertical: e.target.value, ocNumber: generateOCNumber(e.target.value, p.ocSeries) }))}
                        className="border border-gray-300 rounded-lg px-3 py-2"
                      >
                        {VERTICALS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PO/WO Number</label>
                    <input
                      type="text"
                      value={formData.poWoNumber}
                      onChange={(e) => setFormData((p) => ({ ...p, poWoNumber: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Official document number from client"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Contract Value (₹)</label>
                    <input
                      type="number"
                      value={formData.totalContractValue}
                      onChange={(e) => setFormData((p) => ({ ...p, totalContractValue: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      min="0"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Rate per Category</label>
                    <button type="button" onClick={addRateRow} className="text-sm text-blue-600 hover:underline">+ Add row</button>
                  </div>
                  <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rate (₹)</th><th className="w-10"/></tr></thead>
                    <tbody className="divide-y divide-gray-200">
                      {formData.ratePerCategory.map((r, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.description}
                              onChange={(e) => updateRateRow(idx, 'description', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                              placeholder=""
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={r.rate}
                              onChange={(e) => updateRateRow(idx, 'rate', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                              min="0"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <button type="button" onClick={() => removeRateRow(idx)} className="text-red-600 hover:bg-red-50 rounded p-1">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Tax & Service */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">4. Tax & Service</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SAC Code (default)</label>
                    <input
                      type="text"
                      value={formData.sacCode}
                      onChange={(e) => setFormData((p) => ({ ...p, sacCode: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="e.g. 9985"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code (goods/consumables)</label>
                    <input
                      type="text"
                      value={formData.hsnCode}
                      onChange={(e) => setFormData((p) => ({ ...p, hsnCode: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="e.g. 9983"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Description</label>
                    <textarea
                      value={formData.serviceDescription}
                      onChange={(e) => setFormData((p) => ({ ...p, serviceDescription: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      rows={2}
                      placeholder="Scope of work"
                    />
                  </div>
                </div>
              </section>

              {/* Timelines & Rules */}
              <section>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">5. Timelines & Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleDateInputChange('startDate', e.target.value)}
                      min="1900-01-01"
                      max="9999-12-31"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Billing blocked if today &gt; End Date)</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => handleDateInputChange('endDate', e.target.value)}
                      min="1900-01-01"
                      max="9999-12-31"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Billing Type</label>
                    <select
                      value={formData.billingType}
                      onChange={(e) => setFormData((p) => ({ ...p, billingType: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {BILLING_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select
                      value={formData.billingCycle}
                      onChange={(e) => setFormData((p) => ({ ...p, billingCycle: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {BILLING_CYCLES.map((c) => (
                        <option key={c} value={c}>{c} days</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <input
                      type="text"
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData((p) => ({ ...p, paymentTerms: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="e.g. Net 30 days"
                    />
                  </div>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.revisedPO}
                        onChange={(e) => setFormData((p) => ({ ...p, revisedPO: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Revised PO (triggers warning)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.renewalPending}
                        onChange={(e) => setFormData((p) => ({ ...p, renewalPending: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Renewal Pending (triggers warning)</span>
                    </label>
                  </div>
                </div>
              </section>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              {saveError && <p className="text-sm text-red-600 mr-auto self-center">{saveError}</p>}
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={savePO} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {editId ? 'Update' : 'Save'} PO/WO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View History Modal */}
      {viewHistoryPoId && poForHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact History – {poForHistory.ocNumber}</h3>
            <p className="text-sm text-gray-500 mb-4">Previous coordinators for this PO</p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact Number</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(poForHistory.contactHistoryLog || []).map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-sm">{h.name}</td>
                      <td className="px-3 py-2 text-sm">{h.number}</td>
                      <td className="px-3 py-2 text-sm">{h.from || '–'}</td>
                      <td className="px-3 py-2 text-sm">{h.to || 'Current'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setViewHistoryPoId(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POEntry;
