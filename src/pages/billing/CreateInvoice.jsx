import React, { useEffect, useMemo, useState, useRef } from 'react';
import { FileText, Upload, PlusCircle, X, Eye, Compass, Download } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { downloadTaxInvoicePdf, getTaxInvoicePdfBlobUrl, resolveTermsLines } from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount, formatInvoiceTotalDisplay, formatAmountUpTo3Decimals } from '../../utils/invoiceRound';
import { INDUS_LOGO_SRC } from '../../constants/branding.js';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';

const getFinancialYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y}` : `${y - 1}`;
};

const generateTaxInvoiceNumber = (sequence, kind = 'tax') => {
  const y = getFinancialYear();
  const seq = String(sequence).padStart(4, '0');
  if (kind === 'proforma') return `PF-${y}-${seq}`;
  if (kind === 'draft') return `DR-${y}-${seq}`;
  return `INV-${y}-${seq}`;
};

const APPROVAL_STATUS_APPROVED = 'approved';

const SELLER = {
  name: 'Ms Indus Fire Safety Private Limited',
  address: 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara',
  state: 'Gujarat',
  stateCode: '24',
  gstin: '24AADCJ2182H1ZS',
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/** OC vertical segment is often MANP (IFSPL-MANP-OC-…) or full name Manpower from PO form. */
function isManpowerVertical(po) {
  const v = String(po?.vertical || '').trim().toLowerCase();
  return v === 'manpower' || v === 'manp';
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
  const byKey = new Map();
  rows.forEach((r) => {
    const description = (r?.description || r?.designation || '').trim();
    const rate = Number(r?.rate) || 0;
    const qty = Number(r?.qty) || 0;
    const key = `${description.toLowerCase()}|${rate}`;
    if (byKey.has(key)) {
      const prev = byKey.get(key);
      prev.qty += qty;
    } else {
      byKey.set(key, { description, rate, qty });
    }
  });
  return [...byKey.values()];
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

/** YYYY-MM-DD slice for comparisons (DB dates / <input type="date">). */
function toYyyyMmDd(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

/** Calendar days from contract end to reference date (local); negative if reference is before end. */
function daysFromContractEndTo(contractEndYmd, referenceYmd) {
  const a = toYyyyMmDd(contractEndYmd);
  const b = toYyyyMmDd(referenceYmd);
  if (!a || !b) return null;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const tEnd = new Date(y1, m1 - 1, d1);
  const tRef = new Date(y2, m2 - 1, d2);
  return Math.round((tRef - tEnd) / 86400000);
}

/** Days after contract end we still list the PO (final / late tax invoice). */
const POST_CONTRACT_LIST_GRACE_DAYS = 120;

function isPOBillableForCreateInvoice(p, invoiceDateStr) {
  if (p.status !== 'active') return false;
  if ((p.approvalStatus || 'draft') !== APPROVAL_STATUS_APPROVED) return false;
  const inv = toYyyyMmDd(invoiceDateStr);
  if (!inv) return false;
  const end = toYyyyMmDd(p.endDate);
  if (!end) return false;
  const start = p.startDate ? toYyyyMmDd(p.startDate) : null;
  if (start && start > inv) return false;
  if (end >= inv) return true;
  const daysLate = daysFromContractEndTo(end, inv);
  return daysLate != null && daysLate >= 0 && daysLate <= POST_CONTRACT_LIST_GRACE_DAYS;
}

const CreateInvoice = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, setInvoices, invoiceDraft, setInvoiceDraft, refreshBilling } = useBilling();
  const [selectedPoId, setSelectedPoId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]); // { description, hsnSac, quantity, rate, amount }
  const [attendanceFiles, setAttendanceFiles] = useState([]); // [{ name, url }]
  const [document2Files, setDocument2Files] = useState([]); // [{ name, url }]
  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const [geoOpenIdx, setGeoOpenIdx] = useState(null);
  const [pdfPreview, setPdfPreview] = useState({ open: false, url: '', title: '' });
  const [invoiceKind, setInvoiceKind] = useState('tax');
  const [documentInvoiceDate, setDocumentInvoiceDate] = useState(null);
  const [billNumber, setBillNumber] = useState('');
  const [billingMonth, setBillingMonth] = useState('');
  const [headerRemarks, setHeaderRemarks] = useState('');
  const [billingDurFrom, setBillingDurFrom] = useState('');
  const [billingDurTo, setBillingDurTo] = useState('');
  const [digitalSignatureDataUrl, setDigitalSignatureDataUrl] = useState('');
  const [igstRate, setIgstRate] = useState(18);
  const prevSelectedPoRef = useRef('');

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (selectedPoId && selectedPoId !== prevSelectedPoRef.current) {
      prevSelectedPoRef.current = selectedPoId;
      setDocumentInvoiceDate(invoiceDate);
    }
  }, [selectedPoId, invoiceDate]);

  const billablePOs = useMemo(() => {
    return commercialPOs.filter((p) => isPOBillableForCreateInvoice(p, invoiceDate));
  }, [commercialPOs, invoiceDate]);

  const poTableRows = useMemo(() => {
    return billablePOs.map((po) => {
      const existingInvoice = invoices.find((i) => String(i.poId) === String(po.id));
      const hasInvoice = !!existingInvoice;
      const dCount = daysInMonth(invoiceDate);
      const rateSum = sumRatePerCategory(po);
      const contract = Number(po.totalContractValue) || 0;
      const expected = round2(rateSum * dCount);
      const remaining = round2(contract - expected);
      return {
        ...po,
        statusLabel: hasInvoice ? 'Created Tax Invoice' : 'Commercial Manager Approved',
        hasInvoice,
        existingInvoiceId: existingInvoice?.id || null,
        _calc: { days: dCount, rateSum, contract, expected, remaining },
      };
    });
  }, [billablePOs, invoices, invoiceDate]);

  const selectedPO = useMemo(
    () => billablePOs.find((p) => String(p.id) === String(selectedPoId) || p.siteId === selectedPoId),
    [billablePOs, selectedPoId]
  );

  const editingInvoice = useMemo(() => {
    if (!invoiceDraft?.invoiceId) return null;
    return invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) || null;
  }, [invoiceDraft, invoices]);

  const displayPO = useMemo(() => {
    if (selectedPO) return selectedPO;
    if (invoiceDraft?.mode === 'edit' && editingInvoice) {
      return {
        id: editingInvoice.poId,
        siteId: editingInvoice.siteId,
        locationName: editingInvoice.clientLegalName || '',
        ocNumber: editingInvoice.ocNumber,
        poWoNumber: editingInvoice.poWoNumber,
        legalName: editingInvoice.clientLegalName,
        billingAddress: editingInvoice.clientAddress,
        shippingAddress: editingInvoice.clientShippingAddress || editingInvoice.clientAddress,
        gstin: editingInvoice.gstin,
        hsnCode: editingInvoice.hsnSac,
        sacCode: editingInvoice.hsnSac,
        billingType: editingInvoice.billingType || 'Monthly',
        paymentTerms: editingInvoice.paymentTerms,
        billingCycle: 30,
        gstSupplyType: editingInvoice.gstSupplyType || 'intra',
        vertical: editingInvoice.poVertical || editingInvoice.termsTemplateKey || 'BILL',
        invoiceTermsText: editingInvoice.termsCustomText || editingInvoice.termsText || '',
        sellerCin: editingInvoice.sellerCin,
        sellerPan: editingInvoice.sellerPan,
        msmeRegistrationNo: editingInvoice.msmeRegistrationNo,
        msmeClause: editingInvoice.msmeClause,
        placeOfSupply: editingInvoice.placeOfSupply,
      };
    }
    return null;
  }, [selectedPO, invoiceDraft, editingInvoice]);

  /** Terms shown on PDF: custom text from PO (or invoice snapshot when editing); else vertical template. */
  const invoiceTermsPreviewLines = useMemo(() => {
    if (!displayPO) return [];
    const t = (displayPO.invoiceTermsText || '').trim();
    return resolveTermsLines({
      termsCustomText: t || undefined,
      termsText: t || undefined,
      termsTemplateKey: displayPO.vertical || 'BILL',
      poVertical: displayPO.vertical,
    });
  }, [displayPO]);

  useEffect(() => {
    if (!invoiceDraft) return;
    if (invoiceDraft.mode === 'edit' && editingInvoice) {
      setSelectedPoId(String(editingInvoice.poId || ''));
      setInvoiceDate(editingInvoice.invoiceDate || editingInvoice.created_at || today);
      setDocumentInvoiceDate(editingInvoice.invoiceDate || editingInvoice.created_at || today);
      setInvoiceKind(editingInvoice.invoiceKind || 'tax');
      setBillNumber(editingInvoice.billNumber || '');
      setBillingMonth(editingInvoice.billingMonth || '');
      setHeaderRemarks(editingInvoice.invoiceHeaderRemarks || '');
      setBillingDurFrom(editingInvoice.billingDurationFrom || '');
      setBillingDurTo(editingInvoice.billingDurationTo || '');
      setDigitalSignatureDataUrl(editingInvoice.digitalSignatureDataUrl || '');
      setIgstRate(Number(editingInvoice.igstRate) || 18);
      const atts = Array.isArray(editingInvoice.attachments) ? editingInvoice.attachments : [];
      setAttendanceFiles(atts.filter((a) => a.type === 'attendance').map((a) => ({ name: a.name, url: a.url })));
      setDocument2Files(atts.filter((a) => a.type === 'document_2').map((a) => ({ name: a.name, url: a.url })));
      setItems(
        (editingInvoice.items || []).map((i) => ({
          description: i.description || i.designation || '',
          hsnSac: i.hsnSac || editingInvoice.hsnSac || '',
          quantity: Number(i.quantity) || 0,
          poQty: Number(i.poQty) || 0,
          actualDuty: Number(i.actualDuty) || 0,
          authorizedDuty: Number(i.authorizedDuty) || 0,
          rate: Number(i.rate) || 0,
          amount: round2((Number(i.quantity) || 0) * (Number(i.rate) || 0)),
        }))
      );
      return;
    }
    if (invoiceDraft.mode === 'create' && invoiceDraft.poId) {
      setSelectedPoId(String(invoiceDraft.poId));
    }
  }, [invoiceDraft, editingInvoice, today]);

  useEffect(() => {
    if (!selectedPO) return;
    // Only seed items when creating (not when editing with existing items)
    if (invoiceDraft?.mode === 'edit') return;
    const hsnSac = selectedPO.hsnCode || selectedPO.sacCode || '';
    const uniqueRates = getUniqueRateRows(selectedPO);
    const headerPoQty = Number(selectedPO.poQuantity) || 0;
    setItems(
      uniqueRates.map((r) => {
        const lineQty = Number(r.qty) || 0;
        const poQty =
          lineQty ||
          (uniqueRates.length === 1 && headerPoQty > 0 ? headerPoQty : 0);
        return {
          description: r.description,
          hsnSac,
          quantity: 0,
          poQty,
          actualDuty: 0,
          authorizedDuty: 0,
          rate: Number(r.rate) || 0,
          amount: 0,
        };
      })
    );
  }, [selectedPO, invoiceDraft]);

  useEffect(() => {
    let mounted = true;

    const syncCentralData = async () => {
      try {
        await refreshBilling?.();
      } catch {
        // Non-blocking: UI still works with current in-memory/local data.
      }
    };

    syncCentralData();
    const retryTimer = setTimeout(() => {
      if (mounted) syncCentralData();
    }, 700);

    const onFocus = () => {
      syncCentralData();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshBilling]);

  const isMonthlyBilling = (displayPO?.billingType || '').toLowerCase().includes('monthly');
  const isManpowerMonthly = isMonthlyBilling && isManpowerVertical(displayPO);

  const updateItem = (idx, patch) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (isMonthlyBilling) {
          const poQty = Number(next.poQty) || 0;
          const actualDuty = Number(next.actualDuty) || 0;
          const authorizedDuty = Number(next.authorizedDuty) || 0;
          const rawQty = authorizedDuty > 0 ? (actualDuty / authorizedDuty) * poQty : 0;
          next.quantity = isManpowerMonthly ? round3(rawQty) : round2(rawQty);
        }
        const qty = Number(next.quantity) || 0;
        const rate = Number(next.rate) || 0;
        next.amount = round2(qty * rate);
        return next;
      })
    );
  };

  const applyGeometryQty = (idx) => {
    const line = items[idx];
    const poQty = Number(line?.poQty) || 0;
    const actualDuty = Number(line?.actualDuty) || 0;
    const authorizedDuty = Number(line?.authorizedDuty) || 0;
    const qty = authorizedDuty > 0 ? (actualDuty / authorizedDuty) * poQty : 0;
    updateItem(idx, { quantity: qty });
    setGeoOpenIdx(null);
  };

  const gstSupplyType = displayPO?.gstSupplyType || 'intra';
  const taxableValue = useMemo(() => round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0)), [items]);
  const cgstRate = 9;
  const sgstRate = 9;
  const cgstAmt = useMemo(() => {
    if (gstSupplyType === 'sez_zero' || gstSupplyType === 'inter') return 0;
    return round2((taxableValue * cgstRate) / 100);
  }, [taxableValue, gstSupplyType]);
  const sgstAmt = useMemo(() => {
    if (gstSupplyType === 'sez_zero' || gstSupplyType === 'inter') return 0;
    return round2((taxableValue * sgstRate) / 100);
  }, [taxableValue, gstSupplyType]);
  const igstAmt = useMemo(() => {
    if (gstSupplyType !== 'inter') return 0;
    return round2((taxableValue * Number(igstRate || 0)) / 100);
  }, [taxableValue, gstSupplyType, igstRate]);
  const totalValue = useMemo(
    () => roundInvoiceAmount(taxableValue + cgstAmt + sgstAmt + igstAmt),
    [taxableValue, cgstAmt, sgstAmt, igstAmt]
  );

  const docDateForSave = documentInvoiceDate || invoiceDate;
  const canSave =
    !!displayPO &&
    items.length > 0 &&
    String(displayPO.legalName || '').trim().length > 0 &&
    (invoiceKind !== 'tax' || String(displayPO.gstin || '').trim().length === 15);
  const selectedViewInvoice = useMemo(
    () => {
      if (viewInvoiceId === '__draft__') return null;
      return invoices.find((i) => String(i.id) === String(viewInvoiceId)) || null;
    },
    [invoices, viewInvoiceId]
  );

  const draftPreviewInvoice = useMemo(() => {
    if (invoiceDraft?.mode !== 'edit' || !displayPO) return null;
    const existing = invoiceDraft?.invoiceId ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const taxInvoiceNumber = existing?.taxInvoiceNumber || generateTaxInvoiceNumber(invoices.length + 1, invoiceKind);
    const poVertical = displayPO.vertical || 'BILL';
    const termsTxt = (displayPO.invoiceTermsText || '').trim();
    const shipAddr = (displayPO.shippingAddress || '').trim() || displayPO.billingAddress;
    return {
      ...(existing || {}),
      id: existing?.id || 'draft-preview',
      poId: displayPO.id,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      taxInvoiceNumber,
      invoiceDate: docDateForSave,
      invoiceKind,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? Number(igstRate) || 0 : 0,
      igstAmt,
      clientLegalName: displayPO.legalName,
      clientAddress: displayPO.billingAddress,
      clientShippingAddress: shipAddr,
      placeOfSupply: (displayPO.placeOfSupply || '').trim() || undefined,
      gstin: displayPO.gstin,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: displayPO.hsnCode || displayPO.sacCode || '',
      billNumber: billNumber || undefined,
      billingMonth: billingMonth || undefined,
      sellerCin: displayPO.sellerCin || undefined,
      sellerPan: displayPO.sellerPan || undefined,
      msmeRegistrationNo: displayPO.msmeRegistrationNo || undefined,
      msmeClause: displayPO.msmeClause || undefined,
      invoiceHeaderRemarks: headerRemarks || undefined,
      billingDurationFrom: billingDurFrom || undefined,
      billingDurationTo: billingDurTo || undefined,
      termsTemplateKey: poVertical,
      poVertical,
      termsText: termsTxt || undefined,
      termsCustomText: termsTxt || undefined,
      digitalSignatureDataUrl: digitalSignatureDataUrl || undefined,
      items: items.map((i) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        quantity: Number(i.quantity) || 0,
        poQty: Number(i.poQty) || 0,
        actualDuty: Number(i.actualDuty) || 0,
        authorizedDuty: Number(i.authorizedDuty) || 0,
        rate: Number(i.rate) || 0,
        amount: round2(i.amount),
      })),
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paymentTerms: displayPO.paymentTerms || `${displayPO.billingCycle || 30} days`,
      created_at: existing?.created_at || today,
    };
  }, [
    invoiceDraft,
    displayPO,
    invoices,
    items,
    docDateForSave,
    invoiceKind,
    gstSupplyType,
    igstRate,
    igstAmt,
    taxableValue,
    cgstRate,
    sgstRate,
    cgstAmt,
    sgstAmt,
    totalValue,
    today,
    billNumber,
    billingMonth,
    headerRemarks,
    billingDurFrom,
    billingDurTo,
    digitalSignatureDataUrl,
  ]);

  useEffect(() => {
    return () => {
      if (pdfPreview.url) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview.url]);

  const openPdfPreview = async (inv, title) => {
    const url = await getTaxInvoicePdfBlobUrl(inv);
    if (!url) return;
    if (pdfPreview.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview({ open: true, url, title: title || 'Tax Invoice Preview' });
  };

  const handleSaveInvoice = () => {
    if (!displayPO || !canSave) return;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const nextNumericId = Math.max(0, ...invoices.map((i) => Number(i.id) || 0), 0) + 1;
    const id = existing?.id ?? nextNumericId;
    const taxInvoiceNumber = existing?.taxInvoiceNumber || generateTaxInvoiceNumber(invoices.length + 1, invoiceKind);
    const termsTxt = (displayPO.invoiceTermsText || '').trim();
    const shipAddr = (displayPO.shippingAddress || '').trim() || displayPO.billingAddress;
    const poVertical = displayPO.vertical || 'BILL';

    const inv = {
      ...(existing || {}),
      id,
      poId: displayPO.id,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      taxInvoiceNumber,
      invoiceDate: docDateForSave,
      invoiceKind,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? Number(igstRate) || 0 : 0,
      igstAmt,
      billNumber: billNumber || null,
      billingMonth: billingMonth || null,
      sellerCin: displayPO.sellerCin || null,
      sellerPan: displayPO.sellerPan || null,
      msmeRegistrationNo: displayPO.msmeRegistrationNo || null,
      msmeClause: displayPO.msmeClause || null,
      invoiceHeaderRemarks: headerRemarks || null,
      billingDurationFrom: billingDurFrom || null,
      billingDurationTo: billingDurTo || null,
      termsTemplateKey: poVertical,
      poVertical,
      termsText: termsTxt || null,
      termsCustomText: termsTxt || null,
      digitalSignatureDataUrl: digitalSignatureDataUrl || null,
      clientLegalName: displayPO.legalName,
      clientAddress: displayPO.billingAddress,
      clientShippingAddress: shipAddr || null,
      placeOfSupply: (displayPO.placeOfSupply || '').trim() || null,
      gstin: displayPO.gstin,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: displayPO.hsnCode || displayPO.sacCode || '',
      items: items.map((i) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        quantity: Number(i.quantity) || 0,
        poQty: Number(i.poQty) || 0,
        actualDuty: Number(i.actualDuty) || 0,
        authorizedDuty: Number(i.authorizedDuty) || 0,
        rate: Number(i.rate) || 0,
        amount: round2(i.amount),
      })),
      attachments: [
        ...attendanceFiles.map((f) => ({ name: f.name || 'attendance', type: 'attendance', url: f.url || '#' })),
        ...document2Files.map((f) => ({ name: f.name || 'document_2', type: 'document_2', url: f.url || '#' })),
      ],
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: existing?.paStatus || 'Pending',
      paymentStatus: existing?.paymentStatus || false,
      pendingAmount: existing?.pendingAmount ?? totalValue,
      created_at: existing?.created_at || today,
      createdAt: existing?.createdAt || today,
      updated_at: today,
    };

    setInvoices((prev) => {
      if (existing) return prev.map((p) => (String(p.id) === String(existing.id) ? inv : p));
      return [...prev, inv];
    });
    setInvoiceDraft(null);
    onNavigateTab && onNavigateTab('manage-invoices');
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-emerald-100 p-3 rounded-lg shrink-0">
          <FileText className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Create Invoice</h2>
          <p className="text-sm text-gray-600">Select Commercial Manager approved PO; invoice format as per template; edit only quantity/rate; save → Manage Invoices</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <h3 className="font-semibold text-gray-900 p-4 pb-2">1. Select PO/WO (only “Commercial Manager Approved”)</h3>
        <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100">
          <p className="text-xs text-gray-600 max-w-xl">
            POs are filtered by this <span className="font-medium">Invoice date</span> and the PO start/end dates. If an approved PO is missing, set the date on or before the PO end date, or within {POST_CONTRACT_LIST_GRACE_DAYS} days after end for a late final invoice.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="create-inv-po-list-date" className="text-sm text-gray-600 whitespace-nowrap">
              Invoice date
            </label>
            <input
              id="create-inv-po-list-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
        {billablePOs.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 py-4">
            No PO found for this invoice date. In Commercial → PO Entry, use <span className="font-medium">Send to approval</span> and <span className="font-medium">Commercial Manager approval</span>. If the PO is already approved, adjust <span className="font-medium">Invoice date</span> above so it falls between the PO start and end dates (or shortly after end for a final bill).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OC Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Site / Location</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO/WO</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining (₹)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {poTableRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{row.ocNumber || '–'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.siteId && row.locationName ? `${row.siteId} – ${row.locationName}` : row.siteId || row.locationName || '–'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.poWoNumber || '–'}</td>
                    <td className="px-4 py-3 text-sm">
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
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${row.hasInvoice ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {row.hasInvoice && row.existingInvoiceId && (
                          <button
                            type="button"
                            onClick={() => {
                              const inv = invoices.find((i) => String(i.id) === String(row.existingInvoiceId));
                              if (inv) void openPdfPreview(inv, `Tax Invoice Preview – ${inv.taxInvoiceNumber || 'Invoice'}`);
                            }}
                            title="View Tax Invoice"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPoId(String(row.id))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Create Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 px-4 pt-2 pb-4">Click <strong>Create Invoice</strong> to open the form for the selected PO.</p>
      </div>

      {displayPO && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3 rounded-t-xl z-10">
              <div className="flex items-center gap-3 min-w-0">
                <img src={INDUS_LOGO_SRC} alt="" className="h-10 w-10 object-contain shrink-0" width={40} height={40} />
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {invoiceDraft?.mode === 'edit' ? 'Edit' : 'Create'} Invoice – {displayPO.siteId || '–'} – {displayPO.locationName || displayPO.legalName || '–'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPoId('');
                  setItems([]);
                  setAttendanceFiles([]);
                  setDocument2Files([]);
                  setInvoiceDraft(null);
                }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-500">
              OC: <span className="font-medium text-gray-700">{displayPO.ocNumber}</span> · PO/WO: <span className="font-medium text-gray-700">{displayPO.poWoNumber}</span>
            </p>
            <div className="flex flex-col items-end gap-1">
              <label className="text-sm text-gray-600">Invoice type</label>
              <select
                value={invoiceKind}
                onChange={(e) => setInvoiceKind(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="tax">Tax Invoice</option>
                <option value="proforma">Proforma Invoice</option>
                <option value="draft">Draft Invoice</option>
              </select>
              <p className="text-sm text-gray-600">
                Invoice date: <span className="font-semibold text-gray-900">{docDateForSave}</span>
                <span className="text-xs text-gray-500 block text-right">(fixed when PO selected; change via list filter before opening)</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm border border-gray-200 rounded-lg p-4 bg-gray-50/80">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bill number</label>
              <input type="text" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing month (e.g. Apr 2026)</label>
              <input type="text" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing duration from</label>
              <input type="date" value={billingDurFrom} onChange={(e) => setBillingDurFrom(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing duration to</label>
              <input type="date" value={billingDurTo} onChange={(e) => setBillingDurTo(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description / remarks (NH/PH etc.) — above line items</label>
              <textarea value={headerRemarks} onChange={(e) => setHeaderRemarks(e.target.value)} rows={2} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </div>
            {gstSupplyType === 'inter' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">IGST %</label>
                <input type="number" value={igstRate} onChange={(e) => setIgstRate(Number(e.target.value) || 0)} className="w-full border border-gray-300 rounded px-2 py-1.5" min="0" max="28" />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Digital signature (PNG/JPG)</label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setDigitalSignatureDataUrl(typeof r.result === 'string' ? r.result : '');
                  r.readAsDataURL(f);
                }}
                className="text-sm"
              />
              {digitalSignatureDataUrl && <p className="text-xs text-emerald-600 mt-1">Signature attached</p>}
            </div>
            <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-1 space-y-3">
              <p className="text-xs font-semibold text-gray-800">From PO (edit in Commercial → PO Entry)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-700">
                <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-3">
                  <p className="font-medium text-gray-600 mb-2">Seller compliance on invoice</p>
                  <ul className="space-y-0.5 font-mono text-[11px]">
                    <li>CIN: {displayPO.sellerCin || '–'}</li>
                    <li>PAN: {displayPO.sellerPan || '–'}</li>
                    <li>MSME Udyam: {displayPO.msmeRegistrationNo || '–'}</li>
                  </ul>
                  {displayPO.msmeClause ? (
                    <p className="mt-2 text-gray-600 whitespace-pre-wrap leading-snug">{displayPO.msmeClause}</p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-3">
                  <p className="font-medium text-gray-600 mb-2">Terms &amp; conditions (as printed)</p>
                  <ol className="list-decimal list-inside space-y-0.5 max-h-36 overflow-y-auto text-gray-800">
                    {invoiceTermsPreviewLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                  {!(displayPO.invoiceTermsText || '').trim() && (
                    <p className="mt-2 text-[10px] text-gray-500">No custom text on PO — using {displayPO.vertical || 'BILL'} template.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-3 text-xs">
                <p className="font-medium text-gray-600 mb-1">Consignee (ship to)</p>
                <p className="text-gray-800 whitespace-pre-wrap">
                  {(displayPO.shippingAddress || '').trim()
                    ? displayPO.shippingAddress
                    : <span className="text-gray-500">Same as billing address</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Seller</p>
              <p className="font-semibold text-gray-900">{SELLER.name}</p>
              <p className="text-gray-700">{SELLER.address}</p>
              <p className="text-gray-700">GSTIN: <span className="font-mono">{SELLER.gstin}</span></p>
              <p className="text-gray-700">State: {SELLER.state} (Code: {SELLER.stateCode})</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Buyer (Bill to)</p>
              <p className="font-semibold text-gray-900">{displayPO.legalName}</p>
              <p className="text-gray-700 whitespace-pre-wrap">{displayPO.billingAddress}</p>
              <p className="text-gray-700">GSTIN: <span className="font-mono">{displayPO.gstin}</span></p>
              <p className="text-gray-700">
                Place of Supply:{' '}
                {(displayPO.placeOfSupply || '').trim() || displayPO.billingAddress?.split(',').pop()?.trim() || '–'}
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Consignee (Ship to)</p>
              <p className="font-semibold text-gray-900">{displayPO.legalName}</p>
              <p className="text-gray-700 whitespace-pre-wrap">
                {(displayPO.shippingAddress || '').trim() ? displayPO.shippingAddress : displayPO.billingAddress}
              </p>
              <p className="text-gray-700">GSTIN: <span className="font-mono">{displayPO.gstin}</span></p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600">#</th>
                  <th className="px-3 py-2 text-left text-gray-600">Description</th>
                  <th className="px-3 py-2 text-left text-gray-600">HSN/SAC</th>
                  <th className="px-3 py-2 text-left text-gray-600">Qty</th>
                  <th className="px-3 py-2 text-left text-gray-600">Rate</th>
                  <th className="px-3 py-2 text-right text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <div className="flex items-center justify-between gap-2">
                        <span>{it.description}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isMonthlyBilling) return;
                            setGeoOpenIdx((prev) => (prev === idx ? null : idx));
                          }}
                          disabled={!isMonthlyBilling}
                          title={isMonthlyBilling ? 'Monthly duty calculator' : 'Available only for Monthly billing'}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-md border shrink-0 ${
                            isMonthlyBilling
                              ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                              : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Compass className="w-4 h-4" />
                        </button>
                      </div>
                      {isMonthlyBilling && geoOpenIdx === idx && (
                        <div className="mt-2 border border-violet-200 rounded-md p-2 bg-violet-50/40">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <input
                              type="number"
                              min={0}
                              placeholder="Actual duty"
                              value={it.actualDuty ?? ''}
                              onChange={(e) => updateItem(idx, { actualDuty: e.target.value })}
                              className="px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="Authorized duty"
                              value={it.authorizedDuty ?? ''}
                              onChange={(e) => updateItem(idx, { authorizedDuty: e.target.value })}
                              className="px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="PO Qty"
                              value={it.poQty ?? 0}
                              readOnly
                              className="px-2 py-1 border border-gray-200 bg-gray-100 rounded text-xs"
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => applyGeometryQty(idx)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50">Apply Qty = (Actual/Authorized) * PO Qty</button>
                            <span className="self-center text-xs text-gray-600">
                              Auto Qty:{' '}
                              {isManpowerMonthly
                                ? formatAmountUpTo3Decimals(it.quantity)
                                : (Number(it.quantity) || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{it.hsnSac || '–'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={isManpowerMonthly ? 0.001 : 0.01}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                        readOnly={isMonthlyBilling}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={it.rate}
                        onChange={(e) => updateItem(idx, { rate: e.target.value })}
                        className="w-28 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">₹{formatAmountUpTo3Decimals(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="text-gray-500">Payment terms:</span> {displayPO.paymentTerms || `${displayPO.billingCycle || 30} days`}</p>
              <p><span className="text-gray-500">Invoice date:</span> {formatDate(docDateForSave)}</p>
              <p><span className="text-gray-500">GST on supply:</span>{' '}
                {gstSupplyType === 'intra' ? 'CGST + SGST' : gstSupplyType === 'inter' ? `IGST (${igstRate}%)` : '0% / SEZ'}
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 text-sm tabular-nums">
              <div className="flex justify-between"><span className="text-gray-600">Taxable Value</span><span className="font-medium">₹{formatAmountUpTo3Decimals(taxableValue)}</span></div>
              {gstSupplyType === 'intra' && (
                <>
                  <div className="flex justify-between"><span className="text-gray-600">CGST ({cgstRate}%)</span><span className="font-medium">₹{formatAmountUpTo3Decimals(cgstAmt)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">SGST ({sgstRate}%)</span><span className="font-medium">₹{formatAmountUpTo3Decimals(sgstAmt)}</span></div>
                </>
              )}
              {gstSupplyType === 'inter' && (
                <div className="flex justify-between"><span className="text-gray-600">IGST ({igstRate}%)</span><span className="font-medium">₹{formatAmountUpTo3Decimals(igstAmt)}</span></div>
              )}
              {gstSupplyType === 'sez_zero' && (
                <div className="flex justify-between"><span className="text-gray-600">GST</span><span className="font-medium">₹0</span></div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-2"><span className="text-gray-900 font-semibold">Total (0.50 round-off)</span><span className="text-gray-900 font-semibold">₹{formatInvoiceTotalDisplay(totalValue)}</span></div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Attachments (optional)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attendance Sheet (Word / Doc) – optional</label>
                <div className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg bg-white">
                  <Upload className="w-5 h-5 text-gray-400" />
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
                    className="text-sm"
                  />
                </div>
                {attendanceFiles.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{attendanceFiles.length} file(s) selected</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document 2 (Doc) – optional</label>
                <div className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg bg-white">
                  <Upload className="w-5 h-5 text-gray-400" />
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
                    className="text-sm"
                  />
                </div>
                {document2Files.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{document2Files.length} file(s) selected</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {invoiceDraft?.mode === 'edit' && draftPreviewInvoice && (
              <>
                <button
                  type="button"
                  onClick={() => void openPdfPreview(draftPreviewInvoice, `Tax Invoice Preview – ${draftPreviewInvoice.taxInvoiceNumber || 'Draft'}`)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => void downloadTaxInvoicePdf(draftPreviewInvoice)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedPoId('');
                setItems([]);
                setAttendanceFiles([]);
                setDocument2Files([]);
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
      {(selectedViewInvoice || (viewInvoiceId === '__draft__' && draftPreviewInvoice)) && (() => {
        const inv = viewInvoiceId === '__draft__' ? draftPreviewInvoice : selectedViewInvoice;
        if (!inv) return null;
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
                <h3 className="text-lg font-semibold text-gray-900">Tax Invoice Preview – {inv.taxInvoiceNumber || '–'}</h3>
                <button type="button" onClick={() => setViewInvoiceId(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 bg-gray-100">
                <InvoiceHtmlPreview inv={inv} />
              </div>
            </div>
          </div>
        );
      })()}
      {pdfPreview.open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl h-[92vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{pdfPreview.title}</h3>
              <button
                type="button"
                onClick={() => {
                  if (pdfPreview.url) URL.revokeObjectURL(pdfPreview.url);
                  setPdfPreview({ open: false, url: '', title: '' });
                }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe title="Tax Invoice PDF Preview" src={pdfPreview.url} className="w-full h-full border-0" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateInvoice;
