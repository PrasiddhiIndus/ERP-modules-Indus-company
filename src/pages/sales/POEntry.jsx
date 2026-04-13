import React, { useState, useMemo, useEffect } from 'react';
import { FileCheck, Plus, Search, Pencil, Trash2, History, Send, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { useAuth } from '../../contexts/AuthContext';
import { ROLES } from '../../config/roles';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';

const VERTICALS = ['Manpower', 'Projects', 'AMC', 'R&M', 'M&M'];
const BILLING_TYPES = ['Per Day', 'Monthly', 'Lump Sum'];
const BILLING_CYCLES = ['30', '45', '60'];
const PAGE_SIZE = 10;
const DEFAULT_SAC = '';
const APPROVAL_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent_for_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const SUPPLEMENTARY_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function getApprovalBadge(status) {
  if (status === APPROVAL_STATUS.APPROVED) {
    return { label: 'Approved by Commercial Manager', cls: 'bg-emerald-100 text-emerald-800' };
  }
  if (status === APPROVAL_STATUS.REJECTED) {
    return { label: 'Rejected by Commercial Manager', cls: 'bg-red-100 text-red-700' };
  }
  if (status === APPROVAL_STATUS.SENT) {
    return { label: 'Pending Commercial Manager approval', cls: 'bg-indigo-100 text-indigo-800' };
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

function isAfterContractEnd(endDate) {
  if (!endDate) return false;
  const end = new Date(String(endDate));
  if (Number.isNaN(end.getTime())) return false;
  // consider contract ended only after end date (not on same day)
  const today = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDay.getTime() > endDay.getTime();
}

function ymd(d) {
  return d && String(d).trim() ? String(d).trim() : '';
}

function makeCycle({ poWoNumber, totalContractValue, startDate, endDate, approvedAt } = {}) {
  return {
    po_wo_number: String(poWoNumber || '').trim(),
    total_contract_value: totalContractValue === '' || totalContractValue == null ? null : Number(totalContractValue) || 0,
    start_date: ymd(startDate),
    end_date: ymd(endDate),
    approved_at: approvedAt || null,
  };
}

function getLatestCycle(cycles, fallback) {
  const arr = Array.isArray(cycles) ? cycles.filter(Boolean) : [];
  if (arr.length) return arr[arr.length - 1];
  return fallback;
}

function validateGSTIN(value) {
  if (!value || value.length !== 15) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value.toUpperCase());
}

function extractStateGuess(placeOfSupply, billingAddress) {
  const raw = String(placeOfSupply || '').trim() || String(billingAddress || '').trim();
  if (!raw) return '';
  // naive: take last comma-separated token as state-ish
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

function isGujaratSupply(placeOfSupply, billingAddress) {
  const s = extractStateGuess(placeOfSupply, billingAddress);
  if (!s) return true; // don't block when state is unknown
  return s.includes('gujarat') || s === 'gj';
}

function validateGstSupplyTypeForState(placeOfSupply, billingAddress, gstSupplyType) {
  const st = String(gstSupplyType || 'intra').trim().toLowerCase();
  const stateGuess = extractStateGuess(placeOfSupply, billingAddress);
  if (!stateGuess) return 'Select Place of supply before choosing GST type.';
  const isGuj = stateGuess.includes('gujarat') || stateGuess === 'gj';

  // SEZ 0% is allowed regardless of state.
  if (st === 'sez_zero') return '';

  // Gujarat => intra only. Outside Gujarat => inter only.
  if (isGuj && st === 'inter') {
    return 'Place of supply is Gujarat. Select CGST+SGST (same state) instead of IGST.';
  }
  if (!isGuj && st === 'intra') {
    return 'Client supply state is outside Gujarat. Select IGST (other state) or 0% GST (SEZ) instead of CGST+SGST.';
  }
  return '';
}

const INDIA_STATES_UT = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const GST_SUPPLY_TYPES = [
  { value: 'intra', label: 'CGST + SGST (same state)' },
  { value: 'inter', label: 'IGST (other state)' },
  { value: 'sez_zero', label: '0% GST (SEZ / nil rated)' },
];

const initialForm = {
  siteId: '', locationName: '', legalName: '', billingAddress: '', shippingAddress: '', placeOfSupply: '', gstin: '',
  currentCoordinator: '', contactNumber: '', ocNumber: '', vertical: 'BILL', ocSeries: '1',
  vendorCode: '',
  poWoNumber: '', ratePerCategory: [{ description: '', qty: '', rate: '', penalty: '' }],
  totalContractValue: '', sacCode: DEFAULT_SAC, hsnCode: '', serviceDescription: '',
  renewalCycles: [],
  newCyclePoWoNumber: '', newCycleTotalContractValue: '',
  startDate: '', endDate: '', billingType: '', billingCycle: '30', remarks: '',
  monthlyDutyQtyMode: '',
  lumpSumBillingMode: '',
  invoiceTermsText: '',
  sellerCin: '', sellerPan: '', msmeRegistrationNo: '', msmeClause: '',
  gstSupplyType: 'intra',
  revisedPO: false, renewalPending: false,
};

const POEntry = () => {
  const { commercialPOs, setCommercialPOs, setInvoices } = useBilling();
  const { userProfile, accessibleModules } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [viewHistoryPoId, setViewHistoryPoId] = useState(null);
  const [gstinError, setGstinError] = useState('');
  const [gstTypeError, setGstTypeError] = useState('');
  const [saveError, setSaveError] = useState('');
  const canApproveCommercialPOs =
    userProfile?.role === ROLES.ADMIN ||
    (userProfile?.role === ROLES.MANAGER && !!accessibleModules?.has('commercial'));

  const requestSupplementaryBill = (po) => {
    if (!po) return;
    if (!isAfterContractEnd(po.endDate || po.end_date)) {
      window.alert('Post-contract billing can be requested only after the contract end date.');
      return;
    }
    const reason = window.prompt('Reason for post-contract billing (optional):', po.supplementaryReason || '') ?? '';
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? {
              ...p,
              supplementaryRequestStatus: SUPPLEMENTARY_STATUS.PENDING,
              supplementaryReason: String(reason || '').trim() || null,
              supplementaryRequestedAt: nowIso,
              updateHistory: Array.isArray(p.updateHistory)
                ? [...p.updateHistory, { at: nowIso, summary: 'Post-contract billing requested' }]
                : [{ at: nowIso, summary: 'Post-contract billing requested' }],
            }
          : p
      )
    );
  };

  const approveSupplementaryBill = (po) => {
    if (!canApproveCommercialPOs || !po) return;
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? {
              ...p,
              supplementaryRequestStatus: SUPPLEMENTARY_STATUS.APPROVED,
              supplementaryApprovedAt: nowIso,
              updateHistory: Array.isArray(p.updateHistory)
                ? [...p.updateHistory, { at: nowIso, summary: 'Post-contract billing approved — bill on this OC using Create Invoice' }]
                : [{ at: nowIso, summary: 'Post-contract billing approved — bill on this OC using Create Invoice' }],
            }
          : p
      )
    );
  };

  const rejectSupplementaryBill = (po) => {
    if (!canApproveCommercialPOs || !po) return;
    const nowIso = new Date().toISOString();
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === po.id
          ? {
              ...p,
              supplementaryRequestStatus: SUPPLEMENTARY_STATUS.REJECTED,
              supplementaryApprovedAt: null,
              updateHistory: Array.isArray(p.updateHistory)
                ? [...p.updateHistory, { at: nowIso, summary: 'Post-contract billing request rejected' }]
                : [{ at: nowIso, summary: 'Post-contract billing request rejected' }],
            }
          : p
      )
    );
  };

  const TextCell = ({ value, className = '' }) => {
    const display = value ?? '';
    return (
      <span className={`block min-w-0 truncate ${className}`} title={typeof display === 'string' ? display : String(display)}>
        {display || '–'}
      </span>
    );
  };

  const MultilineBadgeText = ({ text }) => {
    const t = String(text || '');
    const parts =
      t.includes('Approved by ') ? ['Approved by', t.replace('Approved by ', '')]
      : t.includes('Rejected by ') ? ['Rejected by', t.replace('Rejected by ', '')]
      : t.includes('Pending Commercial Manager approval') ? ['Pending', 'Commercial Manager approval']
      : [t];

    return (
      <span className="block text-center leading-tight whitespace-normal">
        {parts.map((p, i) => (
          <span key={`${p}-${i}`} className="block">
            {p}
          </span>
        ))}
      </span>
    );
  };

  const cleanCellText = (value) => String(value ?? '').replaceAll('|', '').trim();

  const filteredList = useMemo(() => {
    // Hide supplementary/mock POs from PO Entry UI — only manage the parent PO here.
    const base = commercialPOs.filter((p) => !p.isSupplementary);
    if (!searchTerm.trim()) return base;
    const s = searchTerm.toLowerCase();
    return base.filter(
      (p) =>
        p.ocNumber?.toLowerCase().includes(s) ||
        p.poWoNumber?.toLowerCase().includes(s) ||
        p.legalName?.toLowerCase().includes(s) ||
        p.siteId?.toLowerCase().includes(s)
    );
  }, [commercialPOs, searchTerm]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedList = filteredList.slice(start, start + PAGE_SIZE);
  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const nextId = useMemo(() => Math.max(0, ...commercialPOs.map((p) => p.id), 0) + 1, [commercialPOs]);
  const nextSeries = useMemo(() => {
    const fy = getFinancialYear();
    const sameFy = commercialPOs.filter((p) => p.ocNumber && p.ocNumber.includes(fy));
    const nums = sameFy.map((p) => parseInt(p.ocNumber?.split('-').pop() || '0', 10));
    return (Math.max(0, ...nums) + 1).toString().padStart(5, '0');
  }, [commercialPOs]);

  const handleOpenAdd = () => {
    setEditId(null);
    setFormData({ ...initialForm, ocSeries: nextSeries });
    setGstinError('');
    setGstTypeError('');
    setSaveError('');
    setShowForm(true);
  };

  const handleOpenEdit = (po) => {
    setEditId(po.id);
    const cycles = Array.isArray(po.renewalCycles) ? po.renewalCycles : [];
    setFormData({
      siteId: po.siteId || '', locationName: po.locationName || '', legalName: po.legalName || '',
      billingAddress: po.billingAddress || '', shippingAddress: po.shippingAddress || '', placeOfSupply: po.placeOfSupply || '',
      gstin: po.gstin || '', currentCoordinator: po.currentCoordinator || '',
      contactNumber: po.contactNumber || '', ocNumber: po.ocNumber || '',
      vertical: po.vertical || (po.ocNumber && po.ocNumber.split('-')[1]) || 'BILL', ocSeries: (po.ocNumber && po.ocNumber.split('-').pop()) || '1',
      poWoNumber: po.poWoNumber || '',
      renewalCycles: cycles,
      newCyclePoWoNumber: '',
      newCycleTotalContractValue: '',
      vendorCode: po.vendorCode || '',
      ratePerCategory: Array.isArray(po.ratePerCategory) && po.ratePerCategory.length
        ? po.ratePerCategory.map((r) => ({
            description: r.description || r.designation || '',
            qty: r.qty ?? '',
            rate: r.rate ?? '',
            penalty: r.penalty ?? r.category_penalty ?? '',
          }))
        : [{ description: '', qty: '', rate: '', penalty: '' }],
      totalContractValue: po.totalContractValue ?? '', sacCode: po.sacCode || DEFAULT_SAC, hsnCode: po.hsnCode || '',
      serviceDescription: po.serviceDescription || '', startDate: po.startDate || '', endDate: po.endDate || '',
      billingType: po.billingType || 'Monthly', billingCycle: String(po.billingCycle || '30'), remarks: po.remarks || po.paymentTerms || '',
      monthlyDutyQtyMode:
        po.billingType === 'Monthly'
          ? (po.monthlyDutyQtyMode || po.monthly_duty_qty_mode || 'po_geometry')
          : '',
      lumpSumBillingMode:
        po.billingType === 'Lump Sum'
          ? (() => {
              const m = String(po.lumpSumBillingMode || po.lump_sum_billing_mode || 'normal').toLowerCase();
              if (m === 'fire_tender') return 'truck';
              return po.lumpSumBillingMode || po.lump_sum_billing_mode || 'normal';
            })()
          : '',
      invoiceTermsText: po.invoiceTermsText || '',
      sellerCin: po.sellerCin || '',
      sellerPan: po.sellerPan || '',
      msmeRegistrationNo: po.msmeRegistrationNo || '',
      msmeClause: po.msmeClause || '',
      gstSupplyType: po.gstSupplyType || 'intra',
      revisedPO: !!po.revisedPO, renewalPending: !!po.renewalPending,
      approvalStatus: po.approvalStatus || APPROVAL_STATUS.DRAFT,
    });
    setGstinError('');
    setGstTypeError('');
    setSaveError('');
    setShowForm(true);
  };

  const handleGstinBlur = () => {
    if (formData.gstin && !validateGSTIN(formData.gstin)) setGstinError('GSTIN must be 15-digit alphanumeric (e.g. 27AABCU9603R1ZM)');
    else setGstinError('');
  };

  const addRateRow = () =>
    setFormData((prev) => ({
      ...prev,
      ratePerCategory: [...prev.ratePerCategory, { description: '', qty: '', rate: '', penalty: '' }],
    }));
  const updateRateRow = (idx, field, value) =>
    setFormData((prev) => ({ ...prev, ratePerCategory: prev.ratePerCategory.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }));
  const removeRateRow = (idx) => {
    if (formData.ratePerCategory.length <= 1) return;
    setFormData((prev) => ({ ...prev, ratePerCategory: prev.ratePerCategory.filter((_, i) => i !== idx) }));
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

  const approvePO = (id) => {
    if (!canApproveCommercialPOs) return;
    const nowIso = new Date().toISOString();
    const prev = commercialPOs;
    const target = prev.find((p) => p.id === id);
    if (!target) return;

    const next = prev.map((p) => {
      if (p.id !== id) return p;
      const cycles = Array.isArray(p.renewalCycles) ? [...p.renewalCycles] : [];
      const latestIdx = cycles.length ? cycles.length - 1 : -1;
      const latest = latestIdx >= 0 ? { ...cycles[latestIdx] } : null;
      if (latest && !latest.approved_at) {
        latest.approved_at = nowIso;
        cycles[latestIdx] = latest;
      }
      const hasActiveRenewal = latest && latest.po_wo_number && latest.total_contract_value != null;
      return {
        ...p,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        ...(cycles.length ? { renewalCycles: cycles } : {}),
        ...(hasActiveRenewal
          ? {
              poWoNumber: latest.po_wo_number,
              totalContractValue: Number(latest.total_contract_value) || 0,
              startDate: latest.start_date || p.startDate,
              endDate: latest.end_date || p.endDate,
              supplementaryRequestStatus: null,
              supplementaryReason: null,
              supplementaryRequestedAt: null,
              supplementaryApprovedAt: null,
            }
          : {}),
        updateHistory: Array.isArray(p.updateHistory)
          ? [...p.updateHistory, { at: nowIso, summary: hasActiveRenewal ? `PO renewed and approved (${latest.po_wo_number})` : 'PO approved by Commercial Manager' }]
          : [{ at: nowIso, summary: hasActiveRenewal ? `PO renewed and approved (${latest?.po_wo_number || ''})` : 'PO approved by Commercial Manager' }],
      };
    });

    const latest = getLatestCycle(target?.renewalCycles, null);
    let nextWithSupp = next;
    if (latest?.po_wo_number && latest?.total_contract_value != null) {
      nextWithSupp = next.map((p) => {
        if (!p.isSupplementary) return p;
        if (String(p.supplementaryParentPoId || '') !== String(id)) return p;
        return {
          ...p,
          poWoNumber: latest.po_wo_number,
          totalContractValue: Number(latest.total_contract_value) || 0,
          startDate: latest.start_date || p.startDate,
          endDate: latest.end_date || p.endDate,
          updateHistory: Array.isArray(p.updateHistory)
            ? [...p.updateHistory, { at: nowIso, summary: `Legacy supplementary row aligned to renewed PO/WO ${latest.po_wo_number}` }]
            : [{ at: nowIso, summary: `Legacy supplementary row aligned to renewed PO/WO ${latest.po_wo_number}` }],
        };
      });

      const legacySupp = prev.find(
        (p) => p.isSupplementary && String(p.supplementaryParentPoId || '') === String(id)
      );
      setInvoices((invs) =>
        invs.map((inv) => {
          const parentMatch = String(inv.poId) === String(id);
          const legacySuppMatch = legacySupp && String(inv.poId) === String(legacySupp.id);
          if (!parentMatch && !legacySuppMatch) return inv;
          const mockPoHit = typeof inv.poWoNumber === 'string' && inv.poWoNumber.includes('-SUPP-');
          const shouldRoll = legacySuppMatch || inv.isPostContractBuffer || (parentMatch && mockPoHit);
          if (!shouldRoll) return inv;
          return {
            ...inv,
            poId: id,
            poWoNumber: latest.po_wo_number,
            billingDurationFrom: latest.start_date || inv.billingDurationFrom,
            billingDurationTo: latest.end_date || inv.billingDurationTo,
            isPostContractBuffer: false,
            updated_at: nowIso,
          };
        })
      );
    }

    setCommercialPOs(nextWithSupp);
  };

  const rejectPO = (id) => {
    if (!canApproveCommercialPOs) return;
    setCommercialPOs((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              approvalStatus: APPROVAL_STATUS.REJECTED,
            }
          : p
      )
    );
  };

  const savePO = () => {
    if (formData.gstin && !validateGSTIN(formData.gstin)) { setGstinError('Fix GSTIN before saving'); return; }
    // Validate GST type selection against state
    const gstErr = validateGstSupplyTypeForState(formData.placeOfSupply, formData.billingAddress, formData.gstSupplyType);
    if (gstErr) {
      setGstTypeError(gstErr);
      return;
    }
    setGstTypeError('');
    const trimmedOcNumber = (formData.ocNumber || '').trim();
    const trimmedPoWoNumber = (formData.poWoNumber || '').trim();
    const locNorm = (formData.locationName || '').trim().toLowerCase();
    const siteNorm = (formData.siteId || '').trim().toLowerCase();
    const hasDuplicatePO = commercialPOs.some((p) => {
      if (editId && p.id === editId) return false;
      const samePoWo = trimmedPoWoNumber && (p.poWoNumber || '').trim().toLowerCase() === trimmedPoWoNumber.toLowerCase();
      if (!samePoWo) return false;
      return true;
    });
    if (hasDuplicatePO) {
      setSaveError('Duplicate PO/WO Number is not allowed.');
      return;
    }
    const ocNum = trimmedOcNumber;
    const rates = formData.ratePerCategory.map((r) => ({
      description: (r.description || '').trim() || 'Other',
      qty: Number(r.qty) || 0,
      rate: Number(r.rate) || 0,
      penalty:
        formData.billingType === 'Lump Sum' && formData.lumpSumBillingMode === 'penalty'
          ? Math.max(0, Number(r.penalty) || 0)
          : 0,
    }));
    const totalVal = Number(formData.totalContractValue) || 0;
    const prevPo = editId ? commercialPOs.find((p) => p.id === editId) : null;
    const newId = editId ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}`);
    const nowIso = new Date().toISOString();
    const historyPrev = Array.isArray(prevPo?.updateHistory) ? [...prevPo.updateHistory] : [];
    if (editId && prevPo) {
      historyPrev.push({
        at: nowIso,
        summary: 'PO/WO updated — requires Commercial approval again',
      });
    }
    const po = {
      id: newId, siteId: formData.siteId.trim() || `SITE-${String(newId).slice(0, 8)}`,
      locationName: formData.locationName.trim() || formData.legalName, legalName: formData.legalName.trim(),
      billingAddress: formData.billingAddress.trim(),
      shippingAddress: formData.shippingAddress.trim(),
      placeOfSupply: formData.placeOfSupply.trim(),
      gstin: formData.gstin.trim().toUpperCase(),
      currentCoordinator: formData.currentCoordinator.trim(), contactNumber: formData.contactNumber.trim(),
      vendorCode: (formData.vendorCode || '').trim(),
      gstSupplyType: formData.gstSupplyType || 'intra',
      contactHistoryLog: editId ? (commercialPOs.find((p) => p.id === editId)?.contactHistoryLog || [])
        : [{ name: formData.currentCoordinator.trim(), number: formData.contactNumber.trim(), from: formData.startDate || new Date().toISOString().slice(0, 10), to: null }],
      ocNumber: ocNum, ocSeries: formData.ocSeries || '1', vertical: (formData.ocNumber && formData.ocNumber.split('-')[1]) || formData.vertical || 'BILL',
      poWoNumber: formData.poWoNumber.trim(),
      renewalCycles: Array.isArray(formData.renewalCycles) ? formData.renewalCycles : [],
      ratePerCategory: rates.length ? rates : [{ description: 'Other', qty: 0, rate: 0, penalty: 0 }], totalContractValue: totalVal,
      sacCode: formData.sacCode.trim() || DEFAULT_SAC, hsnCode: formData.hsnCode.trim(), serviceDescription: formData.serviceDescription.trim(),
      startDate: formData.startDate || '', endDate: formData.endDate || '', billingType: formData.billingType,
      billingCycle: Number(formData.billingCycle) || 30, remarks: formData.remarks.trim(),
      monthlyDutyQtyMode: formData.billingType === 'Monthly' ? (formData.monthlyDutyQtyMode || null) : null,
      lumpSumBillingMode: formData.billingType === 'Lump Sum' ? (formData.lumpSumBillingMode || null) : null,
      invoiceTermsText: formData.invoiceTermsText.trim(),
      sellerCin: (formData.sellerCin || '').trim(),
      sellerPan: (formData.sellerPan || '').trim(),
      msmeRegistrationNo: (formData.msmeRegistrationNo || '').trim(),
      msmeClause: (formData.msmeClause || '').trim(),
      revisedPO: formData.revisedPO, renewalPending: formData.renewalPending,
      status: formData.endDate && new Date(formData.endDate) < new Date() ? 'expired' : 'active',
      approvalStatus: editId ? APPROVAL_STATUS.DRAFT : (prevPo?.approvalStatus || APPROVAL_STATUS.DRAFT),
      approvalSentAt: editId ? null : (prevPo?.approvalSentAt || null),
      updateHistory: editId ? historyPrev : [],
      // Preserve supplementary workflow fields on edit
      isSupplementary: !!prevPo?.isSupplementary,
      supplementaryParentPoId: prevPo?.supplementaryParentPoId || null,
      supplementarySeq: prevPo?.supplementarySeq || null,
      supplementaryRequestStatus: prevPo?.supplementaryRequestStatus || null,
      supplementaryReason: prevPo?.supplementaryReason || null,
      supplementaryRequestedAt: prevPo?.supplementaryRequestedAt || null,
      supplementaryApprovedAt: prevPo?.supplementaryApprovedAt || null,
    };

    // If user entered a new cycle (only allowed after contract end), append it (pending approval gate is via PO approval flow).
    const canAddNewCycle = isAfterContractEnd(formData.endDate);
    const hasNewCycle = String(formData.newCyclePoWoNumber || '').trim() && (formData.newCycleTotalContractValue !== '' && formData.newCycleTotalContractValue != null);
    if (canAddNewCycle && hasNewCycle) {
      po.renewalCycles = [
        ...(po.renewalCycles || []),
        makeCycle({
          poWoNumber: formData.newCyclePoWoNumber,
          totalContractValue: formData.newCycleTotalContractValue,
          startDate: formData.startDate,
          endDate: formData.endDate,
          approvedAt: null,
        }),
      ];
    }
    if (editId) setCommercialPOs((prev) => prev.map((p) => (p.id === editId ? po : p)));
    else setCommercialPOs((prev) => [...prev, po]);
    setSaveError('');
    setShowForm(false);
    setFormData(initialForm);
  };

  const deletePO = (id) => { if (window.confirm('Delete this PO? Billing may be affected.')) setCommercialPOs((prev) => prev.filter((p) => p.id !== id)); };
  const poForHistory = viewHistoryPoId ? commercialPOs.find((p) => p.id === viewHistoryPoId) : null;

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-3 rounded-lg shrink-0"><FileCheck className="w-6 h-6 text-blue-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">PO / WO Management</h2>
          </div>
        </div>
        <button type="button" onClick={handleOpenAdd} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
          <Plus className="h-5 w-5" /> Add PO/WO
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="Search by OC, PO number, client, site..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="rounded-xl border border-gray-300 overflow-hidden bg-[#f2f6ff]">
        <div className="p-2">
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="w-full max-w-full min-w-0 overflow-x-hidden">
              <table className="w-full min-w-0 max-w-full table-fixed border-collapse">
                <thead>
                  <tr>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[26%] md:w-[18%] lg:w-[17%]">
                      OC Number
                    </th>
                    <th className="hidden md:table-cell px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[16%] lg:w-[15%]">
                      Site / Location
                    </th>
                    <th className="hidden lg:table-cell px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[19%]">
                      Client (Legal Name)
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[14%] md:w-[12%] lg:w-[10%]">
                      PO/WO
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[13%] md:w-[11%] lg:w-[11%]">
                      Start-End
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[28%] md:w-[24%] lg:w-[15%]">
                      Status
                    </th>
                    <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center text-[10px] sm:text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] min-w-0 w-[19%] md:w-[19%] lg:w-[13%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {paginatedList.map((po) => {
                    const siteLocation = [po.siteId, po.locationName].filter(Boolean).join(' – ');
                    const approval = getApprovalBadge(po.approvalStatus);
                    const startDateFmt =
                      formatDateDdMmYyyy(cleanCellText(po.startDate)) || '–';
                    const endDateFmt = formatDateDdMmYyyy(cleanCellText(po.endDate)) || '–';
                    return (
                      <tr key={po.id} className="hover:bg-gray-50 align-top">
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-900 min-w-0 text-center">
                          <TextCell
                            value={po.ocNumber}
                            className="text-center font-semibold font-mono"
                          />
                        </td>
                        <td className="hidden md:table-cell px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                          <TextCell value={siteLocation} className="text-center" />
                        </td>
                        <td className="hidden lg:table-cell px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 min-w-0 text-center">
                          <TextCell value={po.legalName} className="text-center" />
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 text-center">
                          <TextCell value={po.poWoNumber} className="text-center" />
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5 leading-none text-center min-w-0">
                            <span
                              className="font-mono tabular-nums tracking-tight truncate max-w-full"
                              title={po.startDate ? formatDateDdMmYyyy(cleanCellText(po.startDate)) || String(po.startDate) : ''}
                            >
                              {startDateFmt}
                            </span>
                            <span className="text-gray-400 select-none font-mono text-[9px] leading-none">
                              -
                            </span>
                            <span
                              className="font-mono tabular-nums tracking-tight truncate max-w-full"
                              title={po.endDate ? formatDateDdMmYyyy(cleanCellText(po.endDate)) || String(po.endDate) : ''}
                            >
                              {endDateFmt}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs text-gray-700 text-center">
                          <div className="flex flex-col items-center justify-center gap-1 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center px-1.5 py-1 text-[9px] sm:text-[10.5px] font-semibold rounded-full ${approval.cls} whitespace-normal text-center leading-tight max-w-full`}
                              title={approval.label}
                            >
                              <MultilineBadgeText text={approval.label} />
                            </span>
                            {(po.revisedPO || po.renewalPending) && (
                              <span
                                className="text-[11px] sm:text-xs leading-tight text-center"
                                title={`${po.revisedPO ? 'PO Updated' : ''}${po.revisedPO && po.renewalPending ? ' · ' : ''}${po.renewalPending ? 'Renewal Due' : ''}`}
                              >
                                {po.revisedPO && <span className="block text-amber-700 font-semibold">PO Updated</span>}
                                {po.renewalPending && <span className="block text-orange-700 font-semibold">Renewal Due</span>}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 sm:px-2 py-1.5 text-center min-w-0">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {!po.isSupplementary && (
                              <>
                                {po.supplementaryRequestStatus === SUPPLEMENTARY_STATUS.PENDING ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled
                                      className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 opacity-80 cursor-not-allowed"
                                      title="Post-contract billing request pending"
                                    >
                                      S
                                    </button>
                                    {canApproveCommercialPOs ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => approveSupplementaryBill(po)}
                                          className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                          title="Approve post-contract billing"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => rejectSupplementaryBill(po)}
                                          className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                          title="Reject post-contract billing request"
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : null}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => requestSupplementaryBill(po)}
                                    disabled={!isAfterContractEnd(po.endDate || po.end_date)}
                                    className={[
                                      'inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border',
                                      isAfterContractEnd(po.endDate || po.end_date)
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                        : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed',
                                    ].join(' ')}
                                    title={
                                      isAfterContractEnd(po.endDate || po.end_date)
                                        ? 'Request post-contract billing (after contract end)'
                                        : 'Available only after contract end date'
                                    }
                                  >
                                    S
                                  </button>
                                )}
                              </>
                            )}
                            {po.approvalStatus === APPROVAL_STATUS.DRAFT && (
                              <button
                                type="button"
                                onClick={() => sendToApproval(po.id)}
                                className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                title="Send to approval"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            {canApproveCommercialPOs && po.approvalStatus === APPROVAL_STATUS.SENT && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approvePO(po.id)}
                                  className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  title="Commercial Manager Approve"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectPO(po.id)}
                                  className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                  title="Commercial Manager Reject"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button type="button" onClick={() => setViewHistoryPoId(po.id)} className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100" title="View History"><History className="w-4 h-4" /></button>
                            <button type="button" onClick={() => handleOpenEdit(po)} className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100" title="Edit"><Pencil className="w-4 h-4" /></button>
                            <button type="button" onClick={() => deletePO(po.id)} className="inline-flex items-center justify-center w-6.5 h-6.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredList.length === 0 && <div className="p-8 text-center text-gray-500">No PO/WO found. Add one to start.</div>}
          </div>
        </div>
      </div>

      {filteredList.length > 0 && (
        <div className="px-4 py-3 border border-gray-300 border-t-0 rounded-b-xl bg-gray-50 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            Showing <span className="font-medium">{start + 1}</span>–
            <span className="font-medium">{Math.min(start + PAGE_SIZE, filteredList.length)}</span> of{' '}
            <span className="font-medium">{filteredList.length}</span> PO{filteredList.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage <= 1}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-700">
              Page <span className="font-medium">{safePage}</span> of <span className="font-medium">{totalPages}</span>
            </span>
            <button
              type="button"
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-start justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 leading-tight">{editId ? 'Edit PO/WO' : 'Add PO/WO'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Fill in the client, PO details, and billing rules.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-5 bg-gray-50">
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900">1. Client Identity</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Legal Name (for GST)</label><input type="text" value={formData.legalName} onChange={(e) => setFormData((p) => ({ ...p, legalName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Full legal name" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Billing Address (with State)</label><input type="text" value={formData.billingAddress} onChange={(e) => { const v = e.target.value; setFormData((p) => ({ ...p, billingAddress: v })); const msg = validateGstSupplyTypeForState(formData.placeOfSupply, v, formData.gstSupplyType); setGstTypeError(msg); }} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Full address including State" /></div>
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Consignee / Ship-to address</label><textarea value={formData.shippingAddress} onChange={(e) => setFormData((p) => ({ ...p, shippingAddress: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Leave blank if same as billing address" /></div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Place of supply (invoice)</label>
                    <select
                      value={formData.placeOfSupply}
                      onChange={(e) => {
                        const nextState = e.target.value;
                        setFormData((p) => {
                          const next = { ...p, placeOfSupply: nextState };
                          // Auto-define tax slab based on state selection:
                          // Gujarat => intra (CGST+SGST), else => inter (IGST)
                          if (next.gstSupplyType !== 'sez_zero') {
                            next.gstSupplyType = nextState === 'Gujarat' ? 'intra' : 'inter';
                          }
                          return next;
                        });
                        const msg = validateGstSupplyTypeForState(nextState, formData.billingAddress, formData.gstSupplyType);
                        setGstTypeError(msg);
                        if (msg) window.alert(msg);
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="">Select state/UT…</option>
                      {INDIA_STATES_UT.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Tax type auto-sets to CGST+SGST for Gujarat; IGST for other states (SEZ 0% remains as selected).
                    </p>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">GSTIN (15-digit)</label><input type="text" value={formData.gstin} onChange={(e) => { setFormData((p) => ({ ...p, gstin: e.target.value.toUpperCase() })); setGstinError(''); }} onBlur={handleGstinBlur} maxLength={15} className={`w-full border rounded-lg px-3 py-2 ${gstinError ? 'border-red-500' : 'border-gray-300'}`} placeholder="e.g. 27AABCU9603R1ZM" />{gstinError && <p className="text-red-600 text-xs mt-1">{gstinError}</p>}</div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Site / Location ID</label><input type="text" value={formData.siteId} onChange={(e) => setFormData((p) => ({ ...p, siteId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. SITE-001" /></div>
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Location Name</label><input type="text" value={formData.locationName} onChange={(e) => setFormData((p) => ({ ...p, locationName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                </div>
              </section>
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">2. Contact (POC)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Current Coordinator</label><input type="text" value={formData.currentCoordinator} onChange={(e) => setFormData((p) => ({ ...p, currentCoordinator: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label><input type="text" value={formData.contactNumber} onChange={(e) => setFormData((p) => ({ ...p, contactNumber: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                </div>
              </section>
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">3. PO / Financials</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">OC Number</label><div className="flex gap-2"><input type="text" value={formData.ocNumber} onChange={(e) => setFormData((p) => ({ ...p, ocNumber: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm" /><select value={formData.vertical} onChange={(e) => setFormData((p) => ({ ...p, vertical: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2">{VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}</select></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Vendor Code</label><input type="text" value={formData.vendorCode} onChange={(e) => setFormData((p) => ({ ...p, vendorCode: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Optional" /></div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PO Number (OLD) <span className="text-gray-500 font-normal">({formData.startDate || '—'} to {formData.endDate || '—'})</span>
                    </label>
                    <input
                      type="text"
                      value={formData.poWoNumber}
                      onChange={(e) => setFormData((p) => ({ ...p, poWoNumber: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      disabled={Array.isArray(formData.renewalCycles) && formData.renewalCycles.length > 0 && formData.approvalStatus === APPROVAL_STATUS.APPROVED}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total contract value (OLD) <span className="text-gray-500 font-normal">({formData.startDate || '—'} to {formData.endDate || '—'})</span>
                    </label>
                    <input
                      type="number"
                      value={formData.totalContractValue}
                      onChange={(e) => setFormData((p) => ({ ...p, totalContractValue: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      min="0"
                      disabled={(Array.isArray(formData.renewalCycles) && formData.renewalCycles.length > 0) && formData.approvalStatus === APPROVAL_STATUS.APPROVED}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New PO Number <span className="text-gray-500 font-normal">({formData.startDate || '—'} to {formData.endDate || '—'})</span>
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        value={formData.newCyclePoWoNumber}
                        onChange={(e) => setFormData((p) => ({ ...p, newCyclePoWoNumber: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        placeholder="New PO/WO number (renewal)"
                        disabled={!isAfterContractEnd(formData.endDate)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Total contract value (₹) <span className="text-gray-500 font-normal">({formData.startDate || '—'} to {formData.endDate || '—'})</span>
                    </label>
                    <input
                      type="number"
                      value={formData.newCycleTotalContractValue}
                      onChange={(e) => setFormData((p) => ({ ...p, newCycleTotalContractValue: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      min="0"
                      placeholder="New contract value"
                      disabled={!isAfterContractEnd(formData.endDate)}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      After Commercial approves renewal, buffer-period tax invoices (and any legacy supplementary PO rows) are aligned to this new PO/WO number and contract dates.
                    </p>
                    {!isAfterContractEnd(formData.endDate) ? (
                      <p className="text-[11px] text-amber-700 mt-1">
                        New PO/WO details can be added only after the contract end date.
                      </p>
                    ) : null}
                  </div>
                </div>

                {Array.isArray(formData.renewalCycles) && formData.renewalCycles.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Previous renewal cycles</p>
                    <div className="space-y-1 text-xs text-gray-600">
                      {formData.renewalCycles.map((c, i) => (
                        <div key={i} className="flex flex-wrap gap-x-3 gap-y-1">
                          <span className="font-mono">{c.po_wo_number || '—'}</span>
                          <span>₹{Number(c.total_contract_value || 0).toLocaleString('en-IN')}</span>
                          <span>({c.start_date || '—'} to {c.end_date || '—'})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Rate per Category</label>
                    <button type="button" onClick={addRateRow} className="text-sm text-blue-600 hover:underline">+ Add row</button>
                  </div>
                  <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                        {formData.billingType === 'Lump Sum' && formData.lumpSumBillingMode === 'penalty' ? (
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Penalty (₹)</th>
                        ) : null}
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rate (₹)</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
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
                              value={r.qty}
                              onChange={(e) => updateRateRow(idx, 'qty', e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 w-full"
                              min="0"
                            />
                          </td>
                          {formData.billingType === 'Lump Sum' && formData.lumpSumBillingMode === 'penalty' ? (
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                value={r.penalty ?? ''}
                                onChange={(e) => updateRateRow(idx, 'penalty', e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 w-full"
                                min="0"
                                step="0.01"
                              />
                            </td>
                          ) : null}
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
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">4. Tax & Service</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">GST on supply</label>
                    <select
                      value={formData.gstSupplyType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setFormData((p) => ({ ...p, gstSupplyType: nextType }));
                        const msg = validateGstSupplyTypeForState(formData.placeOfSupply, formData.billingAddress, nextType);
                        setGstTypeError(msg);
                        if (msg) window.alert(msg);
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {GST_SUPPLY_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {gstTypeError && <p className="text-red-600 text-xs mt-1">{gstTypeError}</p>}
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">SAC Code</label><input type="text" value={formData.sacCode} onChange={(e) => setFormData((p) => ({ ...p, sacCode: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label><input type="text" value={formData.hsnCode} onChange={(e) => setFormData((p) => ({ ...p, hsnCode: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Service Description</label><textarea value={formData.serviceDescription} onChange={(e) => setFormData((p) => ({ ...p, serviceDescription: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" rows={2} /></div>
                </div>
              </section>
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">4b. Tax invoice print (from this PO only)</h4>
                <p className="text-xs text-gray-500 mb-3">Terms and ship-to are edited here. Seller CIN, PAN, and MSME details are taken from the standard invoice template (not per PO).</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Terms &amp; conditions (printed on invoice)</label><textarea value={formData.invoiceTermsText} onChange={(e) => setFormData((p) => ({ ...p, invoiceTermsText: e.target.value }))} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm" placeholder="One line per numbered point, or leave blank to use the default template for the PO vertical (BILL / Manpower / …)." /></div>
                </div>
              </section>
              <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">5. Timelines & Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label><input type="date" value={formData.startDate} onChange={(e) => setFormData((p) => ({ ...p, startDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date</label><input type="date" value={formData.endDate} onChange={(e) => setFormData((p) => ({ ...p, endDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" /></div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Billing Type</label>
                    <select
                      value={formData.billingType}
                      onChange={(e) => {
                        const bt = e.target.value;
                        setFormData((p) => ({
                          ...p,
                          billingType: bt,
                          monthlyDutyQtyMode:
                            bt === 'Monthly' ? (p.monthlyDutyQtyMode || 'po_geometry') : '',
                          lumpSumBillingMode:
                            bt === 'Lump Sum' ? (p.lumpSumBillingMode || 'normal') : '',
                        }));
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {BILLING_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Billing cycle (days)</label><select value={formData.billingCycle} onChange={(e) => setFormData((p) => ({ ...p, billingCycle: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">{BILLING_CYCLES.map((c) => <option key={c} value={c}>{c} days</option>)}</select></div>
                  {formData.billingType === 'Monthly' ? (
                    <div className="md:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-800">Monthly billing — quantity rule (pick one)</p>
                      <div className="flex flex-col sm:flex-row flex-wrap gap-4">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.monthlyDutyQtyMode === 'po_geometry'}
                            onChange={() => setFormData((p) => ({ ...p, monthlyDutyQtyMode: 'po_geometry' }))}
                            className="rounded border-gray-300 mt-0.5"
                          />
                          <span className="text-sm text-gray-700">
                            (Actual duty ÷ Authorised duty) × PO quantity = Qty
                          </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.monthlyDutyQtyMode === 'duty_ratio'}
                            onChange={() => setFormData((p) => ({ ...p, monthlyDutyQtyMode: 'duty_ratio' }))}
                            className="rounded border-gray-300 mt-0.5"
                          />
                          <span className="text-sm text-gray-700">
                            (Actual duty ÷ Authorised duty) = Qty
                          </span>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {formData.billingType === 'Lump Sum' ? (
                    <div className="md:col-span-2 rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-800">Lump sum billing — layout &amp; calculation (pick one)</p>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.lumpSumBillingMode === 'penalty'}
                            onChange={() => setFormData((p) => ({ ...p, lumpSumBillingMode: 'penalty' }))}
                            className="rounded border-gray-300 mt-0.5"
                          />
                          <span className="text-sm text-gray-700">Penalty column on PO (next to Qty); Rate = (Actual÷Auth)×PO rate − Penalty on invoice</span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.lumpSumBillingMode === 'truck'}
                            onChange={() => setFormData((p) => ({ ...p, lumpSumBillingMode: 'truck' }))}
                            className="rounded border-gray-300 mt-0.5"
                          />
                          <span className="text-sm text-gray-700">Truck rows — add manual Qty×Rate lines on Create Invoice (PO lines keep duty-based rate)</span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.lumpSumBillingMode === 'normal'}
                            onChange={() => setFormData((p) => ({ ...p, lumpSumBillingMode: 'normal' }))}
                            className="rounded border-gray-300 mt-0.5"
                          />
                          <span className="text-sm text-gray-700">Normal lump sum calculation</span>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label><input type="text" value={formData.remarks} onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Enter remarks" /></div>
                  <p className="md:col-span-2 text-xs font-semibold text-gray-700">
                    Select to enable PO updates and Renewal reminders
                  </p>
                  <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2"><input type="checkbox" checked={formData.revisedPO} onChange={(e) => setFormData((p) => ({ ...p, revisedPO: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm text-gray-700">PO Updated</span></label><label className="flex items-center gap-2"><input type="checkbox" checked={formData.renewalPending} onChange={(e) => setFormData((p) => ({ ...p, renewalPending: e.target.checked }))} className="rounded border-gray-300" /><span className="text-sm text-gray-700">Renewal Due</span></label></div>
                </div>
              </section>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 bg-white sticky bottom-0">
              {saveError && <p className="text-sm text-red-600 mr-auto self-center">{saveError}</p>}
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={savePO} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editId ? 'Update' : 'Save'} PO/WO</button>
            </div>
          </div>
        </div>
      )}
      {viewHistoryPoId && poForHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">History – {poForHistory.ocNumber}</h3>
            <p className="text-sm font-medium text-gray-700 mb-2">PO update log</p>
            <ul className="text-sm text-gray-600 list-disc pl-5 mb-4 space-y-1">
              {(poForHistory.updateHistory || []).length === 0 && <li className="list-none text-gray-400">No PO updates recorded yet.</li>}
              {(poForHistory.updateHistory || []).map((h, i) => (
                <li key={i}><span className="font-mono text-xs">{h.at ? new Date(h.at).toLocaleString('en-IN') : '–'}</span> — {h.summary || '—'}</li>
              ))}
            </ul>
            <p className="text-sm font-medium text-gray-700 mb-2">Contact history</p>
            <div className="overflow-x-auto"><table className="min-w-full border border-gray-200"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact Number</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th></tr></thead><tbody className="divide-y divide-gray-200">{(poForHistory.contactHistoryLog || []).map((h, i) => (<tr key={i}><td className="px-3 py-2 text-sm">{h.name}</td><td className="px-3 py-2 text-sm">{h.number}</td><td className="px-3 py-2 text-sm">{h.from || '–'}</td><td className="px-3 py-2 text-sm">{h.to || 'Current'}</td></tr>))}</tbody></table></div>
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setViewHistoryPoId(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POEntry;
