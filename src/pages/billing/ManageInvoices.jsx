import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  Pencil,
  Download,
  FileDigit,
  FileCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  Ban,
  X,
  PenLine,
  Usb,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { generateEInvoice, resolveBuyerGstinForBill } from '../../services/eInvoiceApi';
import { resolveBuyerStateAndPin } from '../../utils/gstStatePin';
import { resolveInvoicePartyAddresses } from '../../utils/invoicePartyAddresses';
import { resolveInvoicePartyPincodes } from '../../utils/poPincodeFields';
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from "../../utils/dateDisplay";
import { getTaxInvoicePdfBlobUrl, getTaxInvoicePdfBytes, downloadCreditDebitNotePdf } from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount } from '../../utils/invoiceRound';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import ManagePAModal from './ManagePAModal';
import GenerateEInvoiceModal from './GenerateEInvoiceModal';
import { netAfterCnDn } from '../../utils/cnDn';
import { enrichInvoiceWithPo, findPoForInvoice } from '../../utils/billingPoInvoiceFields';
import { fetchSignatureFromUsbToken, listUsbDscCertificates, buildFoxitDscAppearance, signInvoicePdfWithUsbToken } from '../../lib/usbDscToken';
import { toast } from "../../lib/toast";
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

function formatINRWithSign(n) {
  const v = round2(n);
  const abs = Math.abs(v).toLocaleString('en-IN');
  return v < 0 ? `-₹${abs}` : `₹${abs}`;
}

function getRealIrn(inv) {
  const irn = inv?.e_invoice_irn || inv?.eInvoiceIrn || '';
  return String(irn).toUpperCase().startsWith('MOCK-IRN-') ? '' : irn;
}

function invoiceSignatureUrl(inv) {
  const sig = inv?.digitalSignatureDataUrl || inv?.digital_signature_data_url || '';
  return typeof sig === 'string' && sig.startsWith('data:image/') ? sig : '';
}

function hasDigitalSignature(inv) {
  if (invoiceSignatureUrl(inv)) return true;
  return !!loadDscCert(inv?.id)?.thumbprint;
}

function dscCertStorageKey(invoiceId) {
  return `billing_dsc_cert:${invoiceId}`;
}

function loadDscCert(invoiceId) {
  if (!invoiceId) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dscCertStorageKey(invoiceId)) || 'null');
    if (parsed && parsed.thumbprint) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function persistDscCert(invoiceId, cert) {
  if (!invoiceId) return;
  try {
    if (!cert?.thumbprint) window.localStorage.removeItem(dscCertStorageKey(invoiceId));
    else window.localStorage.setItem(dscCertStorageKey(invoiceId), JSON.stringify(cert));
  } catch {
    /* ignore */
  }
}

function manageInvoicePdfFileName(inv) {
  const invoiceNumberForFile = String(inv.taxInvoiceNumber || inv.bill_number || 'Invoice')
    .trim()
    .replace(/\s+/g, '-');
  if (hasDigitalSignature(inv)) return `DSC_Signed_Invoice_${invoiceNumberForFile}.pdf`;
  const invoiceKind = String(inv.invoiceKind || inv.invoice_kind || 'tax').toLowerCase();
  return `${invoiceKind === 'proforma' ? 'Proforma' : invoiceKind === 'draft' ? 'Draft' : 'Tax'}_Invoice_${invoiceNumberForFile}.pdf`;
}

function dscRegionStorageKey(invoiceId) {
  return `billing_dsc_region:${invoiceId}`;
}

function loadDscRegion(invoiceId) {
  if (!invoiceId) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dscRegionStorageKey(invoiceId)) || 'null');
    if (
      parsed &&
      Number.isFinite(parsed.left) &&
      Number.isFinite(parsed.top) &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height)
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistDscRegion(invoiceId, region) {
  if (!invoiceId) return;
  try {
    if (!region) window.localStorage.removeItem(dscRegionStorageKey(invoiceId));
    else window.localStorage.setItem(dscRegionStorageKey(invoiceId), JSON.stringify(region));
  } catch {
    /* ignore */
  }
}

function clampPct(n) {
  return Math.min(100, Math.max(0, n));
}

function rectFromPoints(a, b) {
  const left = clampPct(Math.min(a.x, b.x));
  const top = clampPct(Math.min(a.y, b.y));
  const width = clampPct(Math.abs(a.x - b.x));
  const height = clampPct(Math.abs(a.y - b.y));
  return { left, top, width, height };
}

function isProformaInvoiceKind(inv) {
  return String(inv?.invoiceKind || inv?.invoice_kind || 'tax').toLowerCase() === 'proforma';
}

function firstWordsWithEllipsis(text, wordCount = 4) {
  const raw = String(text ?? '').trim();
  if (!raw) return '–';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= wordCount) return raw;
  return `${words.slice(0, wordCount).join(' ')}…`;
}

function formatManageInvoiceDate(value) {
  if (!value) return '–';
  return formatDateDdMmYyyy(value) || String(value);
}

