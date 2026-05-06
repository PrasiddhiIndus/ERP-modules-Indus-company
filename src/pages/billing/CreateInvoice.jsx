import React, { useEffect, useMemo, useState, useRef } from 'react';
import { FileText, Upload, PlusCircle, X, Eye, Pencil, ChevronLeft, ChevronRight, Ruler } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useBilling } from '../../contexts/BillingContext';
import { roundInvoiceAmount, normalizeGstSupplyType } from '../../utils/invoiceRound';
import {
  formatInvoiceAmountInWords,
  resolveTermsLines,
  INVOICE_BANK_DETAILS,
  INVOICE_JURISDICTION,
  INVOICE_LETTERHEAD_FOOTER,
  INVOICE_LETTERHEAD_STRIP_COLOR,
  INVOICE_SELLER_TEMPLATE,
} from '../../utils/taxInvoicePdf';
import { INDUS_LOGO_SRC } from '../../constants/branding.js';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import RequestCnDnApprovalSection from './components/RequestCnDnApprovalSection';
import { resolveBuyerStateAndPin } from '../../utils/gstStatePin';

const getFinancialYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y}` : `${y - 1}`;
};

const generateTaxInvoiceNumber = (sequence) => {
  const y = getFinancialYear();
  const seq = String(sequence).padStart(4, '0');
  return `INV-${y}-${seq}`;
};

function getNextTaxInvoiceSequence(invoices) {
  const fy = String(getFinancialYear());
  let maxSeq = 0;
  (Array.isArray(invoices) ? invoices : []).forEach((inv) => {
    const raw = String(inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '').trim();
    const m = raw.match(/^INV-(\d{4})-(\d{4,})$/i);
    if (!m) return;
    const [, year, seqText] = m;
    if (year !== fy) return;
    const seq = Number(seqText);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  });
  return maxSeq + 1;
}

/** Proforma series — separate from INV-* tax invoice numbers (same financial year index). */
function generateProformaInvoiceNumber(sequence) {
  const y = getFinancialYear();
  const seq = String(sequence).padStart(4, '0');
  return `PFI-${y}-${seq}`;
}

function getNextProformaSequence(invoices) {
  const fy = String(getFinancialYear());
  let maxSeq = 0;
  (Array.isArray(invoices) ? invoices : []).forEach((inv) => {
    const raw = String(inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '').trim();
    const m = raw.match(/^PFI-(\d{4})-(\d{4,})$/i);
    if (!m) return;
    const [, year, seqText] = m;
    if (year !== fy) return;
    const seq = Number(seqText);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  });
  return maxSeq + 1;
}

const APPROVAL_STATUS_SENT = 'sent_for_approval';
const APPROVAL_STATUS_APPROVED = 'approved';

const PO_TABLE_PAGE_SIZE = 8;
const BILLING_TABS_MANPOWER = [
  { id: 'Per Day', label: 'Daily' },
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Lump Sum', label: 'Lump Sum' },
];

const BILLING_TABS_RM = [
  { id: 'Service', label: 'Service' },
  { id: 'Supply', label: 'Supply' },
];

const CREATE_PAGE_TABS = [
  { id: 'select-po', label: '1. Select PO/WO (sent or approved)' },
  { id: 'cndn', label: 'Credit / Debit note — request approval' },
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeArrivedQty(poQty, actualDuty, authorizedDuty) {
  const po = safeNumber(poQty);
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  if (po <= 0 || act <= 0 || auth <= 0) return 0;
  return round3((po * act) / auth);
}

function computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths) {
  const po = safeNumber(poQty);
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  const months = safeNumber(numberOfMonths);
  if (po <= 0 || act <= 0 || auth <= 0 || months <= 0) return 0;
  return round3(((act / auth) * (po / months)));
}

function computeDutyRatioQty(actualDuty, authorizedDuty) {
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  if (act <= 0 || auth <= 0) return 0;
  return round3(act / auth);
}

/** Lump sum PO lines: Rate = (actual/auth)×PO rate [− category penalty if penalty mode]. */
function computeLumpSumEffectiveRate(poRate, actualDuty, authorizedDuty, categoryPenalty, subtractPenalty) {
  const pr = safeNumber(poRate);
  const act = safeNumber(actualDuty);
  const auth = safeNumber(authorizedDuty);
  if (pr <= 0 || act <= 0 || auth <= 0) return 0;
  const ratio = act / auth;
  let r = round2(pr * ratio);
  if (subtractPenalty) {
    r = round2(Math.max(0, r - safeNumber(categoryPenalty)));
  }
  return r;
}

function daysInMonth(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return new Date(y, m + 1, 0).getDate();
}

function sumRatePerCategory(po) {
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  return round2(rows.reduce((s, r) => s + (Number(r?.rate) || 0), 0));
}

function getUniqueRateRows(po) {
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  const seen = new Set();
  const unique = [];
  rows.forEach((r) => {
    const description = (r?.description || r?.designation || '').trim();
    const rate = Number(r?.rate) || 0;
    const key = `${description.toLowerCase()}|${rate}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ description, rate });
  });
  return unique;
}

/** Alphabetically sorted unique descriptions from PO rate categories (R&M invoice picker). */
function sortedRmDescriptionOptions(po) {
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  const set = new Set();
  rows.forEach((r) => {
    const d = (r?.description || r?.designation || '').trim();
    if (d) set.add(d);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function findRateCategoryRow(po, description) {
  const d = String(description || '').trim().toLowerCase();
  if (!d || !po) return null;
  const rows = Array.isArray(po.ratePerCategory) ? po.ratePerCategory : [];
  return rows.find((r) => (r.description || r.designation || '').trim().toLowerCase() === d) || null;
}

function formatINRWithSign(n) {
  const v = round2(n);
  const abs = Math.abs(v).toLocaleString('en-IN');
  return v < 0 ? `-₹${abs}` : `₹${abs}`;
}

function formatDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleDateString('en-IN');
  } catch {
    return d;
  }
}

function formatBillingMonth(ymd) {
  if (!ymd) return null;
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]}-${d.getFullYear()}`;
}

function latestRenewalCycle(po) {
  const cycles = Array.isArray(po?.renewalCycles) ? po.renewalCycles : (Array.isArray(po?.renewal_cycles) ? po.renewal_cycles : []);
  if (!cycles.length) return null;
  return cycles[cycles.length - 1] || null;
}

function isAfterContractEndForInvoice(endDate) {
  if (!endDate) return false;
  const end = new Date(String(endDate));
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDay.getTime() > endDay.getTime();
}

function normalizeVerticalValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = {
    manp: 'manpower',
    manpower: 'manpower',
    mp: 'manpower',
    train: 'training',
    trng: 'training',
    training: 'training',
    rm: 'rm',
    mm: 'mm',
    amc: 'amc',
    iev: 'iev',
  };
  return aliases[raw] || raw;
}

function resolveSupplementaryOverrides(po, allPOs) {
  // Apply latest renewal cycle (if any) for parent PO display as well.
  const latestSelf = latestRenewalCycle(po);
  if (!po?.isSupplementary) {
    if (latestSelf?.po_wo_number) {
      return {
        poWoNumber: latestSelf.po_wo_number,
        totalContractValue: latestSelf.total_contract_value != null ? Number(latestSelf.total_contract_value) : (po.totalContractValue ?? 0),
        startDate: latestSelf.start_date || po.startDate,
        endDate: latestSelf.end_date || po.endDate,
      };
    }
    return { poWoNumber: po?.poWoNumber, totalContractValue: po?.totalContractValue, startDate: po?.startDate, endDate: po?.endDate };
  }
  const parentId = po.supplementaryParentPoId || po.supplementary_parent_po_id;
  const parent = (allPOs || []).find((p) => String(p.id) === String(parentId));
  const latest = latestRenewalCycle(parent);
  if (latest?.po_wo_number) {
    return {
      poWoNumber: latest.po_wo_number,
      totalContractValue: latest.total_contract_value != null ? Number(latest.total_contract_value) : (po.totalContractValue ?? 0),
      startDate: latest.start_date || po.startDate,
      endDate: latest.end_date || po.endDate,
    };
  }
  return { poWoNumber: po?.poWoNumber, totalContractValue: po?.totalContractValue, startDate: po?.startDate, endDate: po?.endDate };
}

function sortNewestPoFirst(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const aTs = new Date(a?.updated_at || a?.updatedAt || a?.created_at || a?.createdAt || a?.startDate || 0).getTime() || 0;
    const bTs = new Date(b?.updated_at || b?.updatedAt || b?.created_at || b?.createdAt || b?.startDate || 0).getTime() || 0;
    if (bTs !== aTs) return bTs - aTs;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

const CreateInvoice = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, setInvoices, invoiceDraft, setInvoiceDraft, refreshBilling, billingVerticalFilter } = useBilling();
  const [selectedPoId, setSelectedPoId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]); // { description, hsnSac, quantity, rate, amount }
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [attendanceFiles, setAttendanceFiles] = useState([]); // [{ name, url }]
  const [document2Files, setDocument2Files] = useState([]); // [{ name, url }]
  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const [poPage, setPoPage] = useState(1);
  const [servicePeriodFrom, setServicePeriodFrom] = useState('');
  const [servicePeriodTo, setServicePeriodTo] = useState('');
  const [poSortConfig, setPoSortConfig] = useState({ key: 'created', direction: 'desc' });
  const [activeGeometryRowIdx, setActiveGeometryRowIdx] = useState(null);
  /** Lump sum: opt-in on this invoice to show PO Penalty column and Rate = (Actual÷Auth)×PO rate − Penalty (PO-level penalty mode forces this on). */
  const [lumpSumInvoicePenaltyGeometry, setLumpSumInvoicePenaltyGeometry] = useState(false);
  const [poBillingTab, setPoBillingTab] = useState('Monthly');
  const [createMainTab, setCreateMainTab] = useState('select-po');
  /** tax | proforma — stored as billing.invoice.invoice_kind; all verticals (Manpower, Training, R&M, M&M, AMC, IEV, trucks / lump-sum, etc.) */
  const [invoiceDocumentKind, setInvoiceDocumentKind] = useState('tax');

  const verticalNotSelected = !billingVerticalFilter;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const isRmVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'rm' || v === 'mm' || v === 'amc' || v === 'iev';
  }, [billingVerticalFilter]);
  const isTrainingVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'training';
  }, [billingVerticalFilter]);

  /** M&M vertical only — description dropdown on invoice lines. */
  const isMmOnlyVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'mm';
  }, [billingVerticalFilter]);

  const billingTabs = useMemo(() => (isRmVertical ? BILLING_TABS_RM : BILLING_TABS_MANPOWER), [isRmVertical]);

  useEffect(() => {
    // Keep tab defaults sensible per vertical.
    if (isRmVertical) {
      setPoBillingTab('Service');
      return;
    }
    if (isTrainingVertical) {
      setPoBillingTab('Per Day');
      return;
    }
    setPoBillingTab('Monthly');
  }, [isRmVertical, isTrainingVertical]);

  const billablePOs = useMemo(() => {
    // Show all vertical-matched parent POs so Team-wise dropdown always displays
    // the full table for selected Manpower / Training.
    return sortNewestPoFirst(commercialPOs.filter((p) => !p.isSupplementary));
  }, [commercialPOs]);

  const invoiceByPoId = useMemo(() => {
    const map = new Map();
    (invoices || []).forEach((inv) => {
      const key = String(inv?.poId || '');
      if (!key || map.has(key)) return;
      map.set(key, inv);
    });
    return map;
  }, [invoices]);

  const supplementaryChildByParentId = useMemo(() => {
    const map = new Map();
    (commercialPOs || []).forEach((po) => {
      if (!po?.isSupplementary) return;
      const parentId = String(po?.supplementaryParentPoId || po?.supplementary_parent_po_id || '');
      if (!parentId || map.has(parentId)) return;
      map.set(parentId, po);
    });
    return map;
  }, [commercialPOs]);

  const billablePOsByTab = useMemo(() => {
    if (isTrainingVertical) {
      return billablePOs;
    }
    const tab = String(poBillingTab || '').trim();
    return billablePOs.filter((p) => {
      const bt = String(p.billingType || '').trim();
      return bt === tab;
    });
  }, [billablePOs, poBillingTab, isTrainingVertical]);

  const poTableRows = useMemo(() => {
    return billablePOsByTab.map((po) => {
      const over = resolveSupplementaryOverrides(po, billablePOs);
      const directInvoice = invoiceByPoId.get(String(po.id));
      const legacyChild = supplementaryChildByParentId.get(String(po.id));
      const existingInvoice =
        directInvoice || (legacyChild ? invoiceByPoId.get(String(legacyChild.id)) : null) || null;
      const hasInvoice = !!existingInvoice;
      const dCount = daysInMonth(invoiceDate);
      const rateSum = sumRatePerCategory(po);
      const contract = Number(over.totalContractValue) || 0;
      const expected = round2(rateSum * dCount);
      const remaining = round2(contract - expected);
      const supSt = po.supplementaryRequestStatus || po.supplementary_request_status;
      const postContractBufferOpen =
        !po.isSupplementary && supSt === 'approved' && isAfterContractEndForInvoice(po.endDate || po.end_date);
      const st = String(po.approvalStatus || 'draft').toLowerCase();
      const statusLabel = hasInvoice
        ? 'Created Tax Invoice'
        : st === APPROVAL_STATUS_APPROVED
          ? 'Approved'
          : st === APPROVAL_STATUS_SENT
            ? 'Sent to approval'
            : st === 'rejected'
              ? 'Rejected'
              : 'Draft';

      return {
        ...po,
        poWoNumber: over.poWoNumber ?? po.poWoNumber,
        totalContractValue: over.totalContractValue ?? po.totalContractValue,
        startDate: over.startDate ?? po.startDate,
        endDate: over.endDate ?? po.endDate,
        postContractBufferOpen,
        statusLabel,
        hasInvoice,
        existingInvoiceId: existingInvoice?.id || null,
        _calc: { days: dCount, rateSum, contract, expected, remaining },
      };
    });
  }, [billablePOsByTab, billablePOs, invoiceByPoId, supplementaryChildByParentId, invoiceDate]);

  const sortedPoTableRows = useMemo(() => {
    const dir = poSortConfig.direction === 'asc' ? 1 : -1;
    return [...poTableRows].sort((a, b) => {
      const valueFor = (row) => {
        switch (poSortConfig.key) {
          case 'ocNumber': return String(row.ocNumber || '').toLowerCase();
          case 'siteLocation': return String([row.siteId, row.locationName].filter(Boolean).join(' ') || '').toLowerCase();
          case 'poWo': return String(row.poWoNumber || '').toLowerCase();
          case 'remaining': return Number(row?._calc?.remaining || 0);
          case 'status': return String(row.statusLabel || '').toLowerCase();
          default: return new Date(row.updated_at || row.updatedAt || row.created_at || row.createdAt || row.startDate || 0).getTime() || 0;
        }
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [poTableRows, poSortConfig]);

  const renderSortIndicator = (key) => {
    const active = poSortConfig.key === key;
    const ascActive = active && poSortConfig.direction === 'asc';
    const descActive = active && poSortConfig.direction === 'desc';
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
        <span className={ascActive ? 'text-emerald-400' : 'text-slate-300'}>▲</span>
        <span className={descActive ? 'text-rose-400' : 'text-slate-300'}>▼</span>
      </span>
    );
  };
  const togglePoSort = (key) => {
    setPoSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  useEffect(() => {
    setPoPage(1);
  }, [sortedPoTableRows.length, poSortConfig]);

  const poTotalPages = Math.max(1, Math.ceil(sortedPoTableRows.length / PO_TABLE_PAGE_SIZE));
  const poSafePage = Math.min(Math.max(1, poPage), poTotalPages);
  const poStart = (poSafePage - 1) * PO_TABLE_PAGE_SIZE;
  const poPaginatedRows = sortedPoTableRows.slice(poStart, poStart + PO_TABLE_PAGE_SIZE);

  const goToPoPage = (p) => setPoPage(Math.min(Math.max(1, p), poTotalPages));

  const selectedPO = useMemo(
    () => billablePOs.find((p) => String(p.id) === String(selectedPoId) || p.siteId === selectedPoId),
    [billablePOs, selectedPoId]
  );

  const editingInvoice = useMemo(() => {
    if (!invoiceDraft?.invoiceId) return null;
    return invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) || null;
  }, [invoiceDraft, invoices]);

  const displayPO = useMemo(() => {
    if (selectedPO) {
      const over = resolveSupplementaryOverrides(selectedPO, billablePOs);
      return {
        ...selectedPO,
        poWoNumber: over.poWoNumber ?? selectedPO.poWoNumber,
        totalContractValue: over.totalContractValue ?? selectedPO.totalContractValue,
        startDate: over.startDate ?? selectedPO.startDate,
        endDate: over.endDate ?? selectedPO.endDate,
      };
    }
    if (invoiceDraft?.mode === 'edit' && editingInvoice) {
      const linkedPo =
        editingInvoice.poId != null
          ? commercialPOs.find((p) => String(p.id) === String(editingInvoice.poId))
          : null;
      const gstRaw =
        editingInvoice.gstSupplyType ||
        editingInvoice.gst_supply_type ||
        linkedPo?.gstSupplyType ||
        linkedPo?.gst_supply_type;
      return {
        id: editingInvoice.poId,
        siteId: editingInvoice.siteId,
        locationName: linkedPo?.locationName || editingInvoice.clientLegalName || '',
        ocNumber: editingInvoice.ocNumber,
        poWoNumber: editingInvoice.poWoNumber,
        legalName: linkedPo?.legalName || editingInvoice.clientLegalName,
        billingAddress: linkedPo?.billingAddress || editingInvoice.clientAddress,
        shippingAddress:
          linkedPo?.shippingAddress ||
          linkedPo?.shipping_address ||
          editingInvoice.clientShippingAddress ||
          editingInvoice.client_shipping_address ||
          '',
        placeOfSupply:
          linkedPo?.placeOfSupply ||
          linkedPo?.place_of_supply ||
          editingInvoice.placeOfSupply ||
          editingInvoice.place_of_supply ||
          '',
        gstin: linkedPo?.gstin || editingInvoice.gstin,
        hsnCode: editingInvoice.hsnSac,
        sacCode: editingInvoice.hsnSac,
        billingType: editingInvoice.billingType || 'Monthly',
        paymentTerms: editingInvoice.paymentTerms,
        invoiceTermsText: editingInvoice.termsCustomText || editingInvoice.terms_custom_text || '',
        sellerCin: editingInvoice.sellerCin || editingInvoice.seller_cin || '',
        sellerPan: editingInvoice.sellerPan || editingInvoice.seller_pan || '',
        msmeRegistrationNo: editingInvoice.msmeRegistrationNo || editingInvoice.msme_registration_no || '',
        msmeClause: editingInvoice.msmeClause || editingInvoice.msme_clause || '',
        billingCycle: 30,
        gstSupplyType: gstRaw,
        ratePerCategory: linkedPo?.ratePerCategory || [],
        renewalCycles: linkedPo?.renewalCycles || [],
      };
    }
    return null;
  }, [selectedPO, invoiceDraft, editingInvoice, commercialPOs]);

  /** M&M + Service only — enable description dropdown rows. */
  const isMmServiceDescriptionMode = useMemo(() => {
    if (!isMmOnlyVertical) return false;
    const bt = String(displayPO?.billingType || '').trim().toLowerCase();
    return bt === 'service';
  }, [isMmOnlyVertical, displayPO]);

  const mmDescriptionOptions = useMemo(
    () => (isMmServiceDescriptionMode && displayPO ? sortedRmDescriptionOptions(displayPO) : []),
    [isMmServiceDescriptionMode, displayPO]
  );

  const isManpowerMonthly = useMemo(() => {
    if (!displayPO) return false;
    const ocVerticalPart = displayPO.ocNumber ? String(displayPO.ocNumber).split('-')[1] : '';
    const vertical = normalizeVerticalValue(displayPO.vertical || displayPO.poVertical || ocVerticalPart);
    const isManpower = vertical === 'manpower';
    const isMonthly = String(displayPO.billingType || '').toLowerCase() === 'monthly';
    return isManpower && isMonthly;
  }, [displayPO]);

  const isMonthlyBilling = useMemo(() => {
    if (!displayPO) return false;
    return String(displayPO.billingType || '').toLowerCase() === 'monthly';
  }, [displayPO]);

  const isLumpSumBilling = useMemo(() => {
    if (!displayPO) return false;
    return String(displayPO.billingType || '').toLowerCase() === 'lump sum';
  }, [displayPO]);

  const poForLogic = useMemo(() => {
    if (invoiceDraft?.mode === 'edit' && editingInvoice?.poId) {
      return commercialPOs.find((p) => String(p.id) === String(editingInvoice.poId)) || null;
    }
    return selectedPO || null;
  }, [invoiceDraft, editingInvoice, commercialPOs, selectedPO]);

  const monthlyDutyQtyMode = useMemo(() => {
    if (!isMonthlyBilling) return 'po_geometry';
    const m = String(poForLogic?.monthlyDutyQtyMode || poForLogic?.monthly_duty_qty_mode || '').trim();
    if (m === 'po_geometry_by_months') return 'po_geometry_by_months';
    return m === 'duty_ratio' ? 'duty_ratio' : 'po_geometry';
  }, [isMonthlyBilling, poForLogic]);

  const lumpSumBillingMode = useMemo(() => {
    if (!isLumpSumBilling) return 'normal';
    const m = String(poForLogic?.lumpSumBillingMode || poForLogic?.lump_sum_billing_mode || '').trim().toLowerCase();
    if (m === 'penalty') return 'penalty';
    if (m === 'truck' || m === 'fire_tender') return 'truck';
    if (m === 'months_geometry') return 'months_geometry';
    return 'normal';
  }, [isLumpSumBilling, poForLogic]);

  const lumpSumPenaltyActive = lumpSumBillingMode === 'penalty';
  const lumpSumTruckActive = lumpSumBillingMode === 'truck';
  const lumpSumSubtractPenaltyInRate = lumpSumPenaltyActive || lumpSumInvoicePenaltyGeometry;
  /**
   * Lump sum invoice table behavior:
   * - Default: show one cumulative (geometry consolidated) line + supplementary/truck lines.
   * - Truck-mode POs keep the legacy multi-row layout unless duty-geometry (penalty column) is enabled on this invoice.
   */
  const lumpSumSingleInvoiceTableMode =
    isLumpSumBilling && (!lumpSumTruckActive || lumpSumSubtractPenaltyInRate);
  /** Tighter line-item table when Lump Sum + Penalty column (duty geometry) is on — avoids squashed inputs. */
  const lumpSumDutyGeometryLineTable = isLumpSumBilling && lumpSumSubtractPenaltyInRate;
  const lineTableColSpan = 6 + (lumpSumSubtractPenaltyInRate ? 1 : 0);
  const lumpSumGeometryRowsForExport = useMemo(
    () => (isLumpSumBilling ? items.filter((row) => !row.isTruckLine && row.geometryEnabled) : []),
    [isLumpSumBilling, items]
  );

  useEffect(() => {
    if (invoiceDraft?.mode === 'edit') return;
    setLumpSumInvoicePenaltyGeometry(false);
  }, [selectedPO?.id, invoiceDraft?.mode]);

  useEffect(() => {
    if (!invoiceDraft) return;
    if (invoiceDraft.mode === 'edit' && editingInvoice) {
      const ik = String(editingInvoice.invoiceKind || editingInvoice.invoice_kind || 'tax').toLowerCase();
      setInvoiceDocumentKind(ik === 'proforma' ? 'proforma' : 'tax');
      setSelectedPoId(String(editingInvoice.poId || ''));
      setInvoiceDate(editingInvoice.invoiceDate || editingInvoice.created_at || today);
      const atts = Array.isArray(editingInvoice.attachments) ? editingInvoice.attachments : [];
      setAttendanceFiles(atts.filter((a) => a.type === 'attendance').map((a) => ({ name: a.name, url: a.url })));
      setDocument2Files(atts.filter((a) => a.type === 'document_2').map((a) => ({ name: a.name, url: a.url })));
      const editIsLump = String(editingInvoice.billingType || '').toLowerCase() === 'lump sum';
      const editPo = commercialPOs.find((p) => String(p.id) === String(editingInvoice.poId));
      const editPenaltyMode =
        editIsLump && String(editPo?.lumpSumBillingMode || editPo?.lump_sum_billing_mode || '').toLowerCase() === 'penalty';
      const editMonthsGeometryMode =
        editIsLump && String(editPo?.lumpSumBillingMode || editPo?.lump_sum_billing_mode || '').toLowerCase() === 'months_geometry';
      const editInvDate = editingInvoice.invoiceDate || editingInvoice.invoice_date || today;
      const editAnyPenaltySaved = (editingInvoice.items || []).some((it) => safeNumber(it.penalty) > 0);
      setLumpSumInvoicePenaltyGeometry(editIsLump && !editPenaltyMode && editAnyPenaltySaved);
      setItems(
        (editingInvoice.items || []).map((i) => {
          const isTruck = !!i.isTruckLine;
          const qty = Number(i.quantity) || 0;
          const rate = Number(i.rate) || 0;
          const poPenSnap = i.penalty != null ? Number(i.penalty) : 0;
          const desc = (i.description || i.designation || '').trim();
          const matchCat = (editPo?.ratePerCategory || []).find(
            (r) => (r.description || r.designation || '').trim() === desc
          );
          const isSavedSupplementary = !!(
            i.isLumpSumSupplementaryLine ??
            i.is_lump_sum_supplementary_line ??
            i.is_lump_sum_supplementary
          );
          const looksConsolidatedLump =
            editIsLump &&
            /^lump sum billing \(geometry consolidated\)$/i.test(desc) &&
            i.actualDuty == null &&
            i.actual_duty == null;
          const geometryEnabled = isTruck
            ? false
            : isSavedSupplementary
              ? false
              : looksConsolidatedLump
                ? false
                : editIsLump
                  ? true
                  : !!(i.actualDuty != null || i.authorizedDuty != null || i.poQty != null);
          const poRef =
            i.poReferenceRate != null
              ? Number(i.poReferenceRate)
              : i.po_reference_rate != null
                ? Number(i.po_reference_rate)
                : matchCat
                  ? Number(matchCat.rate) || 0
                  : undefined;
          const poLinePen =
            !isTruck && editIsLump ? Math.max(0, poPenSnap || Number(matchCat?.penalty) || 0) : 0;
          const editSubtractPenalty =
            editIsLump && !isTruck && (editPenaltyMode || editAnyPenaltySaved);
          const actD = i.actualDuty != null ? Number(i.actualDuty) : undefined;
          const authD =
            i.authorizedDuty != null ? Number(i.authorizedDuty) : daysInMonth(editInvDate);
          const numberOfMonths =
            i.numberOfMonths != null
              ? Number(i.numberOfMonths)
              : i.number_of_months != null
                ? Number(i.number_of_months)
                : 1;
          let quantity = qty;
          let lineRate = rate;
          let amount = isTruck ? round2(qty * rate) : round2(Number(i.amount) || 0);
          if (editIsLump && !isTruck && geometryEnabled) {
            const poQ = i.poQty != null ? Number(i.poQty) : 0;
            const act = actD ?? 0;
            const auth = authD ?? daysInMonth(editInvDate);
            const eff = computeLumpSumEffectiveRate(poRef || 0, act, auth, poLinePen, editSubtractPenalty);
            quantity = editMonthsGeometryMode
              ? computeArrivedQtyByMonths(poQ, act, auth, numberOfMonths)
              : computeArrivedQty(poQ, act, auth);
            lineRate = eff;
            amount = round2(quantity * eff);
          }
          if (editIsLump && !isTruck && isSavedSupplementary) {
            amount = round2(qty * rate);
          }
          return {
            description: i.description || i.designation || '',
            hsnSac: i.hsnSac || editingInvoice.hsnSac || '',
            isTruckLine: isTruck,
            isLumpSumSupplementaryLine: isSavedSupplementary || false,
            geometryEnabled,
            poQty: i.poQty != null ? Number(i.poQty) : undefined,
            poReferenceRate: poRef,
            poLinePenalty: poLinePen,
            actualDuty: actD,
            authorizedDuty: i.authorizedDuty != null ? Number(i.authorizedDuty) : undefined,
            numberOfMonths,
            quantity,
            rate: lineRate,
            amount,
          };
        })
      );
      return;
    }
    if (invoiceDraft.mode === 'create' && invoiceDraft.poId) {
      setSelectedPoId(String(invoiceDraft.poId));
    }
  }, [invoiceDraft, editingInvoice, today, commercialPOs]);

  useEffect(() => {
    if (!selectedPO) return;
    // Only seed items when creating (not when editing with existing items)
    if (invoiceDraft?.mode === 'edit') return;
    const hsnSac = selectedPO.hsnCode || selectedPO.sacCode || '';
    const authDutyDefault = daysInMonth(invoiceDate);
    const isLump = String(selectedPO.billingType || '').toLowerCase() === 'lump sum';

    if (isLump) {
      const rows = Array.isArray(selectedPO.ratePerCategory) ? selectedPO.ratePerCategory : [];
      const nextRows = rows.map((x) => {
        const desc = ((x.description || x.designation || '').trim()) || 'Other';
        const poRate = Number(x.rate) || 0;
        const qty = Number(x.qty) || 0;
        const pen = Math.max(0, Number(x.penalty) || 0);
        return {
          description: desc,
          hsnSac,
          isTruckLine: false,
          geometryEnabled: true,
          poQty: qty,
          poReferenceRate: poRate,
          poLinePenalty: pen,
          actualDuty: 0,
          authorizedDuty: authDutyDefault,
          numberOfMonths: 1,
          quantity: computeArrivedQtyByMonths(qty, 0, authDutyDefault, 1),
          rate: computeLumpSumEffectiveRate(poRate, 0, authDutyDefault, pen, lumpSumSubtractPenaltyInRate),
          amount: 0,
        };
      });
      setItems(
        nextRows.length
          ? nextRows
          : [
              {
                description: 'Other',
                hsnSac,
                isTruckLine: false,
                geometryEnabled: true,
                poQty: 0,
                poReferenceRate: 0,
                poLinePenalty: 0,
                actualDuty: 0,
                authorizedDuty: authDutyDefault,
                numberOfMonths: 1,
                quantity: 0,
                rate: 0,
                amount: 0,
              },
            ]
      );
      return;
    }

    const uniqueRates = getUniqueRateRows(selectedPO);
    if (isMmServiceDescriptionMode) {
      setItems([
        {
          description: '',
          hsnSac,
          isTruckLine: false,
          geometryEnabled: false,
          poQty: 0,
          actualDuty: 0,
          authorizedDuty: authDutyDefault,
          numberOfMonths: 1,
          quantity: 0,
          rate: 0,
          amount: 0,
          poReferenceRate: 0,
          poLinePenalty: 0,
        },
      ]);
      return;
    }
    setItems(
      uniqueRates.map((r) => ({
        description: r.description,
        hsnSac,
        isTruckLine: false,
        geometryEnabled: false,
        poQty: safeNumber(selectedPO?.ratePerCategory?.find((x) => (x?.description || x?.designation || '').trim() === r.description)?.qty),
        actualDuty: 0,
        authorizedDuty: authDutyDefault,
        numberOfMonths: 1,
        quantity: 0,
        rate: r.rate,
        amount: 0,
        poReferenceRate: undefined,
        poLinePenalty: 0,
      }))
    );
  }, [selectedPO, invoiceDraft, invoiceDate, lumpSumSubtractPenaltyInRate, isMmServiceDescriptionMode]);

  // Single sync on mount only — avoid repeat refresh (focus / delayed) wiping in-memory fields
  // such as CN/DN request status before async invoice saves finish or if DB columns lag migrations.
  useEffect(() => {
    void (async () => {
      try {
        await refreshBilling?.();
      } catch {
        /* ignore */
      }
    })();
  }, [refreshBilling]);

  const updateItem = (idx, patch) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const poQty = next.poQty != null ? safeNumber(next.poQty) : 0;
        const actualDuty = next.actualDuty != null ? safeNumber(next.actualDuty) : 0;
        const authorizedDuty = next.authorizedDuty != null ? safeNumber(next.authorizedDuty) : 0;
        const numberOfMonths = next.numberOfMonths != null ? safeNumber(next.numberOfMonths) : 1;
        const qtyRaw = safeNumber(next.quantity);

        if (next.isTruckLine) {
          const qty = isManpowerMonthly ? round3(qtyRaw) : qtyRaw;
          const rate = Number(next.rate) || 0;
          next.quantity = qty;
          next.amount = round2(qty * rate);
          return next;
        }

        if (isMonthlyBilling && next.geometryEnabled) {
          const qty =
            monthlyDutyQtyMode === 'duty_ratio'
              ? computeDutyRatioQty(actualDuty, authorizedDuty)
              : monthlyDutyQtyMode === 'po_geometry_by_months'
                ? computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths)
                : computeArrivedQty(poQty, actualDuty, authorizedDuty);
          const rate = Number(next.rate) || 0;
          next.quantity = qty;
          next.amount = round2(qty * rate);
          return next;
        }

        if (isLumpSumBilling && next.geometryEnabled) {
          const poRef = safeNumber(next.poReferenceRate);
          const pen = safeNumber(next.poLinePenalty);
          const effRate = computeLumpSumEffectiveRate(poRef, actualDuty, authorizedDuty, pen, lumpSumSubtractPenaltyInRate);
          const qty =
            lumpSumBillingMode === 'months_geometry'
              ? computeArrivedQtyByMonths(poQty, actualDuty, authorizedDuty, numberOfMonths)
              : computeArrivedQty(poQty, actualDuty, authorizedDuty);
          next.rate = effRate;
          next.quantity = qty;
          next.amount = round2(qty * effRate);
          return next;
        }

        if (isLumpSumBilling && !next.geometryEnabled) {
          const qty = isManpowerMonthly ? round3(qtyRaw) : qtyRaw;
          const rate = Number(next.rate) || 0;
          next.quantity = qty;
          next.amount = round2(qty * rate);
          return next;
        }

        const qty = isManpowerMonthly ? round3(qtyRaw) : qtyRaw;
        const rate = Number(next.rate) || 0;
        next.quantity = qty;
        next.amount = round2(qty * rate);
        return next;
      })
    );
  };

  useEffect(() => {
    if (!isLumpSumBilling) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.isTruckLine || !it.geometryEnabled) return it;
        const poRef = safeNumber(it.poReferenceRate);
        const pen = safeNumber(it.poLinePenalty);
        const actualDuty = safeNumber(it.actualDuty);
        const authorizedDuty = safeNumber(it.authorizedDuty);
        const numberOfMonths = safeNumber(it.numberOfMonths) || 1;
        const effRate = computeLumpSumEffectiveRate(poRef, actualDuty, authorizedDuty, pen, lumpSumSubtractPenaltyInRate);
        const qty =
          lumpSumBillingMode === 'months_geometry'
            ? computeArrivedQtyByMonths(it.poQty, actualDuty, authorizedDuty, numberOfMonths)
            : computeArrivedQty(it.poQty, actualDuty, authorizedDuty);
        return { ...it, rate: effRate, quantity: qty, amount: round2(qty * effRate) };
      })
    );
  }, [lumpSumSubtractPenaltyInRate, isLumpSumBilling, lumpSumBillingMode]);

  const createMmEmptyLine = (hsnSac = '') => ({
    description: '',
    hsnSac,
    isTruckLine: false,
    geometryEnabled: false,
    poQty: 0,
    actualDuty: 0,
    authorizedDuty: daysInMonth(invoiceDate),
    numberOfMonths: 1,
    quantity: 0,
    rate: 0,
    amount: 0,
    poReferenceRate: 0,
    poLinePenalty: 0,
  });

  /** M&M only: pick PO category → fill description row + rate/qty from PO; focus next line's dropdown. */
  const handleMmDescriptionSelect = (idx, rawValue) => {
    const value = String(rawValue || '').trim();
    const po = displayPO;
    if (!po || !isMmServiceDescriptionMode) return;
    const cat = value ? findRateCategoryRow(po, value) : null;
    const hsn = po.hsnCode || po.sacCode || '';
    const patch = { description: value, hsnSac: hsn };
    if (cat) {
      const poQty = Number(cat.qty) || 0;
      const poRate = Number(cat.rate) || 0;
      const pen = Math.max(0, Number(cat.penalty) || 0);
      patch.poQty = poQty;
      patch.poReferenceRate = poRate;
      patch.poLinePenalty = pen;
      if (!isLumpSumBilling) {
        patch.rate = poRate;
      }
    } else if (!value) {
      patch.poQty = 0;
      patch.poReferenceRate = 0;
      patch.poLinePenalty = 0;
      patch.rate = 0;
      patch.quantity = 0;
      patch.amount = 0;
    }
    updateItem(idx, patch);
    if (value) {
      setItems((prev) => {
        const hasBlankAfter = prev.some(
          (row, rowIdx) => rowIdx > idx && !row.isTruckLine && !String(row.description || '').trim()
        );
        if (hasBlankAfter) return prev;
        const next = [...prev];
        next.splice(idx + 1, 0, createMmEmptyLine(hsn));
        return next;
      });
    }
    setTimeout(() => {
      const list = itemsRef.current || [];
      for (let j = idx + 1; j < list.length; j += 1) {
        if (!list[j]?.isTruckLine) {
          document.getElementById(`mm-invoice-desc-select-${j}`)?.focus();
          break;
        }
      }
    }, 0);
  };

  /** M&M only: remove selected description row; rows below shift up. */
  const clearMmDescriptionRow = (idx) => {
    if (!isMmServiceDescriptionMode) return;
    const hsn = displayPO?.hsnCode || displayPO?.sacCode || '';
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const hasBlankSelectableRow = next.some(
        (row) => !row.isTruckLine && !String(row.description || '').trim()
      );
      if (!hasBlankSelectableRow) next.push(createMmEmptyLine(hsn));
      return next;
    });
  };

  const addTruckLine = () => {
    if (!displayPO) return;
    const hsn = displayPO.hsnCode || displayPO.sacCode || '';
    setItems((prev) => [
      ...prev,
      {
        description: '',
        hsnSac: hsn,
        isTruckLine: true,
        geometryEnabled: false,
        quantity: 0,
        rate: 0,
        amount: 0,
        poReferenceRate: undefined,
        poLinePenalty: 0,
        poQty: undefined,
        actualDuty: undefined,
        authorizedDuty: undefined,
        numberOfMonths: undefined,
      },
    ]);
  };

  const removeTruckLine = (idx) => {
    setItems((prev) => {
      if (!prev[idx]?.isTruckLine) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  /** User-added lump sum rows: editable Qty × Rate; excluded from duty-geometry totals. */
  const addLumpSumSupplementaryLine = () => {
    if (!displayPO || !isLumpSumBilling) return;
    const hsn = displayPO.hsnCode || displayPO.sacCode || '';
    setItems((prev) => [
      ...prev,
      {
        description: '',
        hsnSac: hsn,
        isTruckLine: false,
        isLumpSumSupplementaryLine: true,
        geometryEnabled: false,
        poQty: 0,
        actualDuty: 0,
        authorizedDuty: daysInMonth(invoiceDate),
        numberOfMonths: 1,
        quantity: 0,
        rate: 0,
        amount: 0,
        poReferenceRate: undefined,
        poLinePenalty: 0,
      },
    ]);
  };

  const removeLumpSumSupplementaryLine = (itemIndex) => {
    setItems((prev) => {
      if (!prev[itemIndex]?.isLumpSumSupplementaryLine) return prev;
      return prev.filter((_, i) => i !== itemIndex);
    });
  };

  const taxableValue = useMemo(() => round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0)), [items]);
  const consolidatedLumpSumLine = useMemo(() => {
    if (!lumpSumSingleInvoiceTableMode) return null;
    const geometryRows = items.filter((it) => !it.isTruckLine && it.geometryEnabled);
    if (!geometryRows.length) return null;
    const qty = round3(geometryRows.reduce((sum, row) => sum + safeNumber(row.quantity), 0));
    const amount = round2(geometryRows.reduce((sum, row) => sum + safeNumber(row.amount), 0));
    const penalty = round2(geometryRows.reduce((sum, row) => sum + safeNumber(row.poLinePenalty), 0));
    const rate = qty > 0 ? round2(amount / qty) : 0;
    return {
      description: 'Lump Sum Billing (Geometry Consolidated)',
      hsnSac: geometryRows[0]?.hsnSac || displayPO?.hsnCode || displayPO?.sacCode || '',
      quantity: qty,
      rate,
      amount,
      isTruckLine: false,
      geometryEnabled: false,
      poReferenceRate: 0,
      poLinePenalty: penalty,
      poQty: null,
      actualDuty: null,
      authorizedDuty: null,
      numberOfMonths: null,
    };
  }, [lumpSumSingleInvoiceTableMode, items, displayPO]);
  /** Invoice table rows: non-truck lump sum shows aggregated geometry line + supplementary Qty×Rate lines only. */
  const invoiceTableRows = useMemo(() => {
    if (!lumpSumSingleInvoiceTableMode) {
      return items.map((_, itemIndex) => ({ kind: 'item', itemIndex }));
    }
    const rows = [];
    if (consolidatedLumpSumLine) {
      rows.push({ kind: 'lumpConsolidated' });
    }
    items.forEach((it, itemIndex) => {
      if (it.isTruckLine || (!it.isTruckLine && !it.geometryEnabled)) {
        rows.push({ kind: 'item', itemIndex });
      }
    });
    if (!rows.length && items.length) {
      return items.map((_, itemIndex) => ({ kind: 'item', itemIndex }));
    }
    return rows;
  }, [lumpSumSingleInvoiceTableMode, consolidatedLumpSumLine, items]);

  const gstSupplyType = useMemo(
    () => normalizeGstSupplyType(displayPO?.gstSupplyType || displayPO?.gst_supply_type),
    [displayPO]
  );

  const cgstRate = 9;
  const sgstRate = 9;
  const igstRate = 18;

  const cgstAmt = useMemo(() => {
    if (gstSupplyType !== 'intra') return 0;
    return round2((taxableValue * cgstRate) / 100);
  }, [taxableValue, cgstRate, gstSupplyType]);

  const sgstAmt = useMemo(() => {
    if (gstSupplyType !== 'intra') return 0;
    return round2((taxableValue * sgstRate) / 100);
  }, [taxableValue, sgstRate, gstSupplyType]);

  const igstAmt = useMemo(() => {
    if (gstSupplyType !== 'inter') return 0;
    return round2((taxableValue * igstRate) / 100);
  }, [taxableValue, igstRate, gstSupplyType]);

  const totalValueRaw = useMemo(() => {
    if (gstSupplyType === 'sez_zero') return round2(taxableValue);
    return round2(taxableValue + cgstAmt + sgstAmt + igstAmt);
  }, [taxableValue, cgstAmt, sgstAmt, igstAmt, gstSupplyType]);
  const totalValue = useMemo(() => roundInvoiceAmount(totalValueRaw), [totalValueRaw]);

  const previewBillMeta = useMemo(() => {
    if (!displayPO) return null;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const docNo =
      existing?.taxInvoiceNumber ||
      (invoiceDocumentKind === 'proforma'
        ? generateProformaInvoiceNumber(getNextProformaSequence(invoices))
        : generateTaxInvoiceNumber(getNextTaxInvoiceSequence(invoices)));
    const billingMonthStr = formatBillingMonth(invoiceDate) || '–';
    const billingDurationStr =
      displayPO.startDate || displayPO.start_date
        ? `${formatDate(displayPO.startDate || displayPO.start_date)} – ${formatDate(displayPO.endDate || displayPO.end_date)}`
        : '–';
    const remarksLine =
      displayPO.remarks ||
      displayPO.paymentTerms ||
      displayPO.payment_terms ||
      displayPO.invoiceTermsText ||
      null;
    return {
      taxInvoiceNumber: docNo,
      billingMonthStr,
      billingDurationStr,
      remarksLine,
    };
  }, [displayPO, invoiceDraft, invoices, invoiceDate, invoiceDocumentKind]);

  const invoiceTermsLinesPreview = useMemo(() => {
    if (!displayPO) return [];
    return resolveTermsLines({
      termsCustomText: displayPO.invoiceTermsText,
      termsText: displayPO.invoiceTermsText,
      terms_custom_text: displayPO.invoiceTermsText,
      poVertical: displayPO.vertical || displayPO.poVertical,
      termsTemplateKey: displayPO.vertical || displayPO.poVertical,
    });
  }, [displayPO]);

  const totalInWords = useMemo(() => formatInvoiceAmountInWords(totalValue), [totalValue]);

  const buyerPinMeta = useMemo(() => {
    if (!displayPO) return { pin: null, stateCode: '', stateName: '' };
    const existingPin =
      editingInvoice?.buyerPin ||
      editingInvoice?.buyer_pin ||
      editingInvoice?.buyerPincode ||
      editingInvoice?.buyer_pincode ||
      editingInvoice?.clientPincode ||
      editingInvoice?.client_pincode;
    return resolveBuyerStateAndPin({
      gstin: displayPO.gstin,
      placeOfSupply: displayPO.placeOfSupply || displayPO.place_of_supply,
      billingAddress: displayPO.billingAddress,
      existingPin,
    });
  }, [displayPO, editingInvoice]);

  const canSave = !!displayPO && items.length > 0;
  const documentKindLockedByIrn = useMemo(() => {
    if (invoiceDraft?.mode !== 'edit' || !editingInvoice) return false;
    const irn = editingInvoice.e_invoice_irn || editingInvoice.eInvoiceIrn;
    return !!irn && !String(irn).toUpperCase().startsWith('MOCK-IRN-');
  }, [invoiceDraft?.mode, editingInvoice]);

  const selectedViewInvoice = useMemo(
    () => invoices.find((i) => String(i.id) === String(viewInvoiceId)) || null,
    [invoices, viewInvoiceId]
  );

  const toDateInputValue = (v) => {
    if (!v) return '';
    const s = String(v);
    // Handles "YYYY-MM-DD" and ISO like "YYYY-MM-DDTHH:mm:ssZ"
    return s.length >= 10 ? s.slice(0, 10) : s;
  };

  // Service period is manually editable in Create/Edit.
  useEffect(() => {
    if (!displayPO) return;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const from =
      existing?.billingDurationFrom ||
      existing?.billing_duration_from ||
      displayPO.startDate ||
      displayPO.start_date ||
      '';
    const to =
      existing?.billingDurationTo ||
      existing?.billing_duration_to ||
      displayPO.endDate ||
      displayPO.end_date ||
      '';
    setServicePeriodFrom(toDateInputValue(from));
    setServicePeriodTo(toDateInputValue(to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPO?.id, invoiceDraft?.mode, invoiceDraft?.invoiceId]);

  const buildInvoiceForPreview = () => {
    if (!displayPO || !canSave) return null;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const rawIrn = existing?.e_invoice_irn || existing?.eInvoiceIrn;
    const hasRealIrn = !!rawIrn && !String(rawIrn).toUpperCase().startsWith('MOCK-IRN-');
    const effectiveKind = hasRealIrn ? 'tax' : invoiceDocumentKind === 'proforma' ? 'proforma' : 'tax';
    const id = existing ? existing.id : crypto.randomUUID();
    const taxInvoiceNumber = existing
      ? existing.taxInvoiceNumber
      : effectiveKind === 'proforma'
        ? generateProformaInvoiceNumber(getNextProformaSequence(invoices))
        : generateTaxInvoiceNumber(getNextTaxInvoiceSequence(invoices));

    const poRow = commercialPOs.find((p) => String(p.id) === String(displayPO.id));
    let canonicalPoId = displayPO.id;
    let billingParent = poRow;
    if (poRow?.isSupplementary) {
      const pid = poRow.supplementaryParentPoId || poRow.supplementary_parent_po_id;
      billingParent = commercialPOs.find((p) => String(p.id) === String(pid));
      canonicalPoId = pid || displayPO.id;
    }
    const supSt = billingParent?.supplementaryRequestStatus || billingParent?.supplementary_request_status;
    const postContractBillingMoment =
      billingParent &&
      !billingParent.isSupplementary &&
      supSt === 'approved' &&
      isAfterContractEndForInvoice(billingParent.endDate || billingParent.end_date);

    return {
      ...(existing || {}),
      id,
      poId: canonicalPoId,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      taxInvoiceNumber,
      invoiceDate,
      billNumber: existing?.billNumber || existing?.bill_number || taxInvoiceNumber,
      billingMonth: existing?.billingMonth || existing?.billing_month || formatBillingMonth(invoiceDate),
      billingDurationFrom:
        servicePeriodFrom || null,
      billingDurationTo: servicePeriodTo || null,
      invoiceHeaderRemarks:
        existing?.invoiceHeaderRemarks ||
        existing?.invoice_header_remarks ||
        (displayPO.remarks || displayPO.paymentTerms || displayPO.payment_terms || null),
      clientLegalName: displayPO.legalName,
      clientAddress: displayPO.billingAddress,
      clientPincode: String(buyerPinMeta.pin || ''),
      client_pincode: String(buyerPinMeta.pin || ''),
      gstin: displayPO.gstin,
      buyerPin: buyerPinMeta.pin || null,
      buyer_pin: buyerPinMeta.pin || null,
      buyerPincode: buyerPinMeta.pin || null,
      buyer_pincode: buyerPinMeta.pin || null,
      buyerStateCode: buyerPinMeta.stateCode || null,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: displayPO.hsnCode || displayPO.sacCode || '',
      items: (() => {
        let lines =
          lumpSumSingleInvoiceTableMode && consolidatedLumpSumLine
            ? [
                consolidatedLumpSumLine,
                ...items.filter((row) => row.isTruckLine || (!row.isTruckLine && !row.geometryEnabled)),
              ]
            : items;
        lines = lines.map((i) => ({
          description: i.description,
          hsnSac: i.hsnSac,
          quantity: isManpowerMonthly ? round3(i.quantity) : Number(i.quantity) || 0,
          rate: Number(i.rate) || 0,
          amount: round2(i.amount),
          isTruckLine: !!i.isTruckLine,
          isLumpSumSupplementaryLine: !!i.isLumpSumSupplementaryLine,
          poReferenceRate:
            isLumpSumBilling && !i.isTruckLine && i.poReferenceRate != null ? safeNumber(i.poReferenceRate) : null,
          penalty:
            isLumpSumBilling && !i.isTruckLine && lumpSumSubtractPenaltyInRate ? Math.max(0, safeNumber(i.poLinePenalty)) : 0,
          poQty:
            (isMonthlyBilling || isLumpSumBilling) && i.geometryEnabled && !i.isTruckLine && i.poQty != null
              ? safeNumber(i.poQty)
              : null,
          actualDuty:
            i.geometryEnabled && !i.isTruckLine && (isMonthlyBilling || isLumpSumBilling) && i.actualDuty != null
              ? safeNumber(i.actualDuty)
              : null,
          authorizedDuty:
            i.geometryEnabled && !i.isTruckLine && (isMonthlyBilling || isLumpSumBilling) && i.authorizedDuty != null
              ? safeNumber(i.authorizedDuty)
              : null,
          numberOfMonths:
            i.geometryEnabled && !i.isTruckLine && (isMonthlyBilling || isLumpSumBilling) && i.numberOfMonths != null
              ? safeNumber(i.numberOfMonths)
              : null,
        }));
        return lines;
      })(),
      clientShippingAddress: displayPO.shippingAddress || displayPO.shipping_address || null,
      placeOfSupply: displayPO.placeOfSupply || displayPO.place_of_supply || null,
      termsCustomText: displayPO.invoiceTermsText || null,
      sellerCin: displayPO.sellerCin || null,
      sellerPan: displayPO.sellerPan || null,
      msmeRegistrationNo: displayPO.msmeRegistrationNo || null,
      msmeClause: displayPO.msmeClause || null,
      attachments: [
        ...attendanceFiles.map((f) => ({ name: f.name || 'attendance', type: 'attendance', url: f.url || '#' })),
        ...document2Files.map((f) => ({ name: f.name || 'document_2', type: 'document_2', url: f.url || '#' })),
      ],
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? igstRate : 0,
      igstAmt: gstSupplyType === 'inter' ? igstAmt : 0,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: existing?.paStatus || 'Pending',
      paymentStatus: existing?.paymentStatus || false,
      pendingAmount: existing?.pendingAmount ?? totalValue,
      created_at: existing?.created_at || today,
      createdAt: existing?.createdAt || today,
      updated_at: today,
      isPostContractBuffer: existing ? !!existing.isPostContractBuffer : !!postContractBillingMoment,
      invoiceKind: effectiveKind,
      invoice_kind: effectiveKind,
    };
  };

  const livePreviewInv = useMemo(() => buildInvoiceForPreview(), [
    // recompute when edit inputs change
    displayPO?.id,
    invoiceDraft?.mode,
    invoiceDraft?.invoiceId,
    invoiceDate,
    servicePeriodFrom,
    servicePeriodTo,
    invoiceDocumentKind,
    items,
    attendanceFiles,
    document2Files,
    taxableValue,
    cgstAmt,
    sgstAmt,
    igstAmt,
    totalValue,
    lumpSumInvoicePenaltyGeometry,
  ]);

  const handleSaveInvoice = () => {
    if (!displayPO || !canSave) return;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const rawIrn = existing?.e_invoice_irn || existing?.eInvoiceIrn;
    const hasRealIrn = !!rawIrn && !String(rawIrn).toUpperCase().startsWith('MOCK-IRN-');
    const effectiveKind = hasRealIrn ? 'tax' : invoiceDocumentKind === 'proforma' ? 'proforma' : 'tax';
    // DB + saveInvoice expect a UUID primary key; numeric local-only ids caused duplicate inserts (same tax_invoice_number).
    const id = existing ? existing.id : crypto.randomUUID();
    const taxInvoiceNumber = existing
      ? existing.taxInvoiceNumber
      : effectiveKind === 'proforma'
        ? generateProformaInvoiceNumber(getNextProformaSequence(invoices))
        : generateTaxInvoiceNumber(getNextTaxInvoiceSequence(invoices));

    const poRow = commercialPOs.find((p) => String(p.id) === String(displayPO.id));
    let canonicalPoId = displayPO.id;
    let billingParent = poRow;
    if (poRow?.isSupplementary) {
      const pid = poRow.supplementaryParentPoId || poRow.supplementary_parent_po_id;
      billingParent = commercialPOs.find((p) => String(p.id) === String(pid));
      canonicalPoId = pid || displayPO.id;
    }
    const supSt = billingParent?.supplementaryRequestStatus || billingParent?.supplementary_request_status;
    const postContractBillingMoment =
      billingParent &&
      !billingParent.isSupplementary &&
      supSt === 'approved' &&
      isAfterContractEndForInvoice(billingParent.endDate || billingParent.end_date);

    const inv = {
      ...(existing || {}),
      id,
      poId: canonicalPoId,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      taxInvoiceNumber,
      invoiceDate,
      billNumber: existing?.billNumber || existing?.bill_number || taxInvoiceNumber,
      billingMonth: existing?.billingMonth || existing?.billing_month || formatBillingMonth(invoiceDate),
      billingDurationFrom: servicePeriodFrom || null,
      billingDurationTo: servicePeriodTo || null,
      invoiceHeaderRemarks:
        existing?.invoiceHeaderRemarks ||
        existing?.invoice_header_remarks ||
        (displayPO.remarks || displayPO.paymentTerms || displayPO.payment_terms || null),
      clientLegalName: displayPO.legalName,
      clientAddress: displayPO.billingAddress,
      clientPincode: String(buyerPinMeta.pin || ''),
      client_pincode: String(buyerPinMeta.pin || ''),
      gstin: displayPO.gstin,
      buyerPin: buyerPinMeta.pin || null,
      buyer_pin: buyerPinMeta.pin || null,
      buyerPincode: buyerPinMeta.pin || null,
      buyer_pincode: buyerPinMeta.pin || null,
      buyerStateCode: buyerPinMeta.stateCode || null,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: displayPO.hsnCode || displayPO.sacCode || '',
      items: (() => {
        let lines =
          lumpSumSingleInvoiceTableMode && consolidatedLumpSumLine
            ? [
                consolidatedLumpSumLine,
                ...items.filter((row) => row.isTruckLine || (!row.isTruckLine && !row.geometryEnabled)),
              ]
            : items;
        lines = lines.map((i) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        quantity: isManpowerMonthly ? round3(i.quantity) : (Number(i.quantity) || 0),
        rate: Number(i.rate) || 0,
        amount: round2(i.amount),
        isTruckLine: !!i.isTruckLine,
        isLumpSumSupplementaryLine: !!i.isLumpSumSupplementaryLine,
        poReferenceRate:
          isLumpSumBilling && !i.isTruckLine && i.poReferenceRate != null ? safeNumber(i.poReferenceRate) : null,
        penalty:
          isLumpSumBilling && !i.isTruckLine && lumpSumSubtractPenaltyInRate ? Math.max(0, safeNumber(i.poLinePenalty)) : 0,
        poQty:
          ((isMonthlyBilling || isLumpSumBilling) && i.geometryEnabled && !i.isTruckLine && i.poQty != null
            ? safeNumber(i.poQty)
            : null),
        actualDuty:
          i.geometryEnabled &&
          !i.isTruckLine &&
          (isMonthlyBilling || isLumpSumBilling) &&
          i.actualDuty != null
            ? safeNumber(i.actualDuty)
            : null,
        authorizedDuty:
          i.geometryEnabled &&
          !i.isTruckLine &&
          (isMonthlyBilling || isLumpSumBilling) &&
          i.authorizedDuty != null
            ? safeNumber(i.authorizedDuty)
            : null,
        numberOfMonths:
          i.geometryEnabled &&
          !i.isTruckLine &&
          (isMonthlyBilling || isLumpSumBilling) &&
          i.numberOfMonths != null
            ? safeNumber(i.numberOfMonths)
            : null,
        }));
        return lines;
      })(),
      // Snapshots from PO (or existing invoice) — used by PDF + shared HTML preview
      clientShippingAddress: displayPO.shippingAddress || displayPO.shipping_address || null,
      placeOfSupply: displayPO.placeOfSupply || displayPO.place_of_supply || null,
      termsCustomText: displayPO.invoiceTermsText || null,
      sellerCin: displayPO.sellerCin || null,
      sellerPan: displayPO.sellerPan || null,
      msmeRegistrationNo: displayPO.msmeRegistrationNo || null,
      msmeClause: displayPO.msmeClause || null,
      attachments: [
        ...attendanceFiles.map((f) => ({ name: f.name || 'attendance', type: 'attendance', url: f.url || '#' })),
        ...document2Files.map((f) => ({ name: f.name || 'document_2', type: 'document_2', url: f.url || '#' })),
      ],
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? igstRate : 0,
      igstAmt: gstSupplyType === 'inter' ? igstAmt : 0,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: existing?.paStatus || 'Pending',
      paymentStatus: existing?.paymentStatus || false,
      pendingAmount: existing?.pendingAmount ?? totalValue,
      created_at: existing?.created_at || today,
      createdAt: existing?.createdAt || today,
      updated_at: today,
      isPostContractBuffer: existing ? !!existing.isPostContractBuffer : !!postContractBillingMoment,
      invoiceKind: effectiveKind,
      invoice_kind: effectiveKind,
    };

    setInvoices((prev) => {
      if (existing) return prev.map((p) => (String(p.id) === String(existing.id) ? inv : p));
      return [...prev, inv];
    });
    setInvoiceDraft(null);
    onNavigateTab && onNavigateTab('manage-invoices');
  };

  const handleExportGeometrySectionToExcel = () => {
    if (!isLumpSumBilling) return;
    const sourceRows = items.filter((row) => !row.isTruckLine && row.geometryEnabled);
    if (!sourceRows.length) return;
    const exportRows = sourceRows.map((row, idx) => {
      const actual = safeNumber(row.actualDuty);
      const auth = safeNumber(row.authorizedDuty);
      const ratio = auth > 0 ? round3(actual / auth) : 0;
      return {
        'S.No': idx + 1,
        Description: row.description || `Line ${idx + 1}`,
        'PO Qty': safeNumber(row.poQty),
        'PO Rate': round2(safeNumber(row.poReferenceRate)),
        'Penalty (PO)': round2(safeNumber(row.poLinePenalty)),
        'Actual Duty': actual,
        'Authorised Duty': auth,
        'Duty Ratio': ratio,
        Qty: round3(safeNumber(row.quantity)),
        Rate: round2(safeNumber(row.rate)),
        Amount: round2(safeNumber(row.amount)),
      };
    });
    const totalQty = round3(sourceRows.reduce((sum, row) => sum + safeNumber(row.quantity), 0));
    const totalAmount = round2(sourceRows.reduce((sum, row) => sum + safeNumber(row.amount), 0));
    exportRows.push({
      'S.No': '',
      Description: 'TOTAL',
      'PO Qty': '',
      'PO Rate': '',
      'Penalty (PO)': round2(sourceRows.reduce((sum, row) => sum + safeNumber(row.poLinePenalty), 0)),
      'Actual Duty': '',
      'Authorised Duty': '',
      'Duty Ratio': '',
      Qty: totalQty,
      Rate: totalQty > 0 ? round2(totalAmount / totalQty) : 0,
      Amount: totalAmount,
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Geometry');
    const oc = String(displayPO?.ocNumber || 'OC').replace(/[\\/:*?"<>|]/g, '-');
    const dt = String(invoiceDate || today);
    XLSX.writeFile(wb, `Geometry-${oc}-${dt}.xlsx`);
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Select a vertical to start</p>
          <p className="text-sm mt-1 max-w-lg mx-auto">
            Choose the same vertical as your OC line above. No PO rows yet? Start in Commercial → PO Entry, then return here.
          </p>
        </div>
      ) : null}
      <div className="flex items-center space-x-3">
        <div className="bg-emerald-100 p-3 rounded-lg shrink-0">
          <FileText className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Create Invoice</h2>
          <p className="text-sm text-gray-600">
            Raise <strong>tax</strong> or <strong>proforma</strong> invoices from approved PO/WOs (Manpower, Training, R&amp;M, M&amp;M, AMC, IEV, trucks / lump-sum projects, etc.), or use the second tab to request Commercial approval for a credit / debit note.
          </p>
        </div>
      </div>

      {!verticalNotSelected ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/95 px-4 py-3 text-sm text-slate-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <p className="min-w-0 leading-snug">
            <span className="font-semibold text-slate-800">Seamless flow:</span> POs come from{' '}
            <strong>Commercial → PO Entry</strong> (approved / sent). Save your invoice here, then continue to{' '}
            <strong>Manage Invoices</strong> for PDF download, e-invoice IRN, payment advice, and edits.
          </p>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('manage-invoices')}
              className="inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            >
              Open Manage Invoices
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('dashboard')}
              className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
            >
              Billing dashboard
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {verticalNotSelected ? (
          <div className="p-6 text-sm text-gray-600">
            Select a vertical above to load billable PO/WOs.
          </div>
        ) : (
        <div className="flex gap-1 px-3 sm:px-4 border-b border-gray-100 overflow-x-auto">
          {CREATE_PAGE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={createMainTab === t.id}
              onClick={() => setCreateMainTab(t.id)}
              className={[
                'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
                createMainTab === t.id
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {createMainTab === 'select-po' && (
      <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab('add-on-invoices')}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
        >
          Open Add-On Invoices
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <h3 className="font-semibold text-gray-900 p-4 pb-2">1. Select PO/WO (sent or approved)</h3>
        <p className="text-xs text-gray-500 px-4 pb-2 -mt-1">
          After contract end, Commercial enables post-contract billing on the same OC — you still pick this row; buffer invoices are moved to the renewed PO/WO when renewal is approved.
        </p>
        {billablePOs.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 pb-4">
            No PO found for billing. In Commercial → PO Entry, click <span className="font-medium">Send to approval</span> for a PO.
          </p>
        ) : (
          <div className="px-3 pb-3">
            {!isRmVertical && !isTrainingVertical ? (
              <div className="px-1 pb-2 flex flex-wrap items-center gap-2">
                {billingTabs.map((t) => {
                  const count = billablePOs.filter((p) => String(p.billingType || '').trim() === t.id).length;
                  const bufferOpen = billablePOs.filter(
                    (p) =>
                      String(p.billingType || '').trim() === t.id &&
                      (p.supplementaryRequestStatus || p.supplementary_request_status) === 'approved' &&
                      isAfterContractEndForInvoice(p.endDate || p.end_date)
                  ).length;
                  const active = poBillingTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPoBillingTab(t.id)}
                      className={[
                        'px-3 py-1.5 rounded-lg text-sm border',
                        active ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                      ].join(' ')}
                      title={bufferOpen ? `${bufferOpen} OC(s) with post-contract billing open in ${t.label}` : undefined}
                    >
                      {t.label} <span className={active ? 'text-white/90' : 'text-gray-500'}>({count})</span>
                      {bufferOpen ? <span className={active ? 'ml-2 text-amber-100' : 'ml-2 text-amber-700'}>buffer {bufferOpen}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200/90 overflow-hidden bg-gradient-to-br from-red-50/40 via-white to-amber-50/30 ring-1 ring-slate-900/5">
              <div className="p-2">
                <div className="bg-white rounded-lg overflow-hidden">
                  <div className="w-full max-w-full min-w-0 overflow-x-auto">
                    <table className="w-full min-w-0 max-w-full table-fixed border-collapse">
                      <thead>
                <tr>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[18%]"><button type="button" onClick={() => togglePoSort('ocNumber')} className="inline-flex items-center">OC Number {renderSortIndicator('ocNumber')}</button></th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[22%]"><button type="button" onClick={() => togglePoSort('siteLocation')} className="inline-flex items-center">Site / Location {renderSortIndicator('siteLocation')}</button></th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[14%]"><button type="button" onClick={() => togglePoSort('poWo')} className="inline-flex items-center">PO/WO {renderSortIndicator('poWo')}</button></th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[16%]"><button type="button" onClick={() => togglePoSort('remaining')} className="inline-flex items-center">Remaining (₹) {renderSortIndicator('remaining')}</button></th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[14%]"><button type="button" onClick={() => togglePoSort('status')} className="inline-flex items-center">Status {renderSortIndicator('status')}</button></th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[16%]">Action</th>
                </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {poPaginatedRows.map((row) => {
                          const rowInvoice =
                            row.existingInvoiceId != null
                              ? invoices.find((i) => String(i.id) === String(row.existingInvoiceId))
                              : null;
                          const editLockedByIrn = !!rowInvoice?.e_invoice_irn;
                          return (
                          <tr
                            key={row.id}
                            className={[
                              'align-top',
                              row.postContractBufferOpen ? 'bg-amber-50 hover:bg-amber-100/60' : 'hover:bg-gray-50',
                            ].join(' ')}
                          >
                            <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono truncate" title={row.ocNumber || ''}>{row.ocNumber || '–'}</td>
                            <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={row.siteId && row.locationName ? `${row.siteId} – ${row.locationName}` : row.siteId || row.locationName || ''}>
                              {row.siteId && row.locationName ? `${row.siteId} – ${row.locationName}` : row.siteId || row.locationName || '–'}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={row.poWoNumber || ''}>{row.poWoNumber || '–'}</td>
                            <td className="px-3 py-2 text-xs text-center">
                      {Number(row._calc?.contract) > 0 ? (
                        <span
                          className={`font-medium ${row._calc.remaining < 0 ? 'text-red-700' : 'text-gray-700'}`}
                          title={`Contract ₹${row._calc.contract.toLocaleString('en-IN')} − (Rate sum ₹${row._calc.rateSum.toLocaleString('en-IN')} × ${row._calc.days} days = ₹${row._calc.expected.toLocaleString('en-IN')})`}
                        >
                          {formatINRWithSign(row._calc.remaining)}
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                            <td className="px-3 py-2 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${row.hasInvoice ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {row.statusLabel}
                      </span>
                      {row.postContractBufferOpen ? (
                        <span className="block text-[10px] text-amber-800 font-medium mt-1">Post-contract window</span>
                      ) : null}
                    </td>
                            <td className="px-3 py-2 text-center">
                              <div className="inline-flex items-center justify-center gap-2">
                        {row.hasInvoice && row.existingInvoiceId && (
                          <>
                            <button
                              type="button"
                              onClick={() => setViewInvoiceId(row.existingInvoiceId)}
                              title="View Tax Invoice"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editLockedByIrn) return;
                                setInvoiceDraft({ mode: 'edit', invoiceId: row.existingInvoiceId, poId: row.id });
                              }}
                              title={
                                editLockedByIrn
                                  ? 'Cannot edit after e-invoice (IRN) generated'
                                  : 'Edit Tax Invoice'
                              }
                              disabled={editLockedByIrn}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setInvoiceDocumentKind('tax');
                            setSelectedPoId(String(row.id));
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Create Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                          );
                        })}
              </tbody>
            </table>
                  </div>
                </div>
                </div>

                {sortedPoTableRows.length === 0 ? null : (
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-medium">{poStart + 1}</span>–
                      <span className="font-medium">{Math.min(poStart + PO_TABLE_PAGE_SIZE, sortedPoTableRows.length)}</span> of{' '}
                      <span className="font-medium">{sortedPoTableRows.length}</span> PO{sortedPoTableRows.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => goToPoPage(poSafePage - 1)}
                        disabled={poSafePage <= 1}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="px-3 py-1.5 text-sm text-gray-700">
                        Page <span className="font-medium">{poSafePage}</span> of <span className="font-medium">{poTotalPages}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => goToPoPage(poSafePage + 1)}
                        disabled={poSafePage >= poTotalPages}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
        )}
        <p className="text-xs text-gray-500 px-4 pt-2 pb-4">
          Use <strong>Create Invoice</strong> for a new bill, or <strong>View</strong> / <strong>Edit</strong> when a tax invoice already exists for that PO (edit is disabled after e-invoice IRN is generated).
        </p>
      </div>
      </div>
      )}

      {createMainTab === 'cndn' && (
        <div className="space-y-4">
          <RequestCnDnApprovalSection invoices={invoices} setInvoices={setInvoices} onNavigateTab={onNavigateTab} />
        </div>
      )}

      {displayPO && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 rounded-t-xl z-10">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  {invoiceDraft?.mode === 'edit' ? 'Edit' : 'Create'} invoice — {displayPO.siteId || '–'}
                </h3>
                <p className="text-xs text-gray-500 truncate">{displayPO.locationName || displayPO.legalName || '–'}</p>
              </div>
              <div className="flex flex-wrap items-end gap-3 shrink-0">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Invoice date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    readOnly
                    disabled
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Service period (from)</label>
                  <input
                    type="date"
                    value={servicePeriodFrom}
                    onChange={(e) => setServicePeriodFrom(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-800 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Service period (to)</label>
                  <input
                    type="date"
                    value={servicePeriodTo}
                    onChange={(e) => setServicePeriodTo(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-800 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-0.5 min-w-[160px]">
                  <label className="text-xs text-gray-500">Document type</label>
                  <select
                    value={invoiceDocumentKind}
                    onChange={(e) => setInvoiceDocumentKind(e.target.value)}
                    disabled={documentKindLockedByIrn}
                    title={
                      documentKindLockedByIrn
                        ? 'Document type is fixed after e-invoice (IRN) is generated'
                        : 'Tax invoice uses INV-… numbers; proforma uses PFI-… numbers'
                    }
                    className="px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-800 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="tax">Tax invoice</option>
                    <option value="proforma">Proforma invoice</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPoId('');
                  setItems([]);
                  setAttendanceFiles([]);
                  setDocument2Files([]);
                  setInvoiceDocumentKind('tax');
                  setInvoiceDraft(null);
                }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 bg-slate-100/90 space-y-5">
              {/* EXACT same invoice UI as Manage Invoices preview (live while editing) */}
              <div className="mx-auto max-w-5xl">
                <InvoiceHtmlPreview inv={livePreviewInv} showEInvoiceMeta={false} />
              </div>

              {/* Editing controls (kept as form UI below the preview) */}
              <div className="mx-auto max-w-[920px] border-2 border-neutral-800 bg-white text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <div className="border-x-0 border-b border-neutral-800 overflow-hidden bg-[#eef2f7]">
            <div className="p-2">
              <div className="bg-white rounded-lg overflow-hidden">
                {isLumpSumBilling ? (
                  <div className="px-3 py-2.5 border-b border-amber-200/90 bg-amber-50/60">
                    <label className="flex flex-wrap items-start gap-2.5 text-sm text-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                        checked={lumpSumSubtractPenaltyInRate}
                        onChange={(e) => {
                          if (lumpSumPenaltyActive) return;
                          setLumpSumInvoicePenaltyGeometry(!!e.target.checked);
                        }}
                        disabled={lumpSumPenaltyActive}
                        aria-label="Duty geometry with PO penalty"
                      />
                      <span>
                        <span className="font-semibold">Duty geometry — PO penalty on rate</span>
                        <span className="text-neutral-600">
                          {' '}
                          Adds the Penalty (₹) column (from PO Rate per Category, next to Qty/Rate) and uses{' '}
                        </span>
                        <span className="font-mono text-[11px] text-neutral-800 whitespace-nowrap">
                          Rate = (Actual ÷ Authorised) × PO rate − Penalty
                        </span>
                        <span className="text-neutral-600"> on each duty-geometry line.</span>
                      </span>
                    </label>
                    {lumpSumPenaltyActive ? (
                      <p className="text-[11px] text-amber-900/85 mt-2 pl-7">
                        This PO is configured for penalty mode; the formula always applies for lump sum.
                      </p>
                    ) : null}
                    {lumpSumSubtractPenaltyInRate ? (
                      <div className="mt-2 ml-7 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportGeometrySectionToExcel}
                          disabled={!lumpSumGeometryRowsForExport.length}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                        >
                          Export Geometry to Excel
                        </button>
                        <span className="text-[11px] text-amber-900/80 max-w-xl">
                          Works for all lump sum layouts (including truck): exports every duty-geometry category row.
                        </span>
                      </div>
                    ) : null}
                    {lumpSumSingleInvoiceTableMode ? (
                      <div className="mt-3 ml-7 mr-1 rounded-md border border-amber-200 bg-white/80 p-2.5">
                        <p className="text-xs font-semibold text-amber-900">Geometry inputs (calculation source)</p>
                        <p className="text-[11px] text-amber-900/85 mt-1">
                          Edit each geometry category below; the invoice table shows their cumulative totals on the first line. Add supplementary rows (Qty × Rate) under the table for extras.
                        </p>
                        <div className="mt-2 space-y-2">
                          {items.map((row, rowIdx) => (
                            row.isTruckLine || !row.geometryEnabled ? null : (
                            <div key={`geo-row-${rowIdx}`} className="grid grid-cols-1 gap-2 rounded border border-amber-100 bg-amber-50/30 p-2 md:grid-cols-6">
                              <div className="text-xs text-gray-700 md:col-span-2">
                                <div className="font-medium text-gray-900 truncate" title={row.description || ''}>{row.description || `Line ${rowIdx + 1}`}</div>
                                <div className="text-[11px] text-gray-500">PO rate: ₹{safeNumber(row.poReferenceRate).toLocaleString('en-IN')}</div>
                              </div>
                              <label className="text-[11px] text-gray-700">
                                Actual
                                <input
                                  type="number"
                                  min={0}
                                  value={row.actualDuty ?? 0}
                                  onChange={(e) => updateItem(rowIdx, { actualDuty: e.target.value, geometryEnabled: true })}
                                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-center"
                                />
                              </label>
                              <label className="text-[11px] text-gray-700">
                                Authorised
                                <input
                                  type="number"
                                  min={0}
                                  value={row.authorizedDuty ?? daysInMonth(invoiceDate)}
                                  onChange={(e) => updateItem(rowIdx, { authorizedDuty: e.target.value, geometryEnabled: true })}
                                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-center"
                                />
                              </label>
                              <div className="text-[11px] text-gray-700">
                                Qty
                                <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                  {round3(row.quantity).toLocaleString('en-IN')}
                                </div>
                              </div>
                              <div className="text-[11px] text-gray-700">
                                Amount
                                <div className="mt-1 h-[30px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center text-gray-800">
                                  ₹{round2(row.amount).toLocaleString('en-IN')}
                                </div>
                              </div>
                            </div>
                            )
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="w-full max-w-full min-w-0 overflow-x-auto">
                  <table
                    className={[
                      'w-full min-w-0 max-w-full border-collapse border border-neutral-400 text-sm table-fixed',
                      lumpSumDutyGeometryLineTable ? 'min-w-[820px]' : '',
                    ].join(' ')}
                  >
                    <thead>
                <tr>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[3rem] min-w-[2.5rem] px-1 py-1.5' : 'w-[6%] px-2 py-2',
                    ].join(' ')}
                  >
                    #
                  </th>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-left text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[30%] min-w-[8rem] px-1.5 py-1.5' : 'w-[40%] px-2 py-2',
                    ].join(' ')}
                  >
                    Description
                  </th>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[11%] min-w-[4.25rem] px-1 py-1.5' : 'w-[14%] px-2 py-2',
                    ].join(' ')}
                  >
                    HSN/SAC
                  </th>
                  {null ? (
                    <>
                      <th className="w-[10%] border border-neutral-400 bg-[#e8edf5] px-2 py-2 text-center text-[11px] font-bold text-neutral-900">PO Qty</th>
                      <th className="w-[10%] border border-neutral-400 bg-[#e8edf5] px-2 py-2 text-center text-[11px] font-bold text-neutral-900">Actual</th>
                      <th className="w-[10%] border border-neutral-400 bg-[#e8edf5] px-2 py-2 text-center text-[11px] font-bold text-neutral-900">Auth</th>
                    </>
                  ) : null}
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[10%] min-w-[4rem] px-1 py-1.5' : 'w-[12%] px-2 py-2',
                    ].join(' ')}
                  >
                    Qty
                  </th>
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[11%] min-w-[4.25rem] px-1 py-1.5' : 'w-[14%] px-2 py-2',
                    ].join(' ')}
                  >
                    Rate
                  </th>
                  {lumpSumSubtractPenaltyInRate ? (
                    <th
                      className={[
                        'border border-neutral-400 bg-[#e8edf5] text-center text-[11px] font-bold text-neutral-900',
                        lumpSumDutyGeometryLineTable ? 'w-[10%] min-w-[3.75rem] px-1 py-1.5 leading-tight' : 'w-[12%] px-2 py-2',
                      ].join(' ')}
                    >
                      Penalty (₹)
                    </th>
                  ) : null}
                  <th
                    className={[
                      'border border-neutral-400 bg-[#e8edf5] text-right text-[11px] font-bold text-neutral-900',
                      lumpSumDutyGeometryLineTable ? 'w-[13%] min-w-[4.5rem] px-1 py-1.5' : 'w-[14%] px-2 py-2',
                    ].join(' ')}
                  >
                    Amount
                  </th>
                </tr>
                    </thead>
                    <tbody className="bg-white">
                {invoiceTableRows.map((tableRow, tableIdx) => {
                  const isLumpConsolidatedRow = tableRow.kind === 'lumpConsolidated';
                  const ii = tableRow.kind === 'item' ? tableRow.itemIndex : null;
                  const it = isLumpConsolidatedRow ? consolidatedLumpSumLine : items[ii];
                  if (!it && !isLumpConsolidatedRow) return null;
                  const rowKey =
                    tableRow.kind === 'lumpConsolidated'
                      ? 'lump-sum-consolidated'
                      : `item-${ii}`;
                  const isLumpSumSupplementaryRow =
                    ii != null && !!it && !it.isTruckLine && isLumpSumBilling && !it.geometryEnabled;
                  const hsnEditable =
                    !!it &&
                    (it.isTruckLine || (ii != null && isLumpSumBilling && !it.geometryEnabled && !isLumpConsolidatedRow));
                  const canDutyRuler =
                    ii != null &&
                    !isLumpConsolidatedRow &&
                    !lumpSumSingleInvoiceTableMode &&
                    !it.isTruckLine &&
                    (isMonthlyBilling || isLumpSumBilling);
                  const rateDerived =
                    isLumpConsolidatedRow ||
                    (isMonthlyBilling && it.geometryEnabled) ||
                    (isLumpSumBilling && !it.isTruckLine && it.geometryEnabled);
                  const mergedMmDescOpts =
                    isMmOnlyVertical && !it.isTruckLine && ii != null
                      ? (() => {
                          const m = [...mmDescriptionOptions];
                          if (it.description && !m.includes(it.description)) m.push(it.description);
                          m.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                          return m;
                        })()
                      : [];
                  return (
                  <React.Fragment key={rowKey}>
                  <tr className={activeGeometryRowIdx === tableIdx ? 'bg-indigo-50/60' : undefined}>
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle text-xs text-neutral-800',
                        lumpSumDutyGeometryLineTable ? 'min-w-0 px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{tableIdx + 1}</span>
                        {it?.isTruckLine && ii != null ? (
                          <button
                            type="button"
                            onClick={() => removeTruckLine(ii)}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                        {it?.isLumpSumSupplementaryLine && ii != null ? (
                          <button
                            type="button"
                            onClick={() => removeLumpSumSupplementaryLine(ii)}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={[
                        'border border-neutral-400 align-middle text-xs font-medium text-neutral-900 min-w-0',
                        lumpSumDutyGeometryLineTable ? 'px-1.5 py-1' : 'px-2 py-2',
                      ].join(' ')}
                      title={it.description || ''}
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        {it.isTruckLine && ii != null ? (
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(ii, { description: e.target.value })}
                            className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 text-sm font-normal"
                            placeholder="Truck / transport line"
                          />
                        ) : isLumpConsolidatedRow ? (
                          <span
                            className={
                              lumpSumDutyGeometryLineTable
                                ? 'min-w-0 text-[11px] leading-snug break-words'
                                : 'truncate'
                            }
                          >
                            {it.description}
                          </span>
                        ) : isLumpSumSupplementaryRow && ii != null ? (
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(ii, { description: e.target.value })}
                            className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 text-sm font-normal"
                            placeholder="Supplementary line description"
                          />
                        ) : isMmServiceDescriptionMode && ii != null ? (
                          it.description ? (
                            <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                              <span className="truncate">{it.description}</span>
                              <button
                                type="button"
                                onClick={() => clearMmDescriptionRow(ii)}
                                className="shrink-0 text-[11px] text-red-600 hover:underline"
                                title="Clear selected description"
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <select
                              id={`mm-invoice-desc-select-${ii}`}
                              className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 text-sm font-normal bg-white"
                              aria-label={`Line ${ii + 1} description`}
                              value=""
                              onChange={(e) => handleMmDescriptionSelect(ii, e.target.value)}
                            >
                              <option value="">Select description…</option>
                              {mergedMmDescOpts.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )
                        ) : (
                          <span
                            className={
                              lumpSumDutyGeometryLineTable ? 'min-w-0 text-[11px] leading-snug break-words' : 'truncate'
                            }
                          >
                            {it.description}
                          </span>
                        )}
                        {canDutyRuler && ii != null ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGeometryRowIdx(tableIdx);
                              updateItem(ii, { geometryEnabled: !it.geometryEnabled });
                            }}
                            className={[
                              'shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border',
                              it.geometryEnabled
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                            ].join(' ')}
                            title={
                              isLumpSumBilling
                                ? 'Duty-based rate (Lump sum)'
                                : 'Geometry calculator (Monthly)'
                            }
                            aria-label="Duty geometry calculator"
                          >
                            <Ruler className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                      {it.isTruckLine ? (
                        <span className="mt-1 inline-block text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Truck line</span>
                      ) : null}
                      {isLumpSumSupplementaryRow ? (
                        <span className="mt-1 inline-block text-[10px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">Qty × Rate</span>
                      ) : null}
                    </td>
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle font-mono text-neutral-800 min-w-0',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px]' : 'px-2 py-2 text-xs',
                      ].join(' ')}
                    >
                      {hsnEditable && ii != null ? (
                        <input
                          type="text"
                          value={it.hsnSac || ''}
                          onChange={(e) => updateItem(ii, { hsnSac: e.target.value })}
                          className={
                            lumpSumDutyGeometryLineTable
                              ? 'w-full min-w-0 max-w-full box-border mx-auto border border-gray-300 rounded px-1 py-0.5 text-[11px] text-center font-mono h-7'
                              : 'w-full max-w-[7rem] mx-auto border border-gray-300 rounded px-1 py-1 text-xs text-center font-mono'
                          }
                        />
                      ) : (
                        <span className="block break-all font-mono">{it.hsnSac || '–'}</span>
                      )}
                    </td>
                    {null ? (
                      <>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={it.poQty ?? 0}
                            onChange={(e) => updateItem(ii, { poQty: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center"
                            step="1"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={it.actualDuty ?? 0}
                            onChange={(e) => updateItem(ii, { actualDuty: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center"
                            step="1"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={it.authorizedDuty ?? daysInMonth(invoiceDate)}
                            onChange={(e) => updateItem(ii, { authorizedDuty: e.target.value })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center"
                            step="1"
                          />
                        </td>
                      </>
                    ) : null}
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle min-w-0',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      <input
                        type="number"
                        min={0}
                        step={
                          (isMonthlyBilling || (isLumpSumBilling && it.geometryEnabled)) && !it.isTruckLine
                            ? '0.001'
                            : undefined
                        }
                        value={it.quantity}
                        onChange={(e) => {
                          if (ii == null) return;
                          updateItem(ii, { quantity: e.target.value });
                        }}
                        className={
                          lumpSumDutyGeometryLineTable
                            ? 'w-full min-w-0 max-w-full box-border h-7 text-[11px] px-1 py-0.5 border border-gray-300 rounded text-center'
                            : 'w-24 px-2 py-1 border border-gray-300 rounded-lg text-center'
                        }
                        readOnly={
                          isLumpConsolidatedRow ||
                          (isMonthlyBilling && it.geometryEnabled) ||
                          (isLumpSumBilling && it.geometryEnabled && !it.isTruckLine)
                        }
                      />
                    </td>
                    <td
                      className={[
                        'border border-neutral-400 text-center align-middle min-w-0',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1' : 'px-2 py-2',
                      ].join(' ')}
                    >
                      <input
                        type="number"
                        min={0}
                        value={it.rate}
                        onChange={(e) => {
                          if (ii == null) return;
                          updateItem(ii, { rate: e.target.value });
                        }}
                        className={
                          lumpSumDutyGeometryLineTable
                            ? 'w-full min-w-0 max-w-full box-border h-7 text-[11px] px-1 py-0.5 border border-gray-300 rounded text-center'
                            : 'w-28 px-2 py-1 border border-gray-300 rounded-lg text-center'
                        }
                        readOnly={rateDerived}
                      />
                    </td>
                    {lumpSumSubtractPenaltyInRate ? (
                      <td
                        className={[
                          'border border-neutral-400 text-center align-middle text-neutral-800 min-w-0',
                          lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px] tabular-nums leading-tight' : 'px-2 py-2 text-xs',
                        ].join(' ')}
                      >
                        {it.isTruckLine || isLumpSumSupplementaryRow ? (
                          '–'
                        ) : (
                          <span title="From PO Rate per Category">₹{safeNumber(it.poLinePenalty).toLocaleString('en-IN')}</span>
                        )}
                      </td>
                    ) : null}
                    <td
                      className={[
                        'border border-neutral-400 text-right align-middle font-semibold text-neutral-900 min-w-0 tabular-nums',
                        lumpSumDutyGeometryLineTable ? 'px-1 py-1 text-[11px]' : 'px-2 py-2 text-xs',
                      ].join(' ')}
                    >
                      ₹{round2(it.amount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                  {isMonthlyBilling &&
                  !lumpSumSingleInvoiceTableMode &&
                  it.geometryEnabled &&
                  ii != null ? (
                    <tr className="bg-gray-50">
                      <td colSpan={lineTableColSpan} className="border border-neutral-400 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-700">Geometry (Monthly) calculator</span>
                          {monthlyDutyQtyMode === 'po_geometry' || monthlyDutyQtyMode === 'po_geometry_by_months' ? (
                            <label className="inline-flex items-center gap-2">
                              <span className="text-gray-600">PO Qty</span>
                              <input
                                type="number"
                                min={0}
                                value={it.poQty ?? 0}
                                readOnly
                                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                                step="1"
                              />
                            </label>
                          ) : null}
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Actual duty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.actualDuty ?? 0}
                              onChange={(e) => updateItem(ii, { actualDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Authorised duty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.authorizedDuty ?? daysInMonth(invoiceDate)}
                              onChange={(e) => updateItem(ii, { authorizedDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          {monthlyDutyQtyMode === 'po_geometry_by_months' ? (
                            <label className="inline-flex items-center gap-2">
                              <span className="text-gray-600">Number of months</span>
                              <input
                                type="number"
                                min={1}
                                value={it.numberOfMonths ?? 1}
                                onChange={(e) => updateItem(ii, { numberOfMonths: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                                step="1"
                              />
                            </label>
                          ) : null}
                          <span className="text-gray-500">
                            {monthlyDutyQtyMode === 'duty_ratio'
                              ? 'Qty = (Actual ÷ Authorised) (3 decimals) — per PO Entry rule'
                              : monthlyDutyQtyMode === 'po_geometry_by_months'
                                ? 'Qty = (Actual ÷ Authorised) × (PO Qty ÷ Number of months) (3 decimals) — per PO Entry rule'
                                : 'Qty = (Actual ÷ Authorised) × PO Qty (3 decimals) — per PO Entry rule'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {isLumpSumBilling &&
                  !lumpSumSingleInvoiceTableMode &&
                  !it.isTruckLine &&
                  it.geometryEnabled &&
                  ii != null ? (
                    <tr className="bg-amber-50/40">
                      <td colSpan={lineTableColSpan} className="border border-neutral-400 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-800">Lump sum — duty geometry</span>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">PO Qty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.poQty ?? 0}
                              onChange={(e) => updateItem(ii, { poQty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">PO rate (₹)</span>
                            <input
                              type="number"
                              min={0}
                              value={it.poReferenceRate ?? 0}
                              readOnly
                              className="w-28 px-2 py-1 border border-gray-300 rounded-md text-center bg-gray-100 text-gray-700"
                              step="0.01"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Actual duty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.actualDuty ?? 0}
                              onChange={(e) => updateItem(ii, { actualDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <span className="text-gray-600">Authorised duty</span>
                            <input
                              type="number"
                              min={0}
                              value={it.authorizedDuty ?? daysInMonth(invoiceDate)}
                              onChange={(e) => updateItem(ii, { authorizedDuty: e.target.value })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                              step="1"
                            />
                          </label>
                          {lumpSumBillingMode === 'months_geometry' ? (
                            <label className="inline-flex items-center gap-2">
                              <span className="text-gray-600">Number of months</span>
                              <input
                                type="number"
                                min={1}
                                value={it.numberOfMonths ?? 1}
                                onChange={(e) => updateItem(ii, { numberOfMonths: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-center bg-white"
                                step="1"
                              />
                            </label>
                          ) : null}
                          <span className="text-gray-600 max-w-md">
                            {lumpSumBillingMode === 'months_geometry'
                              ? 'Qty = (Actual ÷ Authorised) × (PO Qty ÷ Number of months) (3 decimals). '
                              : 'Qty = (Actual ÷ Authorised) × PO Qty (3 decimals). '}
                            {lumpSumSubtractPenaltyInRate
                              ? 'Rate = (Actual ÷ Authorised) × PO rate − Penalty (from PO). Amount = Qty × Rate.'
                              : 'Rate = (Actual ÷ Authorised) × PO rate. Amount = Qty × Rate.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
                </div>
                {isLumpSumBilling ? (
                  <div className="px-2 pt-2 pb-1 border-t border-gray-100 bg-white space-y-1.5">
                    <div>
                      <button
                        type="button"
                        onClick={addLumpSumSupplementaryLine}
                        className="text-sm font-medium text-sky-700 hover:text-sky-800 hover:underline"
                      >
                        + Add supplementary line (Qty × Rate)
                      </button>
                      <p className="text-[11px] text-gray-500 mt-0.5 max-w-2xl">
                        Use for ad-hoc extras: amount = Qty × Rate. Supplements are added to the taxable total along with the lump sum geometry cumulative line.
                      </p>
                    </div>
                    {lumpSumTruckActive ? (
                      <div>
                        <button
                          type="button"
                          onClick={addTruckLine}
                          className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
                        >
                          + Add truck line (Qty × Rate only)
                        </button>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          PO-based lines keep the duty-based lump sum formula where applicable; truck lines are separate.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

                <div className="grid grid-cols-1 border-b border-neutral-800 md:grid-cols-2 md:divide-x md:divide-neutral-800 bg-neutral-50/50">
                  <div className="p-3 sm:p-4 text-xs text-neutral-700 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase text-neutral-600">Tax summary</p>
                    <p>
                      <span className="font-semibold text-neutral-600">GST on supply (from PO):</span>{' '}
                      {gstSupplyType === 'inter'
                        ? `IGST (${igstRate}%)`
                        : gstSupplyType === 'sez_zero'
                          ? '0% (SEZ / nil rated)'
                          : `CGST + SGST (${cgstRate}% + ${sgstRate}%)`}
                    </p>
                    <p>
                      <span className="font-semibold text-neutral-600">Payment terms:</span>{' '}
                      {displayPO.paymentTerms || `${displayPO.billingCycle || 30} days`}
                    </p>
                  </div>
                  <div className="p-3 sm:p-4 text-xs">
                    <div className="space-y-1.5 border border-neutral-400 bg-white p-3">
                      <div className="flex justify-between gap-4">
                        <span className="text-neutral-600">Taxable value</span>
                        <span className="font-semibold tabular-nums">₹{taxableValue.toLocaleString('en-IN')}</span>
                      </div>
                      {gstSupplyType === 'intra' ? (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">CGST ({cgstRate}%)</span>
                            <span className="font-semibold tabular-nums">₹{cgstAmt.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">SGST ({sgstRate}%)</span>
                            <span className="font-semibold tabular-nums">₹{sgstAmt.toLocaleString('en-IN')}</span>
                          </div>
                        </>
                      ) : null}
                      {gstSupplyType === 'inter' ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-600">IGST ({igstRate}%)</span>
                          <span className="font-semibold tabular-nums">₹{igstAmt.toLocaleString('en-IN')}</span>
                        </div>
                      ) : null}
                      {gstSupplyType === 'sez_zero' ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-600">GST</span>
                          <span className="font-semibold tabular-nums">₹0 (nil rated)</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-4 border-t border-neutral-400 pt-2 font-bold text-neutral-900">
                        <span>Total</span>
                        <span className="tabular-nums">₹{totalValue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-neutral-800 px-3 sm:px-4 py-3">
                  <p className="text-[11px] font-bold text-neutral-900">Attachments (optional)</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-dashed border-neutral-400 bg-neutral-50/80 p-3">
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1.5">
                        Attendance sheet (Word / Doc / PDF)
                      </label>
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 shrink-0 text-neutral-400" />
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf,.xlsx,.xls"
                          multiple
                          onChange={(e) =>
                            setAttendanceFiles(
                              Array.from(e.target.files || []).map((f) => ({
                                name: f.name,
                                url: URL.createObjectURL(f),
                              }))
                            )
                          }
                          className="w-full min-w-0 text-xs"
                        />
                      </div>
                      {attendanceFiles.length > 0 ? (
                        <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                          {attendanceFiles.length} file(s) selected
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-md border border-dashed border-neutral-400 bg-neutral-50/80 p-3">
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1.5">Document 2 (Doc / PDF)</label>
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 shrink-0 text-neutral-400" />
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf"
                          multiple
                          onChange={(e) =>
                            setDocument2Files(
                              Array.from(e.target.files || []).map((f) => ({
                                name: f.name,
                                url: URL.createObjectURL(f),
                              }))
                            )
                          }
                          className="w-full min-w-0 text-xs"
                        />
                      </div>
                      {document2Files.length > 0 ? (
                        <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                          {document2Files.length} file(s) selected
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="border-b border-neutral-800 px-3 sm:px-4 py-3">
                  <p className="text-[11px] font-bold text-neutral-900">Amount chargeable (in words)</p>
                  <p className="mt-1.5 text-xs font-medium leading-relaxed text-neutral-800">{totalInWords}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-neutral-800 border-b border-neutral-800">
                  <div className="p-3 sm:p-4 text-xs leading-relaxed text-neutral-800">
                    <p className="text-[11px] font-bold text-neutral-900">Bank details</p>
                    <p className="mt-2">A/c Holder&apos;s Name: {INVOICE_BANK_DETAILS.accountHolder}</p>
                    <p>Bank name: {INVOICE_BANK_DETAILS.bankName}</p>
                    <p>A/c No.: {INVOICE_BANK_DETAILS.accountNo}</p>
                    <p>Branch &amp; IFSC Code: {INVOICE_BANK_DETAILS.ifsc}</p>
                    <p className="mt-1.5 leading-relaxed">Bank branch: {INVOICE_BANK_DETAILS.branchAddress}</p>
                    <div className="mt-6 pt-2">
                      <p className="text-sm font-bold text-[#1a3a6c] leading-snug">
                        For {INVOICE_SELLER_TEMPLATE.name}
                      </p>
                      <p className="mt-4 font-bold text-neutral-900">Authorised Signatory</p>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 text-[11px] leading-relaxed text-neutral-800">
                    <p className="font-bold text-neutral-900">Terms &amp; conditions</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4">
                      {(invoiceTermsLinesPreview.length ? invoiceTermsLinesPreview : ['—']).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="border-b border-neutral-800 px-3 py-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900">{INVOICE_JURISDICTION}</p>
                </div>

                {/* Letterhead footer: details on white, then empty solid maroon strip */}
                <div className="w-full border-t border-neutral-300 bg-white">
                  <div className="grid grid-cols-1 gap-4 px-4 py-3 text-[10px] leading-relaxed text-neutral-800 sm:grid-cols-2 sm:items-start sm:gap-10 sm:px-6 sm:py-4 sm:text-[11px]">
                    <div className="space-y-2.5 text-left">
                      <p>
                        <span className="font-semibold text-neutral-900">Phone:</span>{' '}
                        <span className="tabular-nums text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.phone}</span>
                      </p>
                      <p className="break-words">
                        <span className="font-semibold text-neutral-900">Email:</span>{' '}
                        <span className="text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.email}</span>
                      </p>
                    </div>
                    <div className="space-y-2.5 border-t border-neutral-200 pt-4 text-left sm:border-t-0 sm:border-l sm:border-neutral-200 sm:pt-0 sm:pl-8">
                      <p>
                        <span className="font-semibold text-neutral-900">Address:</span>{' '}
                        <span className="text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.address}</span>
                      </p>
                      <p className="break-all sm:break-words">
                        <span className="font-semibold text-neutral-900">Website:</span>{' '}
                        <span className="text-neutral-800">{INVOICE_LETTERHEAD_FOOTER.website}</span>
                      </p>
                    </div>
                  </div>
                  <div
                    className="h-[18px] w-full shrink-0 sm:h-5"
                    style={{ backgroundColor: INVOICE_LETTERHEAD_STRIP_COLOR }}
                    aria-hidden
                  />
                </div>
              </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedPoId('');
                setItems([]);
                setAttendanceFiles([]);
                setDocument2Files([]);
                setInvoiceDocumentKind('tax');
                setInvoiceDraft(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveInvoice}
              disabled={!canSave}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {invoiceDraft?.mode === 'edit' ? 'Update Invoice' : 'Save Invoice'}
            </button>
          </div>
            </div>
          </div>
        </div>
      )}
      {selectedViewInvoice ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                Tax Invoice Preview – {selectedViewInvoice.taxInvoiceNumber || '–'}
              </h3>
              <button type="button" onClick={() => setViewInvoiceId(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-gray-100">
              <InvoiceHtmlPreview inv={selectedViewInvoice} showEInvoiceMeta={false} />
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};

export default CreateInvoice;