function monthKeyFromYmd(raw) {
  if (!raw) return '';
  const s = String(raw);
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthOptionLabel(ym) {
  if (!ym || ym === 'all') return 'All months';
  const [y, m] = String(ym).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function invoiceSearchHaystack(inv, po) {
  return [
    inv?.taxInvoiceNumber,
    inv?.bill_number,
    inv?.ocNumber,
    inv?.oc_number,
    inv?.clientLegalName,
    inv?.client_name,
    inv?.poWoNumber,
    inv?.po_wo_number,
    inv?.siteId,
    inv?.site_id,
    inv?.locationName,
    inv?.location_name,
    po?.ocNumber,
    po?.oc_number,
    po?.poWoNumber,
    po?.po_wo_number,
    po?.legalName,
    po?.siteId,
    po?.site_id,
    po?.locationName,
    po?.location_name,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
}

function sortInvoicesNewestFirst(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const aTs = new Date(a?.updated_at || a?.updatedAt || a?.invoiceDate || a?.invoice_date || a?.created_at || a?.createdAt || 0).getTime() || 0;
    const bTs = new Date(b?.updated_at || b?.updatedAt || b?.invoiceDate || b?.invoice_date || b?.created_at || b?.createdAt || 0).getTime() || 0;
    if (aTs !== bTs) return bTs - aTs;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

const BILLING_TYPE_OPTIONS_MANPOWER = [
  { id: 'All', label: 'All' },
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Per Day', label: 'Per Day' },
  { id: 'Lump Sum', label: 'Lump Sum' },
  { id: 'Custom Calculator', label: 'Custom Calculator' },
];
const BILLING_TYPE_OPTIONS_RM = [
  { id: 'All', label: 'All' },
  { id: 'Service', label: 'Service' },
  { id: 'Supply', label: 'Supply' },
];
const MANAGE_INVOICE_TABS = [
  { id: 'billing-types', label: 'By billing type' },
  { id: 'add-on-invoices', label: 'Extra bills' },
  { id: 'issued-cndn', label: 'Bill fixes printed' },
  { id: 'cancelled', label: 'Cancelled bills' },
];

const ManageInvoices = ({ onNavigateTab }) => {
  const {
    commercialPOs,
    invoices,
    setInvoices,
    setInvoiceDraft,
    creditDebitNotes,
    billingVerticalFilter,
    useBillingDb,
    refreshBilling,
  } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [billingTypeFilter, setBillingTypeFilter] = useState('All');
  const [viewId, setViewId] = useState(null);
  const [viewSigDraft, setViewSigDraft] = useState('');
  const [viewSigError, setViewSigError] = useState('');
  const [viewSigSaving, setViewSigSaving] = useState(false);
  const [viewDscRegion, setViewDscRegion] = useState(null);
  const [dscDrag, setDscDrag] = useState(null);
  const [usbModalOpen, setUsbModalOpen] = useState(false);
  const [usbPin, setUsbPin] = useState('');
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbError, setUsbError] = useState('');
  const [usbCerts, setUsbCerts] = useState([]);
  const [usbReaders, setUsbReaders] = useState([]);
  const [usbIssues, setUsbIssues] = useState([]);
  const [usbCertsLoading, setUsbCertsLoading] = useState(false);
  const [usbSelectedThumb, setUsbSelectedThumb] = useState('');
  const [viewDscCert, setViewDscCert] = useState(null);
  const invoiceWrapRef = useRef(null);
  const [managePAInvoiceId, setManagePAInvoiceId] = useState(null);
  const [generatingEInvoiceId, setGeneratingEInvoiceId] = useState(null);
  const [generateEInvoiceModalId, setGenerateEInvoiceModalId] = useState(null);
  const [page, setPage] = useState(1);
  const [manageTab, setManageTab] = useState('billing-types');
  const [mainSortConfig, setMainSortConfig] = useState({ key: 'created', direction: 'asc' });
  const [addOnSortConfig, setAddOnSortConfig] = useState({ key: 'created', direction: 'asc' });
  const [monthFilter, setMonthFilter] = useState(() => currentMonthKey());
  const [cancelModalInv, setCancelModalInv] = useState(null);
  const [cancelModalMode, setCancelModalMode] = useState('cancel'); // 'cancel' | 'edit-remark'
  const [cancelRemark, setCancelRemark] = useState('');
  const [cancelRemarkError, setCancelRemarkError] = useState('');
  const PAGE_SIZE = 10;
  const renderSortIndicator = (active, direction) => {
    const ascActive = active && direction === 'asc';
    const descActive = active && direction === 'desc';
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
        <span className={ascActive ? 'text-emerald-400' : 'text-slate-300'}>▲</span>
        <span className={descActive ? 'text-rose-400' : 'text-slate-300'}>▼</span>
      </span>
    );
  };

  const verticalNotSelected = false;
  const isRmVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'rm' || v === 'mm' || v === 'amc' || v === 'iev' || v === 'projects';
  }, [billingVerticalFilter]);
  const isTrainingVertical = useMemo(() => {
    const v = String(billingVerticalFilter || '').trim().toLowerCase();
    return v === 'training';
  }, [billingVerticalFilter]);
  const showBillingTypeColumn = !isTrainingVertical;
  const showBillingTypeDropdown = !isTrainingVertical;
  const billingTypeOptions = useMemo(
    () => (isRmVertical ? BILLING_TYPE_OPTIONS_RM : BILLING_TYPE_OPTIONS_MANPOWER),
    [isRmVertical]
  );
                                                          
  const getPoByInvoice = React.useCallback(
    (inv) => findPoForInvoice(inv, commercialPOs),
    [commercialPOs]
  );

  const downloadManageInvoicePdf = React.useCallback(
    async (inv) => {
      if (!inv) return;
      const po = getPoByInvoice(inv);
      const cert = loadDscCert(inv.id);
      if (cert?.thumbprint) {
        try {
          const appearance = buildFoxitDscAppearance(cert);
          const pdfBytes = await getTaxInvoicePdfBytes(inv, {
            po,
            skipSignatureImage: true,
            dscAppearance: appearance,
          });
          if (!pdfBytes) return;
          const signed = await signInvoicePdfWithUsbToken({ pdfBytes, certificate: cert, pin: usbPin });
          const blob = new Blob([signed], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = manageInvoicePdfFileName(inv);
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast.success('Cryptographically signed PDF downloaded. Adobe/Foxit can validate the DSC.');
        } catch (err) {
          toast.error(err?.message || 'Could not sign the PDF with the USB DSC. Keep the token plugged in and try again.');
        }
        return;
      }
      const url = await getTaxInvoicePdfBlobUrl(inv, {
        po,
        ...(hasDigitalSignature(inv) ? { signatureWidthMm: 52, signatureHeightMm: 24 } : {}),
      });
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = manageInvoicePdfFileName(inv);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    [getPoByInvoice, usbPin]
  );

  const withLatestBuyerDetails = React.useCallback(
    (inv) => {
      const po = getPoByInvoice(inv);
      if (!po) return enrichInvoiceWithPo(inv, null);
      const parties = resolveInvoicePartyAddresses(
        po.billingAddress || po.billing_address || inv.clientAddress || inv.client_address,
        po.shippingAddress ||
          po.shipping_address ||
          inv.clientShippingAddress ||
          inv.client_shipping_address
      );
      const pinMeta = resolveBuyerStateAndPin({
        gstin: po.gstin || inv.gstin,
        placeOfSupply: po.placeOfSupply || po.place_of_supply || inv.placeOfSupply || inv.place_of_supply,
        billingAddress: parties.billToAddress,
        existingPin:
          po.pincode ||
          inv.buyerPin ||
          inv.buyer_pin ||
          inv.clientPincode ||
          inv.client_pincode,
      });
      const partyPins = resolveInvoicePartyPincodes({
        po,
        billPinResolved: pinMeta.pin,
        invoice: inv,
      });
      return enrichInvoiceWithPo(
        {
          ...inv,
          clientLegalName: po.legalName || inv.clientLegalName || inv.client_name,
          clientAddress: parties.billToAddress || inv.clientAddress || inv.client_address,
          clientShippingAddress: parties.clientShippingAddress,
          shipToDiffers: parties.shipToDiffers,
          clientPincode: String(partyPins.billToPin || pinMeta.pin || inv.clientPincode || inv.client_pincode || ''),
          clientShipToPincode: partyPins.shipToPin || null,
          client_ship_to_pincode: partyPins.billToShipToPinSame
            ? null
            : partyPins.shipToPin || inv.client_ship_to_pincode || null,
          buyerPin: pinMeta.pin ?? inv.buyerPin ?? inv.buyer_pin,
          buyerPincode: pinMeta.pin ?? inv.buyerPincode ?? inv.buyer_pincode,
          placeOfSupply: po.placeOfSupply || po.place_of_supply || inv.placeOfSupply || inv.place_of_supply,
          gstin: po.gstin || inv.gstin,
        },
        po
      );
    },
    [getPoByInvoice]
  );

  const hydratedInvoices = useMemo(() => invoices.map(withLatestBuyerDetails), [invoices, withLatestBuyerDetails]);

  const getInvoiceBillingType = (inv) => {
    if (inv.isAddOn) return 'Add-On';
    if (inv.billingType) return inv.billingType;
    const po = commercialPOs.find((p) => p.id === inv.poId);
    return po?.billingType || 'Monthly';
  };

  const matchesSearch = (inv, extra = '') => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    const po = getPoByInvoice(inv);
    return invoiceSearchHaystack(inv, po).includes(s) || String(extra || '').toLowerCase().includes(s);
  };

  const matchesMonth = (inv) => {
    if (!monthFilter || monthFilter === 'all') return true;
    return monthKeyFromYmd(inv?.invoiceDate || inv?.invoice_date || inv?.created_at || inv?.createdAt) === monthFilter;
  };

  const monthOptions = useMemo(() => {
    const set = new Set();
    hydratedInvoices.forEach((inv) => {
      const ym = monthKeyFromYmd(inv?.invoiceDate || inv?.invoice_date || inv?.created_at || inv?.createdAt);
      if (ym) set.add(ym);
    });
    set.add(currentMonthKey());
    if (monthFilter && monthFilter !== 'all') set.add(monthFilter);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [hydratedInvoices, monthFilter]);

  const invoicesForTypeCounts = useMemo(
    () => hydratedInvoices.filter((inv) => !inv.isAddOn && !inv.isCancelled).filter(matchesMonth),
    [hydratedInvoices, monthFilter]
  );

  const billingTypeCounts = useMemo(() => {
    const counts = { All: invoicesForTypeCounts.length };
    billingTypeOptions.forEach((t) => {
      if (t.id === 'All') return;
      counts[t.id] = invoicesForTypeCounts.filter((inv) => getInvoiceBillingType(inv) === t.id).length;
    });
    return counts;
  }, [invoicesForTypeCounts, billingTypeOptions, commercialPOs]);

  const filteredInvoices = useMemo(() => {
    let list = hydratedInvoices.filter((inv) => !inv.isAddOn && !inv.isCancelled);
    list = list.filter(matchesMonth);
    if (showBillingTypeDropdown && billingTypeFilter && billingTypeFilter !== 'All') {
      list = list.filter((inv) => getInvoiceBillingType(inv) === billingTypeFilter);
    }
    list = list.filter((inv) => matchesSearch(inv));
    return sortInvoicesNewestFirst(list);
  }, [hydratedInvoices, monthFilter, searchTerm, commercialPOs, billingTypeFilter, showBillingTypeDropdown]);

  const addOnInvoices = useMemo(() => {
    let list = hydratedInvoices.filter((inv) => !!inv.isAddOn && !inv.isCancelled);
    list = list.filter((inv) => matchesSearch(inv, inv.addOnType));
    return sortInvoicesNewestFirst(list);
  }, [hydratedInvoices, searchTerm, commercialPOs]);

  const cancelledInvoices = useMemo(() => {
    let list = hydratedInvoices.filter((inv) => !!inv.isCancelled);
    list = list.filter((inv) => matchesSearch(inv, inv.cancelReason));
    return sortInvoicesNewestFirst(list);
  }, [hydratedInvoices, searchTerm, commercialPOs]);

  const sortedFilteredInvoices = useMemo(() => {
    const dir = mainSortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredInvoices].sort((a, b) => {
      const valueFor = (inv) => {
        switch (mainSortConfig.key) {
          case 'modified': return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
          case 'created': return new Date(inv.created_at || inv.createdAt || inv.invoiceDate || inv.invoice_date || inv.updated_at || 0).getTime() || 0;
          case 'taxInvoice': return String(inv.taxInvoiceNumber || inv.bill_number || '').toLowerCase();
          case 'invoiceDate': return new Date(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt || 0).getTime() || 0;
          case 'billingType': return String(getInvoiceBillingType(inv) || '').toLowerCase();
          case 'ocNumber': return String(inv.ocNumber || '').toLowerCase();
          case 'client': return String(inv.clientLegalName || inv.client_name || '').toLowerCase();
          case 'amount': return Number(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0);
          case 'net': return Number(netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0) || 0);
          case 'poRemaining': {
            const po = commercialPOs.find((p) => String(p.id) === String(inv.poId));
            const contract = Number(po?.totalContractValue) || 0;
            const expected = round2(sumRatePerCategory(po) * daysInMonth(inv.invoiceDate || inv.created_at));
            return round2(contract - expected);
          }
          case 'eInvoice': return inv.e_invoice_irn ? 1 : 0;
          default: return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
        }
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [filteredInvoices, mainSortConfig, creditDebitNotes, commercialPOs]);

  const sortedAddOnInvoices = useMemo(() => {
    const dir = addOnSortConfig.direction === 'asc' ? 1 : -1;
    return [...addOnInvoices].sort((a, b) => {
      const valueFor = (inv) => {
        switch (addOnSortConfig.key) {
          case 'modified': return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
          case 'created': return new Date(inv.created_at || inv.createdAt || inv.invoiceDate || inv.invoice_date || inv.updated_at || 0).getTime() || 0;
          case 'taxInvoice': return String(inv.taxInvoiceNumber || inv.bill_number || '').toLowerCase();
          case 'invoiceDate': return new Date(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt || 0).getTime() || 0;
          case 'billingType': return String(inv.addOnType || 'Add-On').toLowerCase();
          case 'ocNumber': return String(inv.ocNumber || '').toLowerCase();
          case 'client': return String(inv.clientLegalName || inv.client_name || '').toLowerCase();
          case 'amount': return Number(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0);
          case 'net': return Number(netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0) || 0);
          case 'eInvoice': return inv.e_invoice_irn ? 1 : 0;
          default: return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
        }
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      let result = 0;
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) result = String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
      return result * dir;
    });
  }, [addOnInvoices, addOnSortConfig, creditDebitNotes]);

  const sortedCancelledInvoices = useMemo(() => {
    const dir = mainSortConfig.direction === 'asc' ? 1 : -1;
    return [...cancelledInvoices].sort((a, b) => {
      const valueFor = (inv) => {
        switch (mainSortConfig.key) {
          case 'modified': return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
          case 'created': return new Date(inv.created_at || inv.createdAt || inv.invoiceDate || inv.invoice_date || inv.updated_at || 0).getTime() || 0;
          case 'taxInvoice': return String(inv.taxInvoiceNumber || inv.bill_number || '').toLowerCase();
          case 'invoiceDate': return new Date(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt || 0).getTime() || 0;
          case 'billingType': return String(getInvoiceBillingType(inv) || '').toLowerCase();
          case 'ocNumber': return String(inv.ocNumber || '').toLowerCase();
          case 'client': return String(inv.clientLegalName || inv.client_name || '').toLowerCase();
          case 'amount': return Number(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0);
          case 'net': return Number(netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0) || 0);
          case 'eInvoice': return inv.e_invoice_irn ? 1 : 0;
          default: return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
        }
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      let result = 0;
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) result = String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
      return result * dir;
    });
  }, [cancelledInvoices, mainSortConfig, creditDebitNotes, commercialPOs]);

  const totalPages = Math.max(1, Math.ceil(sortedFilteredInvoices.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const paginatedInvoices = useMemo(
    () => sortedFilteredInvoices.slice(start, start + PAGE_SIZE),
    [sortedFilteredInvoices, start]
  );

  const goToPage = (p) => setPage((prev) => Math.min(totalPages, Math.max(1, p)));

  const openCancelModal = (inv) => {
    if (!inv) return;
    if (getRealIrn(inv)) {
      toast.success('This invoice has an IRN. Cancel the e-invoice first (IRN cancellation) before cancelling here.');
      return;
    }
    setCancelModalMode('cancel');
    setCancelModalInv(inv);
    setCancelRemark('');
    setCancelRemarkError('');
  };

  const openEditCancelRemarkModal = (inv) => {
    if (!inv) return;
    if (!inv.isCancelled) {
      toast.success('This invoice is not cancelled yet.');
      return;
    }
    setCancelModalMode('edit-remark');
    setCancelModalInv(inv);
    setCancelRemark(String(inv.cancelReason || ''));
    setCancelRemarkError('');
  };

  const confirmCancelInvoice = () => {
    const inv = cancelModalInv;
    if (!inv) return;
    const clean = String(cancelRemark || '').trim();
    if (!clean) {
      setCancelRemarkError('Remark is required.');
      return;
    }
    setInvoices((prev) =>
      prev.map((row) => {
        if (String(row.id) !== String(inv.id)) return row;
        if (cancelModalMode === 'edit-remark') {
          return { ...row, cancelReason: clean };
        }
        const cancelledAt = new Date().toISOString();
        return {
          ...row,
          isCancelled: true,
          cancelledAt,
          cancelReason: clean,
        };
      })
    );
    if (viewId && String(viewId) === String(inv.id)) setViewId(null);
    if (managePAInvoiceId && String(managePAInvoiceId) === String(inv.id)) setManagePAInvoiceId(null);
    if (generateEInvoiceModalId && String(generateEInvoiceModalId) === String(inv.id)) setGenerateEInvoiceModalId(null);
    setCancelModalInv(null);
  };

  const handleGenerateEInvoice = async (inv) => {
    if (getRealIrn(inv)) {
      throw new Error('E-Invoice already generated for this invoice.');
    }
    const resolved = resolveBuyerStateAndPin({
      gstin: inv.buyerGstin || inv.buyer_gstin || inv.clientGstin || inv.client_gstin || inv.gstin,
      placeOfSupply: inv.placeOfSupply || inv.place_of_supply,
      billingAddress: inv.clientAddress || inv.client_address,
      existingPin:
        inv.buyerPin || inv.buyer_pin || inv.buyerPincode || inv.buyer_pincode || inv.clientPincode || inv.client_pincode,
    });
    setGeneratingEInvoiceId(inv.id);
    try {
      const po = commercialPOs.find((p) => p.id === inv.poId);
      const buyerGstinResolved = resolveBuyerGstinForBill({
        buyerGstin: inv.buyerGstin || inv.buyer_gstin,
        clientGstin: inv.clientGstin || inv.client_gstin,
        gstin: inv.gstin,
        buyer: {
          gstin:
            inv.buyerGstin ||
            inv.buyer_gstin ||
            inv.clientGstin ||
            inv.client_gstin ||
            inv.gstin ||
            '',
        },
      });
      const billShape = {
        id: inv.id,
        bill_number: inv.taxInvoiceNumber,
        taxInvoiceNumber: inv.taxInvoiceNumber,
        client_name: inv.clientLegalName,
        client_address: inv.clientAddress,
        clientAddress: inv.clientAddress,
        clientAddress2: inv.clientAddress2 || inv.client_address_2 || '',
        clientCity: inv.clientCity || inv.client_city || '',
        clientPincode: String(resolved.pin || inv.clientPincode || inv.client_pincode || ''),
        buyerPin: resolved.pin || inv.buyerPin || inv.buyer_pin || inv.clientPincode || inv.client_pincode || '',
        clientPhone: inv.clientPhone || inv.client_phone || '',
        clientEmail: inv.clientEmail || inv.client_email || '',
        gstin: buyerGstinResolved,
        buyerGstin: buyerGstinResolved,
        buyer: {
          pin: resolved.pin || inv.buyerPin || inv.buyer_pin || inv.clientPincode || inv.client_pincode || '',
          pinCode: resolved.pin || inv.buyerPincode || inv.buyer_pincode || inv.clientPincode || inv.client_pincode || '',
          city: inv.buyerCity || inv.buyer_city || inv.clientCity || inv.client_city || '',
          gstin: buyerGstinResolved,
        },
        placeOfSupply: inv.placeOfSupply || inv.place_of_supply || po?.placeOfSupply || po?.place_of_supply || '',
        invoice_date: inv.invoiceDate || inv.created_at,
        created_at: inv.invoiceDate || inv.created_at,
        cgstRate: inv.cgstRate,
        sgstRate: inv.sgstRate,
        taxableValue: inv.taxableValue,
        calculatedInvoiceAmount: inv.calculatedInvoiceAmount ?? inv.totalAmount,
        totalAmount: inv.totalAmount,
        oc_number: inv.ocNumber,
        items: (inv.items || []).map((i) => ({
          description: i.description || i.designation,
          quantity: i.quantity,
          rate: i.rate,
          amount: i.amount,
        })),
      };
      const wopoShape = po ? { id: po.id, oc_number: po.ocNumber, hsn_sac: po.sacCode || po.hsnCode, sacCode: po.sacCode, hsnCode: po.hsnCode } : null;
      const result = await generateEInvoice(billShape, wopoShape);
      if (result && result.irn) {
        setInvoices((prev) =>
          prev.map((i) =>
            i.id === inv.id
              ? {
                  ...i,
                  e_invoice_irn: result.irn,
                  e_invoice_ack_no: result.ackNo,
                  e_invoice_ack_dt: result.ackDt,
                  e_invoice_signed_qr: result.signedQR,
                }
              : i
          )
        );
      }
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setGeneratingEInvoiceId(null);
    }
  };

  const selectedInv = viewId ? hydratedInvoices.find((i) => i.id === viewId) : null;
  const savedViewSig = invoiceSignatureUrl(selectedInv);
  const viewSigDirty = String(viewSigDraft || '') !== String(savedViewSig || '');
  const canEditViewDsc = !!selectedInv && !selectedInv.isCancelled && !getRealIrn(selectedInv);

  React.useEffect(() => {
    if (!selectedInv) {
      setViewSigDraft('');
      setViewSigError('');
      setViewSigSaving(false);
      setViewDscRegion(null);
      setDscDrag(null);
      setUsbModalOpen(false);
      setUsbPin('');
      setUsbError('');
      setUsbBusy(false);
      setUsbCerts([]);
      setUsbReaders([]);
      setUsbIssues([]);
      setUsbCertsLoading(false);
      setUsbSelectedThumb('');
      setViewDscCert(null);
      return;
    }
    setViewSigDraft(invoiceSignatureUrl(selectedInv));
    setViewDscRegion(loadDscRegion(selectedInv.id));
    setViewDscCert(loadDscCert(selectedInv.id));
    setViewSigError('');
    setDscDrag(null);
    setUsbModalOpen(false);
    setUsbPin('');
    setUsbError('');
    setUsbCerts([]);
    setUsbReaders([]);
    setUsbIssues([]);
    setUsbSelectedThumb('');
  }, [viewId, selectedInv?.id, savedViewSig]);

  const closeInvoiceViewer = () => {
    setViewId(null);
    setViewSigDraft('');
    setViewSigError('');
    setViewSigSaving(false);
    setViewDscRegion(null);
    setDscDrag(null);
    setUsbModalOpen(false);
    setUsbPin('');
    setUsbError('');
    setUsbCerts([]);
    setUsbReaders([]);
    setUsbIssues([]);
    setUsbSelectedThumb('');
    setViewDscCert(null);
  };

  const pointerPct = (event) => {
    const el = invoiceWrapRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return {
      x: clampPct(((event.clientX - box.left) / box.width) * 100),
      y: clampPct(((event.clientY - box.top) / box.height) * 100),
    };
  };

  const beginDscSelect = (event) => {
    if (!canEditViewDsc || usbModalOpen) return;
    if (event.button != null && event.button !== 0) return;
    const pt = pointerPct(event);
    if (!pt) return;
    event.preventDefault();
    setDscDrag({ start: pt, current: pt });
  };

  const moveDscSelect = (event) => {
    if (!dscDrag) return;
    const pt = pointerPct(event);
    if (!pt) return;
    setDscDrag((prev) => (prev ? { ...prev, current: pt } : prev));
  };

  const endDscSelect = async () => {
    if (!dscDrag) return;
    const region = rectFromPoints(dscDrag.start, dscDrag.current);
    setDscDrag(null);
    if (region.width < 3 || region.height < 2.5) {
      setViewSigError('Drag a larger box on the invoice for the DSC.');
      return;
    }
    setViewDscRegion(region);
    setViewSigError('');
    setUsbPin('');
    setUsbError('');
    setUsbCerts([]);
    setUsbSelectedThumb('');
    setUsbReaders([]);
    setUsbIssues([]);
    setUsbModalOpen(true);
  };

  const applyUsbListResult = (result) => {
    const list = Array.isArray(result.certificates) ? result.certificates : [];
    const readers = Array.isArray(result.readers) ? result.readers : [];
    const issues = Array.isArray(result.usbIssues) ? result.usbIssues : [];
    setUsbCerts(list);
    setUsbReaders(readers);
    setUsbIssues(issues);
    const preferred =
      list.find((c) => c.onHardwareToken && c.hasPrivateKey) ||
      list.find((c) => c.onHardwareToken) ||
      list.find((c) => c.hasPrivateKey) ||
      list[0];
    setUsbSelectedThumb(preferred?.thumbprint ? String(preferred.thumbprint) : '');
    if (list.length) {
      setUsbError('');
      return;
    }
    const liveReaders = readers.filter((row) => row?.status === 'card_present' || row?.atr || /token|dsc|hyper/i.test(String(row?.name || '')));
    if (liveReaders.length) {
      setUsbError(
        `Token detected (${liveReaders.map((row) => row.name).join(', ')}). Enter the token PIN and click Refresh to read certificates.`
      );
      return;
    }
    if (issues.length && !readers.length) {
      setUsbError(issues.map((row) => row.hint || row.name).filter(Boolean).join(' '));
      return;
    }
    if (result.pcscStatus === 'no_readers' || !readers.length) {
      setUsbError(
        'No live USB DSC token was found. Plug the token in, wait until Windows finishes installing it, then click Refresh. If it still fails, install the token manufacturer software and try a USB 2.0 port on the PC.'
      );
      return;
    }
    setUsbError('The reader is connected but no certificate was on the token. Enter the token PIN and click Refresh.');
  };

  const refreshUsbCerts = async (pin) => {
    setUsbCertsLoading(true);
    setUsbError('');
    try {
      const result = await listUsbDscCertificates(pin);
      applyUsbListResult(result);
    } catch (err) {
      setUsbCerts([]);
      setUsbReaders([]);
      setUsbIssues([]);
      setUsbSelectedThumb('');
      setUsbError(err?.message || 'Could not read certificates from the USB token.');
    } finally {
      setUsbCertsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!usbModalOpen) return undefined;
    let cancelled = false;
    setUsbCertsLoading(true);
    setUsbError('');
    void listUsbDscCertificates('')
      .then((result) => {
        if (!cancelled) applyUsbListResult(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setUsbCerts([]);
        setUsbReaders([]);
        setUsbIssues([]);
        setUsbSelectedThumb('');
        setUsbError(err?.message || 'Could not read certificates from the USB token.');
      })
      .finally(() => {
        if (!cancelled) setUsbCertsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usbModalOpen]);

  const confirmUsbDsc = async () => {
    if (!selectedInv || !viewDscRegion) return;
    const certificate = usbCerts.find((c) => String(c.thumbprint) === String(usbSelectedThumb));
    if (!certificate) {
      setUsbError('Select a certificate from the token list.');
      return;
    }
    setUsbBusy(true);
    setUsbError('');
    try {
      const wrap = invoiceWrapRef.current;
      const boxW = wrap ? (viewDscRegion.width / 100) * wrap.clientWidth : 220;
      const boxH = wrap ? (viewDscRegion.height / 100) * wrap.clientHeight : 80;
      const result = await fetchSignatureFromUsbToken({
        pin: usbPin,
        invoiceNumber: selectedInv.taxInvoiceNumber || selectedInv.bill_number || '',
        boxWidth: boxW,
        boxHeight: boxH,
        certificate,
      });
      setViewSigDraft(result.imageDataUrl);
      setViewDscCert(certificate);
      persistDscCert(selectedInv.id, certificate);
      setUsbModalOpen(false);
      setUsbPin('');
      toast.success('DSC certificate applied in the selected area. Save the invoice to keep it.');
    } catch (err) {
      setUsbError(err?.message || 'Could not apply the USB DSC certificate.');
    } finally {
      setUsbBusy(false);
    }
  };

  const saveViewDigitalSignature = () => {
    if (!selectedInv || !canEditViewDsc) return;
    const nextSig = String(viewSigDraft || '').trim() || null;
    setViewSigSaving(true);
    try {
      persistDscRegion(selectedInv.id, nextSig ? viewDscRegion : null);
      persistDscCert(selectedInv.id, nextSig ? viewDscCert : null);
      setInvoices((prev) =>
        prev.map((row) => {
          if (String(row.id) !== String(selectedInv.id)) return row;
          return {
            ...row,
            digitalSignatureDataUrl: nextSig,
            digital_signature_data_url: nextSig,
            updated_at: new Date().toISOString(),
          };
        })
      );
      toast.success(nextSig ? 'DSC-signed invoice saved. You can generate e-invoice next.' : 'Digital signature removed.');
    } finally {
      setViewSigSaving(false);
    }
  };

  const liveSelectRegion = dscDrag ? rectFromPoints(dscDrag.start, dscDrag.current) : null;
  const overlayRegion = liveSelectRegion || viewDscRegion;
  const foxitAppearance = viewDscCert ? buildFoxitDscAppearance(viewDscCert) : null;

  const renderTaxInvoiceOpener = (inv) => {
    const number = inv.taxInvoiceNumber || inv.bill_number || '–';
    return (
      <button
        type="button"
        onClick={() => setViewId(inv.id)}
        className="truncate max-w-full font-mono font-semibold text-red-700 hover:text-red-800 hover:underline"
        title="Open invoice (DSC)"
      >
        {number}
      </button>
    );
  };

  const renderDscAction = (inv) => {
    const signed = hasDigitalSignature(inv);
    return (
      <button
        type="button"
        onClick={() => setViewId(inv.id)}
        title={signed ? 'Digitally signed — open invoice' : 'Not digitally signed — open to add DSC'}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border ${
          signed
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
        }`}
      >
        <PenLine className="w-4 h-4" />
      </button>
    );
  };

  React.useEffect(() => {
    if (verticalNotSelected) return;
    void refreshBilling?.();
  }, [verticalNotSelected, refreshBilling]);

  React.useEffect(() => {
    setPage(1);
  }, [monthFilter, searchTerm, mainSortConfig, billingTypeFilter]);

  React.useEffect(() => {
    const allowed = new Set(billingTypeOptions.map((t) => t.id));
    if (!allowed.has(billingTypeFilter)) {
      setBillingTypeFilter('All');
    }
  }, [billingTypeOptions, billingTypeFilter]);

  React.useEffect(() => {
    if (showBillingTypeColumn) return;
    setMainSortConfig((prev) => (prev.key === 'billingType' ? { key: 'created', direction: 'desc' } : prev));
    setAddOnSortConfig((prev) => (prev.key === 'billingType' ? { key: 'created', direction: 'desc' } : prev));
  }, [showBillingTypeColumn]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-4">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Pick a team first</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('create-invoice')}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Make a bill
            </button>
            <Link
              to="/app/commercial/manpower-training/po-entry"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              New job in Commercial
            </Link>
          </div>
        </div>
      ) : null}

      <h2 className="text-xl font-bold text-gray-900">All bills</h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200/90 ring-1 ring-slate-900/5 overflow-hidden">
        {verticalNotSelected ? (
          <div className="p-6 text-sm text-gray-600">Pick a team above.</div>
        ) : null}
        <div className="flex gap-1 px-4 sm:px-6 border-b border-slate-100 bg-slate-50/40 overflow-x-auto">
          {MANAGE_INVOICE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setManageTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                manageTab === tab.id
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {manageTab !== 'issued-cndn' ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search master: OC, PO/WO, client, site..."
              className="w-full min-h-[36px] rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
              aria-label="Search invoices"
            />
          </div>
          {manageTab === 'billing-types' && showBillingTypeDropdown ? (
            <select
              value={billingTypeFilter}
              onChange={(e) => {
                setBillingTypeFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
              aria-label="Billing type"
            >
              {billingTypeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({billingTypeCounts[t.id] ?? 0})
                </option>
              ))}
            </select>
          ) : null}
          {manageTab === 'billing-types' ? (
          <select
            value={monthFilter}
            onChange={(e) => {
              setMonthFilter(e.target.value);
              setPage(1);
            }}
            className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
            aria-label="Month"
          >
            <option value="all">All months</option>
            {monthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthOptionLabel(ym)}
              </option>
            ))}
          </select>
          ) : null}
          <select
            value={manageTab === 'add-on-invoices' ? addOnSortConfig.key : mainSortConfig.key}
            onChange={(e) => {
              const setter = manageTab === 'add-on-invoices' ? setAddOnSortConfig : setMainSortConfig;
              setter((prev) => ({ ...prev, key: e.target.value }));
            }}
            className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
            aria-label="Sort invoice list by"
          >
            <option value="modified">Last modified</option>
            <option value="created">Last created</option>
          </select>
          <select
            value={manageTab === 'add-on-invoices' ? addOnSortConfig.direction : mainSortConfig.direction}
            onChange={(e) => {
              const setter = manageTab === 'add-on-invoices' ? setAddOnSortConfig : setMainSortConfig;
              setter((prev) => ({ ...prev, direction: e.target.value }));
            }}
            className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
            aria-label="Sort invoice list direction"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      ) : null}

      {manageTab === 'add-on-invoices' ? (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-violet-50/60">
          <h3 className="text-sm font-semibold text-violet-800">Extra bills</h3>
        </div>
        <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[1220px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[5%]" />
                      <col className="w-[13%]" />
                      <col className="w-[10%]" />
                      {showBillingTypeColumn ? <col className="w-[12%]" /> : null}
                      <col className="w-[12%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[6%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap">S.No</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'taxInvoice' ? { key: 'taxInvoice', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'taxInvoice', direction: 'desc' })} className="inline-flex items-center">Tax Invoice {renderSortIndicator(addOnSortConfig.key === 'taxInvoice', addOnSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'invoiceDate' ? { key: 'invoiceDate', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'invoiceDate', direction: 'desc' })} className="inline-flex items-center">Invoice Date {renderSortIndicator(addOnSortConfig.key === 'invoiceDate', addOnSortConfig.direction)}</button></th>
                        {showBillingTypeColumn ? (
                          <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'billingType' ? { key: 'billingType', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'billingType', direction: 'desc' })} className="inline-flex items-center">Billing type {renderSortIndicator(addOnSortConfig.key === 'billingType', addOnSortConfig.direction)}</button></th>
                        ) : null}
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'ocNumber' ? { key: 'ocNumber', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'ocNumber', direction: 'desc' })} className="inline-flex items-center">OC Number {renderSortIndicator(addOnSortConfig.key === 'ocNumber', addOnSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'client' ? { key: 'client', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'client', direction: 'desc' })} className="inline-flex items-center">Client Name {renderSortIndicator(addOnSortConfig.key === 'client', addOnSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'amount' ? { key: 'amount', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'amount', direction: 'desc' })} className="inline-flex items-center">Amount {renderSortIndicator(addOnSortConfig.key === 'amount', addOnSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'net' ? { key: 'net', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'net', direction: 'desc' })} className="inline-flex items-center">Net after CN/DN {renderSortIndicator(addOnSortConfig.key === 'net', addOnSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setAddOnSortConfig((p) => p.key === 'eInvoice' ? { key: 'eInvoice', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'eInvoice', direction: 'desc' })} className="inline-flex items-center">E-Inv {renderSortIndicator(addOnSortConfig.key === 'eInvoice', addOnSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {sortedAddOnInvoices.map((inv, idx) => (
                        <tr key={`addon-${inv.id}`} className="hover:bg-gray-50 align-top">
                          <td className="px-3 py-2 text-xs text-gray-700 text-center font-medium tabular-nums whitespace-nowrap">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono overflow-hidden min-w-0" title={inv.taxInvoiceNumber || inv.bill_number || '–'}>
                            <div className="flex flex-col items-center gap-0.5 min-w-0">
                              <span className="truncate max-w-full">{renderTaxInvoiceOpener(inv)}</span>
                              {isProformaInvoiceKind(inv) ? (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 whitespace-nowrap">Proforma</span>
                              ) : null}
                              {(inv.cnDnRequestStatus || inv.cn_dn_request_status) === 'pending' ? (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 whitespace-nowrap">CN/DN pending</span>
                              ) : null}
                              {(inv.cnDnRequestStatus || inv.cn_dn_request_status) === 'approved' ? (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 whitespace-nowrap">CN/DN approved</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap">
                            {formatManageInvoiceDate(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt)}
                          </td>
                          {showBillingTypeColumn ? (
                            <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={inv.addOnType || 'Add-On'}>{inv.addOnType || 'Add-On'}</td>
                          ) : null}
                          <td className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap overflow-hidden min-w-0" title={inv.ocNumber || '–'}>
                            <span className="block max-w-full truncate whitespace-nowrap">{inv.ocNumber || '–'}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 overflow-hidden min-w-0" title={inv.clientLegalName || inv.client_name || '–'}>
                            <span className="block max-w-full truncate">{inv.clientLegalName || inv.client_name || '–'}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center tabular-nums whitespace-nowrap">
                            ₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td
                            className="px-3 py-2 text-xs text-center tabular-nums font-medium text-gray-800 whitespace-nowrap"
                            title="Invoice total − credit notes + debit notes linked to this tax invoice"
                          >
                            ₹
                            {netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-2 text-xs text-center">
                            {getRealIrn(inv) ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-nowrap items-center justify-center gap-1.5">
                              {(() => {
                                const irnExists = !!getRealIrn(inv);
                                const proforma = isProformaInvoiceKind(inv);
                                const eInvDisabled = irnExists || proforma;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setGenerateEInvoiceModalId(inv.id)}
                                    disabled={generatingEInvoiceId === inv.id || eInvDisabled}
                                    title={
                                      proforma
                                        ? 'E-Invoice (IRN) is not generated for proforma invoices'
                                        : irnExists
                                          ? 'E-Invoice already generated'
                                          : 'Generate E-Invoice'
                                    }
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full border disabled:opacity-50 disabled:cursor-not-allowed ${
                                      eInvDisabled
                                        ? 'border-gray-200 bg-gray-100 text-gray-400'
                                        : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                    }`}
                                  >
                                    <FileDigit className="w-4 h-4" />
                                  </button>
                                );
                              })()}
                              {renderDscAction(inv)}
                              <button
                                type="button"
                                onClick={() => setViewId(inv.id)}
                                title="View invoice"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadManageInvoicePdf(inv)}
                                title={hasDigitalSignature(inv) ? 'Download DSC-signed invoice' : 'Download Tax Invoice PDF'}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setManagePAInvoiceId(inv.id)}
                                title="Manage PA"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              >
                                <FileCheck className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openCancelModal(inv)}
                                title="Cancel invoice"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {addOnInvoices.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={showBillingTypeColumn ? 9 : 8}>
                            No add-on invoices found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
        </div>
      </div>
      ) : null}

      {manageTab === 'billing-types' ? (
      <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[1320px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[4%]" />
                      <col className="w-[11%]" />
                      <col className="w-[10%]" />
                      {showBillingTypeColumn ? <col className="w-[10%]" /> : null}
                      <col className="w-[11%]" />
                      <col className="w-[18%]" />
                      <col className="w-[9%]" />
                      <col className="w-[11%]" />
                      <col className="w-[9%]" />
                      <col className="w-[6%]" />
                      <col className="w-[12%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap">S.No</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'taxInvoice' ? { key: 'taxInvoice', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'taxInvoice', direction: 'desc' })} className="inline-flex w-full items-center justify-center">Tax Invoice {renderSortIndicator(mainSortConfig.key === 'taxInvoice', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'invoiceDate' ? { key: 'invoiceDate', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'invoiceDate', direction: 'desc' })} className="inline-flex w-full items-center justify-center">Invoice Date {renderSortIndicator(mainSortConfig.key === 'invoiceDate', mainSortConfig.direction)}</button></th>
                        {showBillingTypeColumn ? (
                          <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'billingType' ? { key: 'billingType', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'billingType', direction: 'desc' })} className="inline-flex w-full items-center justify-center">Billing type {renderSortIndicator(mainSortConfig.key === 'billingType', mainSortConfig.direction)}</button></th>
                        ) : null}
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'ocNumber' ? { key: 'ocNumber', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'ocNumber', direction: 'desc' })} className="inline-flex w-full items-center justify-center">OC Number {renderSortIndicator(mainSortConfig.key === 'ocNumber', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'client' ? { key: 'client', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'client', direction: 'desc' })} className="inline-flex w-full items-center justify-center">Client Name {renderSortIndicator(mainSortConfig.key === 'client', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'amount' ? { key: 'amount', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'amount', direction: 'desc' })} className="inline-flex w-full items-center justify-center">Amount {renderSortIndicator(mainSortConfig.key === 'amount', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'net' ? { key: 'net', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'net', direction: 'desc' })} className="inline-flex w-full items-center justify-center">Net after CN/DN {renderSortIndicator(mainSortConfig.key === 'net', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'poRemaining' ? { key: 'poRemaining', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'poRemaining', direction: 'desc' })} className="inline-flex w-full items-center justify-center">PO rem. (₹) {renderSortIndicator(mainSortConfig.key === 'poRemaining', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap"><button type="button" onClick={() => setMainSortConfig((p) => p.key === 'eInvoice' ? { key: 'eInvoice', direction: p.direction === 'asc' ? 'desc' : 'asc' } : { key: 'eInvoice', direction: 'desc' })} className="inline-flex w-full items-center justify-center">E-Inv {renderSortIndicator(mainSortConfig.key === 'eInvoice', mainSortConfig.direction)}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {paginatedInvoices.map((inv, idx) => (
                        <tr
                          key={inv.id}
                          className={`align-top ${inv.isCancelled ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-gray-50'}`}
                        >
                          {(() => {
                            const po = commercialPOs.find((p) => String(p.id) === String(inv.poId));
                            const contract = Number(po?.totalContractValue) || 0;
                            const rateSum = sumRatePerCategory(po);
                            const dCount = daysInMonth(inv.invoiceDate || inv.created_at);
                            const expected = round2(rateSum * dCount);
                            const remaining = round2(contract - expected);
                            const cnSt = inv.cnDnRequestStatus || inv.cn_dn_request_status;
                            const isCancelled = !!inv.isCancelled;
                            return (
                              <>
                                <td className="px-3 py-2 text-xs text-gray-700 text-center font-medium tabular-nums whitespace-nowrap">
                                  {start + idx + 1}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono" title={inv.taxInvoiceNumber || inv.bill_number || ''}>
                                  <div className="flex flex-col items-center gap-0.5 min-w-0">
                                    <span className="truncate max-w-full">{renderTaxInvoiceOpener(inv)}</span>
                                    {isCancelled ? (
                                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 whitespace-nowrap">
                                        Cancelled
                                      </span>
                                    ) : null}
                                    {isProformaInvoiceKind(inv) ? (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 whitespace-nowrap">Proforma</span>
                                    ) : null}
                                    {cnSt === 'pending' ? (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 whitespace-nowrap">CN/DN pending</span>
                                    ) : null}
                                    {cnSt === 'approved' ? (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 whitespace-nowrap">CN/DN approved</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap">
                                  {formatManageInvoiceDate(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt)}
                                </td>
                                {showBillingTypeColumn ? (
                                  <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={getInvoiceBillingType(inv) || ''}>
                                    {getInvoiceBillingType(inv)}
                                  </td>
                                ) : null}
                                <td
                                  className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap overflow-hidden min-w-0"
                                  title={inv.ocNumber || '–'}
                                >
                                  <span className="block max-w-full truncate whitespace-nowrap">{inv.ocNumber || '–'}</span>
                                </td>
                                <td
                                  className="px-3 py-2 text-xs text-gray-700 text-center overflow-hidden min-w-0"
                                  title={inv.clientLegalName || inv.client_name || '–'}
                                >
                                  <span className="block max-w-full truncate">{inv.clientLegalName || inv.client_name || '–'}</span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 text-center tabular-nums whitespace-nowrap">
                                  ₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                                </td>
                                <td
                                  className="px-3 py-2 text-xs text-center tabular-nums font-medium text-gray-800 whitespace-nowrap"
                                  title="Tax invoice total − credits + debits linked to this invoice"
                                >
                                  ₹
                                  {netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                                </td>
                                <td className="px-3 py-2 text-xs text-center whitespace-nowrap">
                                  {contract > 0 ? (
                                    <span
                                      className={`font-medium ${remaining < 0 ? 'text-red-700' : 'text-gray-700'}`}
                                      title={`PO contract remaining: Contract ₹${contract.toLocaleString('en-IN')} − (Rate sum ₹${rateSum.toLocaleString('en-IN')} × ${dCount} days = ₹${expected.toLocaleString('en-IN')})`}
                                    >
                                      {formatINRWithSign(remaining)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">–</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-center">
                                  {getRealIrn(inv) ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex flex-nowrap items-center justify-center gap-1.5">
                                    {(() => {
                                      const irnExists = !!getRealIrn(inv);
                                      const proforma = isProformaInvoiceKind(inv);
                                      const eInvDisabled = irnExists || proforma;
                                      return (
                                    <button
                                      type="button"
                                      onClick={() => setGenerateEInvoiceModalId(inv.id)}
                                      disabled={generatingEInvoiceId === inv.id || eInvDisabled || isCancelled}
                                          title={
                                            proforma
                                              ? 'E-Invoice (IRN) is not generated for proforma invoices'
                                              : irnExists
                                                ? 'E-Invoice already generated'
                                            : isCancelled
                                              ? 'Cancelled invoices cannot generate e-invoice'
                                                : 'Generate E-Invoice'
                                          }
                                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border disabled:opacity-50 disabled:cursor-not-allowed ${
                                            eInvDisabled
                                              ? 'border-gray-200 bg-gray-100 text-gray-400'
                                              : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                          }`}
                                        >
                                          <FileDigit className="w-4 h-4" />
                                        </button>
                                      );
                                    })()}
                                    {renderDscAction(inv)}
                                    <button
                                      type="button"
                                      onClick={() => setViewId(inv.id)}
                                      title="View invoice"
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (getRealIrn(inv) || isCancelled) return;
                                        setInvoiceDraft({ mode: 'edit', invoiceId: inv.id, poId: inv.poId });
                                        onNavigateTab && onNavigateTab('create-invoice');
                                      }}
                                      title={
                                        isCancelled
                                          ? 'Cancelled invoices cannot be edited'
                                          : getRealIrn(inv)
                                            ? 'Cannot edit after e-invoice (IRN) generated'
                                            : 'Edit invoice'
                                      }
                                      disabled={!!getRealIrn(inv) || isCancelled}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void downloadManageInvoicePdf(inv)}
                                      title={hasDigitalSignature(inv) ? 'Download DSC-signed invoice' : 'Download Tax Invoice PDF'}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openCancelModal(inv)}
                                      disabled={isCancelled}
                                      title={isCancelled ? 'Already cancelled' : 'Cancel invoice'}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setManagePAInvoiceId(inv.id)}
                                      title="Manage PA"
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                    >
                                      <FileCheck className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
        </div>
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm.trim() || (monthFilter && monthFilter !== 'all')
              ? 'No bills for this search or month. Try All months.'
              : 'No bills yet — start from Make bill.'}
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{start + 1}</span>–
              <span className="font-medium">{Math.min(start + PAGE_SIZE, filteredInvoices.length)}</span> of{' '}
              <span className="font-medium">{filteredInvoices.length}</span> invoice{filteredInvoices.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-700">
                Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      ) : null}

      {manageTab === 'issued-cndn' ? (
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/90">
          <h3 className="text-sm font-semibold text-amber-950">Issued credit & debit notes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">S.No</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Note</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Parent tax invoice</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(creditDebitNotes || []).map((note, idx) => (
                <tr key={String(note.id)} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-center tabular-nums text-gray-700">{idx + 1}</td>
                  <td className="px-3 py-2 capitalize font-medium">{note.type}</td>
                  <td className="px-3 py-2 font-mono text-gray-800">{note.noteTaxInvoiceNumber || '–'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{note.parentTaxInvoiceNumber}</td>
                  <td className="px-3 py-2 text-right tabular-nums">₹{(note.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-gray-600">{note.created_at || '–'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        const parent = invoices.find((i) => String(i.id) === String(note.parentInvoiceId));
                        void downloadCreditDebitNotePdf(note, parent, {
                          digitalSignatureDataUrl: parent?.digitalSignatureDataUrl || parent?.digital_signature_data_url,
                        });
                      }}
                      className="text-amber-700 hover:underline text-xs font-medium"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!creditDebitNotes || creditDebitNotes.length === 0) && (
          <p className="px-4 py-6 text-center text-sm text-gray-500">No credit or debit notes issued yet.</p>
        )}
      </div>
      ) : null}

      {manageTab === 'cancelled' ? (
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 bg-rose-50/80">
            <h3 className="text-sm font-semibold text-rose-900">Cancelled billings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">S.No</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Invoice #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Invoice Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">OC Number</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Client Name</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Cancelled at</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remark</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedCancelledInvoices.map((inv, idx) => (
                  <tr key={`cancel-${inv.id}`} className="bg-rose-50/30 hover:bg-rose-50/50">
                    <td className="px-3 py-2 text-center tabular-nums text-gray-700">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-gray-900">{renderTaxInvoiceOpener(inv)}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {formatManageInvoiceDate(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">{inv.ocNumber || '–'}</td>
                    <td className="px-3 py-2 text-gray-800">{inv.clientLegalName || inv.client_name || '–'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                      ₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {inv.cancelledAt ? formatDateTimeDdMmYyyy(inv.cancelledAt) : '–'}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      <span
                        className="block max-w-[420px] truncate"
                        title={inv.cancelReason || '–'}
                      >
                        {firstWordsWithEllipsis(inv.cancelReason, 4)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-nowrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewId(inv.id)}
                          title="View invoice"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {renderDscAction(inv)}
                        <button
                          type="button"
                          onClick={() => openEditCancelRemarkModal(inv)}
                          title="Edit cancellation remark"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadManageInvoicePdf(inv)}
                          title={hasDigitalSignature(inv) ? 'Download DSC-signed invoice' : 'Download Tax Invoice PDF'}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedCancelledInvoices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">No cancelled invoices.</p>
          ) : null}
        </div>
      ) : null}

      {selectedInv ? (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex flex-col">
          <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                Tax invoice – {selectedInv.taxInvoiceNumber || selectedInv.bill_number || '–'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {canEditViewDsc
                  ? 'Invoice is locked. Drag a box on the page where the USB DSC should appear.'
                  : 'View only.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canEditViewDsc ? (
                <>
                  {viewDscRegion && !viewSigDraft ? (
                    <button
                      type="button"
                      onClick={() => {
                        setUsbPin('');
                        setUsbError('');
                        setUsbModalOpen(true);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open USB token
                    </button>
                  ) : null}
                  {viewSigDraft || viewDscRegion ? (
                    <button
                      type="button"
                      onClick={() => {
                        setViewSigDraft('');
                        setViewDscRegion(null);
                        setViewDscCert(null);
                        persistDscCert(selectedInv.id, null);
                        setViewSigError('');
                      }}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Clear DSC area
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={saveViewDigitalSignature}
                    disabled={!viewSigDirty || viewSigSaving}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {viewSigSaving ? 'Saving…' : 'Save DSC-signed invoice'}
                  </button>
                </>
              ) : (
                <p className="text-xs text-slate-600 max-w-xs">
                  {selectedInv.isCancelled
                    ? 'Cancelled invoices cannot be signed.'
                    : 'E-invoice already filed — DSC cannot be changed.'}
                </p>
              )}
              <button
                type="button"
                onClick={closeInvoiceViewer}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {viewSigError ? (
            <p className="shrink-0 px-4 sm:px-6 py-2 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{viewSigError}</p>
          ) : null}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-gray-100">
            <div
              ref={invoiceWrapRef}
              className={`relative mx-auto max-w-[210mm] select-none ${canEditViewDsc ? 'cursor-crosshair' : ''}`}
              onMouseDown={beginDscSelect}
              onMouseMove={moveDscSelect}
              onMouseUp={endDscSelect}
              onMouseLeave={() => {
                if (dscDrag) endDscSelect();
              }}
            >
              <InvoiceHtmlPreview
                inv={{
                  ...selectedInv,
                  digitalSignatureDataUrl: viewDscRegion ? null : viewSigDraft || null,
                  digital_signature_data_url: viewDscRegion ? null : viewSigDraft || null,
                }}
                po={getPoByInvoice(selectedInv)}
                showEInvoiceMeta={false}
                hideAuthorisedSignature={!!viewDscRegion && !foxitAppearance}
              />
              {overlayRegion ? (
                <div
                  className={`absolute z-10 box-border pointer-events-none overflow-hidden ${
                    foxitAppearance && !dscDrag
                      ? ''
                      : 'border-2 border-emerald-600 bg-emerald-500/10'
                  }`}
                  style={{
                    left: `${overlayRegion.left}%`,
                    top: `${overlayRegion.top}%`,
                    width: `${overlayRegion.width}%`,
                    height: `${overlayRegion.height}%`,
                  }}
                >
                  {foxitAppearance && !dscDrag ? (
                    <div className="h-full w-full px-1 py-0.5 text-left leading-[1.25]">
                      {foxitAppearance.lines.map((row) => (
                        <p
                          key={row.text}
                          className={`m-0 ${row.bold ? 'font-semibold text-[8px] text-slate-900' : 'font-normal text-[7px] text-slate-600'}`}
                        >
                          {row.text}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {usbModalOpen ? (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                <Usb className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900">USB DSC token</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Certificates from the plugged-in USB token. Choose one to place in the selected box.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (usbBusy) return;
                  setUsbModalOpen(false);
                  setUsbPin('');
                  setUsbError('');
                }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              className="p-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void confirmUsbDsc();
              }}
            >
              {usbReaders.length ? (
                <p className="text-xs text-slate-600">
                  USB reader: {usbReaders.map((r) => r.name).filter(Boolean).join(', ')}
                  {usbReaders.some((r) => r.atr) ? ` (card ${usbReaders.map((r) => r.atr).filter(Boolean).join(', ')})` : ''}
                </p>
              ) : (
                <p className="text-xs text-slate-600">No live USB DSC reader is connected.</p>
              )}
              {usbIssues.length ? (
                <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1">
                  {usbIssues.map((issue) => (
                    <li key={issue.instanceId || issue.name}>
                      {issue.name}
                      {issue.hint ? ` — ${issue.hint}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {usbCertsLoading ? (
                  <p className="px-3 py-4 text-sm text-slate-600">Reading certificates from the USB token…</p>
                ) : usbCerts.length ? (
                  usbCerts.map((cert) => {
                    const thumb = String(cert.thumbprint || '');
                    const selected = thumb === String(usbSelectedThumb);
                    const from = cert.notBefore ? new Date(cert.notBefore) : null;
                    const to = cert.notAfter ? new Date(cert.notAfter) : null;
                    const validLabel =
                      from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())
                        ? `${from.toLocaleDateString('en-IN')} – ${to.toLocaleDateString('en-IN')}`
                        : '';
                    return (
                      <label
                        key={thumb || cert.serialNumber}
                        className={`flex gap-3 px-3 py-2.5 cursor-pointer ${selected ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'}`}
                      >
                        <input
                          type="radio"
                          name="usb-dsc-cert"
                          className="mt-1"
                          checked={selected}
                          onChange={() => setUsbSelectedThumb(thumb)}
                        />
                        <span className="min-w-0 text-xs text-slate-700 space-y-0.5">
                          <span className="block text-sm font-semibold text-slate-900 truncate">
                            {cert.commonName || cert.subject || 'Certificate'}
                          </span>
                          {cert.subject && cert.commonName ? (
                            <span className="block text-slate-500 break-all">{cert.subject}</span>
                          ) : null}
                          {cert.serialNumber ? (
                            <span className="block">Serial: {cert.serialNumber}</span>
                          ) : null}
                          {cert.issuerCn || cert.issuer ? (
                            <span className="block">Issuer: {cert.issuerCn || cert.issuer}</span>
                          ) : null}
                          {validLabel ? <span className="block">Valid: {validLabel}</span> : null}
                          {cert.thumbprint ? (
                            <span className="block break-all">Thumbprint: {cert.thumbprint}</span>
                          ) : null}
                          {cert.provider ? (
                            <span className="block text-slate-500">{cert.provider}</span>
                          ) : null}
                          {cert.onHardwareToken ? (
                            <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              Hardware token
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-sm text-slate-600">No certificates listed yet.</p>
                )}
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Token PIN
                <input
                  type="password"
                  autoComplete="off"
                  value={usbPin}
                  onChange={(e) => {
                    setUsbPin(e.target.value);
                    if (usbError) setUsbError('');
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="If Windows asks, enter the same PIN"
                />
              </label>
              {usbError ? <p className="text-xs text-rose-700">{usbError}</p> : null}
              <p className="text-xs text-slate-500">
                Keep the token plugged in. After Windows recognises it, click Refresh. Enter the token PIN if the list is empty.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={usbBusy || usbCertsLoading}
                  onClick={() => {
                    setUsbModalOpen(false);
                    setUsbPin('');
                    setUsbError('');
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={usbBusy || usbCertsLoading}
                  onClick={() => void refreshUsbCerts(usbPin)}
                  className="px-3 py-2 rounded-lg border border-emerald-200 bg-white text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  {usbCertsLoading ? 'Reading token…' : 'Refresh'}
                </button>
                <button
                  type="submit"
                  disabled={usbBusy || usbCertsLoading || !usbSelectedThumb}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {usbBusy ? 'Applying certificate…' : 'Apply selected certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {managePAInvoiceId && (
        <ManagePAModal
          invoiceId={managePAInvoiceId}
          invoice={hydratedInvoices.find((i) => i.id === managePAInvoiceId)}
          onClose={() => setManagePAInvoiceId(null)}
        />
      )}

      {generateEInvoiceModalId && (
        <GenerateEInvoiceModal
          invoice={hydratedInvoices.find((i) => i.id === generateEInvoiceModalId)}
          onClose={() => setGenerateEInvoiceModalId(null)}
          onGenerate={async (inv) => {
            await handleGenerateEInvoice(inv);
            onNavigateTab && onNavigateTab('generated-e-invoice');
          }}
        />
      )}

      {cancelModalInv ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 truncate">
                  {cancelModalMode === 'edit-remark' ? 'Edit cancellation remark' : 'Cancel invoice'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Invoice:{' '}
                  <span className="font-mono font-semibold text-gray-700">
                    {cancelModalInv.taxInvoiceNumber || cancelModalInv.bill_number || '–'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCancelModalInv(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-2">
              <label className="text-sm font-medium text-gray-700">Cancellation remark</label>
              <textarea
                value={cancelRemark}
                onChange={(e) => {
                  setCancelRemark(e.target.value);
                  if (cancelRemarkError) setCancelRemarkError('');
                }}
                rows={4}
                placeholder="Type reason for cancellation…"
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  cancelRemarkError
                    ? 'border-rose-300 focus:ring-rose-200'
                    : 'border-gray-200 focus:ring-red-200'
                }`}
              />
              {cancelRemarkError ? <p className="text-xs text-rose-700">{cancelRemarkError}</p> : null}
              {cancelModalMode !== 'edit-remark' ? (
                <p className="text-xs text-gray-500">
                  This will mark the invoice as cancelled (it will stay saved for proof). The invoice number will not be reused.
                </p>
              ) : null}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModalInv(null)}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={confirmCancelInvoice}
                className="px-3 py-2 rounded-lg bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700"
              >
                {cancelModalMode === 'edit-remark' ? 'Save remark' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ManageInvoices;
