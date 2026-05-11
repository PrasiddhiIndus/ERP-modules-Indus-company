/**
 * Generate Tax Invoice PDF matching the standard structure/UI (header, seller, buyer,
 * item table, tax summary, bank details, terms, footer). Uses data from Create Invoice / Manage Invoices.
 */
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  roundInvoiceAmount,
  formatAmountUpTo3Decimals,
  formatInvoiceTotalDisplay,
  normalizeGstSupplyType,
} from './invoiceRound';
import { getTermsForVertical } from './invoiceTermsTemplates';
import { INDUS_LOGO_SRC } from '../constants/branding.js';

let companyLogoDataUrlPromise = null;

/** Fetch public logo once; returns data URL or null (PDF-safe PNG/JPEG). */
function fetchCompanyLogoDataUrlForPdf() {
  if (companyLogoDataUrlPromise) return companyLogoDataUrlPromise;
  companyLogoDataUrlPromise = (async () => {
    try {
      const res = await fetch(INDUS_LOGO_SRC, { cache: 'force-cache' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  return companyLogoDataUrlPromise;
}

/** PAN embedded in GSTIN (positions 3–12 of a valid 15-char GSTIN). */
function panEmbeddedInGstin(gstin) {
  const g = String(gstin || '').trim().toUpperCase();
  if (g.length !== 15) return '';
  return g.slice(2, 12);
}

const SELLER_GSTIN = '24AADCI2182H1ZS';
const COMPANY_DISPLAY_NAME = 'INDUS FIRE SAFETY PRIVATE LIMITED';
const GST_RULE_LINE = 'Rule 46, Section 31 of GST Act - 2017';
const DEFAULT_UDHYAM_REG_NO = 'UDYAM-GJ-24-0001805';
const DEFAULT_SELLER_CIN = 'U29193GJ2012PTC070236';

// Seller (company issuing invoice) — single source for CIN / PAN / MSME on all invoice PDFs & HTML preview
const SELLER = {
  name: COMPANY_DISPLAY_NAME,
  address: 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara',
  state: 'Gujarat',
  stateCode: '24',
  gstin: SELLER_GSTIN,
  /** Companies Act CIN — set here once; optional per-invoice DB fields still override if present. */
  cin: DEFAULT_SELLER_CIN,
  pan: panEmbeddedInGstin(SELLER_GSTIN),
  /** MSME Udyam no. — set here once; optional per-invoice DB fields still override if present. */
  msmeUdyamNo: '',
};

export const DEFAULT_MSME_CLAUSE =
  'As per MSME Act, payment to be made within 45 days; delayed payments attract 18% p.a. interest.';

const BANK = {
  accountHolder: 'Indus Fire Safety Pvt. Ltd.',
  bankName: 'Axis Bank Ltd.',
  accountNo: '920030061304640',
  /** IFSC only (display beside Branch & IFSC). */
  ifsc: 'UTIB0000013',
  /** Full branch postal address (Axis Bank, Vardhman Complex, Vadodara). */
  branchAddress:
    'Axis Bank, Vardhman Complex, Race Course Road, Opp. GEB, Vadi Wadi, Vadodara - 390007',
};

const TERMS = [
  'Any dispute or discrepancy in the invoice must be raised in writing within 7 days from the invoice date, failing which the invoice shall be deemed accepted.',
];

const JURISDICTION = 'SUBJECT TO VADODARA JURISDICTION';
const FOOTER_ADDRESS = 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Gujarat - 390010';
const FOOTER_PHONE = '9724746316, 9930271155';
const FOOTER_EMAIL = 'info@indusfiresafety.com';
const FOOTER_WEB = 'www.indusfiresafety.com';

/** Standard PDF fonts do not encode U+20B9 (₹); use ASCII so preview/download match. */
const PDF_RS = 'Rs.';

/** Layout (mm, A4 portrait) */
const MARGIN = 14;
const GAP_COL = 6;
const BOX_GAP = 3;
const DETAILS_TO_MSME_GAP = 4;
const FONT = {
  title: 13,
  section: 9,
  body: 8,
  small: 7,
  tableHead: 7.5,
  tableBody: 8,
};
const LH = (fs) => Math.max(3.8, fs * 0.45);

/** Item table column widths (mm); must match autoTable columnStyles and sum to A4 content width (182). */
const ITEM_TABLE_COL_WIDTHS = [13, 64, 18, 16, 22, 12, 12, 25];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatPdfDate(d) {
  if (!d) return '–';
  try {
    const dt = new Date(d);
    const day = dt.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[dt.getMonth()];
    const year = String(dt.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch {
    return String(d);
  }
}

function formatInrPdf(n) {
  return formatAmountUpTo3Decimals(n);
}

function formatMoney2(n) {
  return round2(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function preferredTextValue(...values) {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (!s) continue;
    if (s === '–' || s === '-' || s === '—') continue;
    return s;
  }
  return '';
}

function normalizeInvoiceVerticalKey(v) {
  const raw = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const aliases = {
    bill: 'manpower',
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

/**
 * Commercial vertical from invoice / linked PO (matches BillingContext PO vertical rules).
 */
export function resolveInvoiceVerticalKey(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const direct =
    inv.poVertical || inv.po_vertical || inv.vertical || inv.termsTemplateKey || inv.terms_template_key;
  if (direct) return normalizeInvoiceVerticalKey(direct);
  const oc = inv.ocNumber || inv.oc_number;
  if (oc && String(oc).includes('-')) {
    const parts = String(oc).split('-');
    if (parts[1]) return normalizeInvoiceVerticalKey(parts[1]);
  }
  return '';
}

// Simple number to words for INR (up to 99,99,999)
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

function twoDigits(n) {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return (TENS[t] + (o ? ' ' + ONES[o] : '')).trim();
}

function threeDigits(n) {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const part = h ? ONES[h] + ' Hundred' : '';
  return (part + (rest ? ' ' + twoDigits(rest) : '')).trim();
}

function numberToWords(num) {
  const n = Math.floor(Number(num) || 0);
  if (n === 0) return 'Zero';
  const lakh = Math.floor(n / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ').trim() || 'Zero';
}

function amountInWords(amount) {
  const n = Math.floor(Number(amount) || 0);
  const dec = Math.round(((Number(amount) || 0) - n) * 100);
  let str = 'INR ' + numberToWords(n) + ' Only';
  if (dec > 0) str += ' and ' + numberToWords(dec) + ' Paise';
  return str;
}

/** Used by Create Invoice modal / HTML preview to match PDF wording. */
export function formatInvoiceAmountInWords(amount) {
  return amountInWords(amount);
}

export { BANK as INVOICE_BANK_DETAILS, SELLER as INVOICE_SELLER_TEMPLATE };
export const INVOICE_JURISDICTION = JURISDICTION;
export const INVOICE_CONTACT_FOOTER = {
  phone: FOOTER_PHONE,
  email: FOOTER_EMAIL,
  web: FOOTER_WEB,
  address: FOOTER_ADDRESS,
};

/** Letterhead-style billing footer: address, phone, email, website on white; solid maroon bar below (no text on bar). */
export const INVOICE_LETTERHEAD_FOOTER = {
  address: 'Indus House, Block No. 501, Opp. GSFC Main Gate, Dashrath, Vadodara, Gujarat-391740',
  phone: '+91 265 2343441, +91 265 2343442',
  email: 'firesafetyin@yahoo.com, info@indusfiresafety.com',
  website: 'www.indusfiresafety.com',
};

/** Bottom accent strip (letterhead) — deep maroon, no content. */
export const INVOICE_LETTERHEAD_STRIP_COLOR = '#800000';

/**
 * Build invoice numbers/amounts from inv (with or without items).
 * Ensures downloaded PDF shows GST even when only header totals were persisted.
 */
export function getInvoiceTotals(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const invoiceKind = String(inv.invoiceKind || inv.invoice_kind || '').toLowerCase();
  const forceItemTotals = (invoiceKind === 'credit_note' || invoiceKind === 'debit_note') && items.length > 0;
  const gstMode = normalizeGstSupplyType(inv.gstSupplyType ?? inv.gst_supply_type);
  let taxableValue = Number(inv.taxableValue);
  let cgstRate = Number(inv.cgstRate) || 9;
  let sgstRate = Number(inv.sgstRate) || 9;
  let igstRate = Number(inv.igstRate) || 0;
  let cgstAmt = Number(inv.cgstAmt);
  let sgstAmt = Number(inv.sgstAmt);
  let igstAmt = Number(inv.igstAmt);
  const sumItems = round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));

  if (forceItemTotals || !Number.isFinite(taxableValue) || taxableValue === 0) {
    taxableValue = sumItems;
  }

  if (gstMode === 'sez_zero') {
    cgstAmt = 0;
    sgstAmt = 0;
    igstAmt = 0;
    igstRate = 0;
  } else if (gstMode === 'inter') {
    cgstAmt = 0;
    sgstAmt = 0;
    if (!igstRate || igstRate === 0) igstRate = 18;
    if (forceItemTotals || !Number.isFinite(igstAmt) || igstAmt === 0) {
      igstAmt = round2((taxableValue * igstRate) / 100);
    }
  } else {
    const hasPositiveStored =
      (Number.isFinite(cgstAmt) && cgstAmt > 0) || (Number.isFinite(sgstAmt) && sgstAmt > 0);
    if (forceItemTotals || (taxableValue > 0 && !hasPositiveStored)) {
      cgstAmt = round2((taxableValue * cgstRate) / 100);
      sgstAmt = round2((taxableValue * sgstRate) / 100);
    } else {
      cgstAmt = round2(Number.isFinite(cgstAmt) ? cgstAmt : 0);
      sgstAmt = round2(Number.isFinite(sgstAmt) ? sgstAmt : 0);
    }
    igstAmt = 0;
  }

  const totalAmount = roundInvoiceAmount(round2(taxableValue + cgstAmt + sgstAmt + igstAmt));
  return {
    taxableValue: round2(taxableValue),
    cgstRate,
    sgstRate,
    cgstAmt,
    sgstAmt,
    igstRate,
    igstAmt,
    gstMode,
    totalAmount,
    items,
  };
}

export function resolveTermsLines(inv) {
  if (Array.isArray(inv.termsCustomLines) && inv.termsCustomLines.length) return inv.termsCustomLines;
  const txt = inv.termsText || inv.termsCustomText || inv.terms_custom_text;
  if (txt && String(txt).trim()) {
    return String(txt)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const vert = inv.termsTemplateKey || inv.poVertical || 'MANP';
  return getTermsForVertical(vert);
}

function docTitleForKind(kind) {
  if (kind === 'proforma') return 'PROFORMA INVOICE';
  if (kind === 'draft') return 'DRAFT INVOICE';
  if (kind === 'credit_note') return 'CREDIT NOTE';
  if (kind === 'debit_note') return 'DEBIT NOTE';
  return 'TAX INVOICE';
}

/**
 * Generate and download Tax Invoice PDF for the given invoice object.
 * @param {Object} inv - Invoice from BillingContext (taxInvoiceNumber, clientLegalName, items, etc.)
 * @param {Object} [options]
 * @param {boolean} [options.includeEinvoiceHeader=false] - When true and IRN is present,
 *   render the e-invoice IRN / Ack No / Ack Date + QR block at the top (for Generated E-Invoice).
 *   Normal downloads (Manage Invoices) should omit this so layout stays clean.
 */
function buildTaxInvoiceDoc(inv, options = {}) {
  if (!inv) return;
  const { includeEinvoiceHeader = false, logoDataUrl = null } = options;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - 2 * MARGIN;
  const midX = MARGIN + contentW / 2 + GAP_COL / 2;
  const colW = (contentW - GAP_COL) / 2;
  const footerStripH = 8;
  const bottomSafeY = pageH - footerStripH - 2;
  let y = MARGIN;

  const invoiceKind = inv.invoiceKind || options.invoiceKind || 'tax';
  const {
    taxableValue,
    cgstRate,
    sgstRate,
    cgstAmt,
    sgstAmt,
    igstRate,
    igstAmt,
    gstMode,
    totalAmount,
    items,
  } = getInvoiceTotals(inv);

  const ensureSpace = (requiredHeight = 0) => {
    if (y + requiredHeight <= bottomSafeY) return;
    doc.addPage();
    y = MARGIN;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(FONT.body);
    doc.setFont(undefined, 'normal');
  };

  const buyerName = inv.clientLegalName || inv.client_name || '–';
  const buyerAddress = inv.clientAddress || inv.billingAddress || '–';
  const shipToRaw = inv.clientShippingAddress || inv.client_shipping_address;
  const shipAddress =
    shipToRaw && String(shipToRaw).trim() ? String(shipToRaw).trim() : buyerAddress;
  const buyerGstin = inv.gstin || '–';
  const invoiceNo = inv.taxInvoiceNumber || inv.bill_number || '–';
  const invoiceDate = formatPdfDate(inv.invoiceDate || inv.created_at);
  const paymentTerms = inv.paymentTerms || '30 Days';
  const placeOfSupply = inv.placeOfSupply || inv.place_of_supply || 'Gujarat';
  const irn = inv.e_invoice_irn || inv.eInvoiceIrn;
  const ackNo = inv.e_invoice_ack_no || inv.eInvoiceAckNo;
  const ackDt = inv.e_invoice_ack_dt || inv.eInvoiceAckDt;
  const qrData = inv.e_invoice_signed_qr || inv.eInvoiceSignedQr;

  const buyerNameLine = 'M/s ' + (buyerName.startsWith('M/s') ? buyerName.slice(3).trim() : buyerName);

  // ----- Top company header (logo + company details + QR)
  const isEInvoicePdf = includeEinvoiceHeader && irn;
  const headerTopY = 4;
  /** Logo circle and e-invoice QR share the same mm footprint for visual parity (Manage vs Generated). */
  const HEADER_MARK_MM = 25;
  const markTopY = headerTopY + 0.8;
  const logoBox = { x: MARGIN, y: markTopY, w: HEADER_MARK_MM, h: HEADER_MARK_MM };
  const qrBoxW = HEADER_MARK_MM;
  const qrBoxH = HEADER_MARK_MM;
  const qrBoxX = pageW - MARGIN - qrBoxW;
  const qrBoxY = markTopY;
  const companyTextX = logoBox.x + logoBox.w + 3;
  const companyTextW = qrBoxX - companyTextX - 3;
  let logoPlaced = false;
  // Clean circular logo mark: no heavy border so the logo edge doesn't look cut.
  doc.setFillColor(255, 255, 255);
  doc.circle(logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2, logoBox.w / 2, 'F');
  if (logoDataUrl && typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
    try {
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      // Keep a light padding so the full mark fits cleanly.
      const lp = Math.min(1.1, logoBox.w * 0.05);
      doc.addImage(
        logoDataUrl,
        fmt,
        logoBox.x + lp,
        logoBox.y + lp,
        logoBox.w - 2 * lp,
        logoBox.h - 2 * lp,
        undefined,
        'FAST'
      );
      logoPlaced = true;
    } catch {
      /* fallback below */
    }
  }
  if (!logoPlaced) {
    doc.setFillColor(255, 255, 255);
    doc.circle(logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2, logoBox.w / 2, 'F');
    doc.setTextColor(20, 56, 110);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('IFS', logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2 + 1.2, { align: 'center' });
  }

  doc.setTextColor(20, 56, 110);
  const headerTitleY = headerTopY + 5.6;
  const ruleLineY = headerTitleY + 4.2;
  // Visual tuning: keep a clearer gap after Rule line, tighter gap before GSTIN line.
  const gapRuleToAddress = 4.2;
  const gapAddressToGstin = 0.8;
  const addressStartY = ruleLineY + gapRuleToAddress;

  doc.setFontSize(11.5);
  doc.setFont(undefined, 'bold');
  doc.text(COMPANY_DISPLAY_NAME, companyTextX, headerTitleY);

  doc.setFontSize(FONT.small);
  doc.setFont(undefined, 'normal');
  doc.text(GST_RULE_LINE, companyTextX, ruleLineY);

  const sellerAddrHeaderLines = doc.splitTextToSize(SELLER.address, companyTextW);
  doc.text(sellerAddrHeaderLines, companyTextX, addressStartY);
  const addressBlockH = sellerAddrHeaderLines.length * LH(FONT.small);
  const gstLineY = addressStartY + addressBlockH + gapAddressToGstin;
  const headerGstin = preferredTextValue(inv.sellerGstin, inv.seller_gstin, SELLER.gstin);
  const headerPan = preferredTextValue(inv.sellerPan, inv.seller_pan, SELLER.pan);
  const headerCin = preferredTextValue(inv.sellerCin, inv.seller_cin, SELLER.cin, DEFAULT_SELLER_CIN);
  const sellerIdLine = `GSTIN: ${headerGstin} | PAN Number - ${headerPan || '–'} | CIN Number-${headerCin || '–'}`;
  const sellerIdLines = doc.splitTextToSize(sellerIdLine, companyTextW);
  sellerIdLines.forEach((ln, i) => {
    doc.text(ln, companyTextX, gstLineY + i * LH(FONT.small));
  });
  const gstLineBlockBottom = gstLineY + sellerIdLines.length * LH(FONT.small);

  if (isEInvoicePdf) {
    doc.setDrawColor(150, 150, 150);
    doc.rect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 'S');
    doc.setFontSize(6);
    doc.setTextColor(90, 90, 90);
    doc.text('E-INVOICE', qrBoxX + qrBoxW / 2, qrBoxY - 0.6, { align: 'center' });
    if (typeof qrData === 'string' && qrData.length > 0 && (qrData.startsWith('data:image/') || qrData.startsWith('data:application/'))) {
      try {
        const type = qrData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(qrData, type, qrBoxX + 0.8, qrBoxY + 0.8, qrBoxW - 1.6, qrBoxH - 1.6);
      } catch {
        doc.setFontSize(6);
        doc.text('QR Code', qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH / 2 + 1, { align: 'center' });
      }
    } else {
      doc.setFontSize(6);
      doc.text('QR Code', qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH / 2 + 1, { align: 'center' });
    }
  }

  doc.setTextColor(0, 0, 0);
  y = Math.max(gstLineBlockBottom + 3, qrBoxY + qrBoxH + 3);

  doc.setDrawColor(20, 56, 110);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 5;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(20, 56, 110);
  doc.text(isEInvoicePdf ? 'GST E-INVOICE' : 'GST INVOICE', pageW / 2, y, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'normal');
  doc.text('(ORIGINAL FOR RECIPIENT)', pageW - MARGIN - 1.5, y, { align: 'right' });
  // Keep only the recipient marker on the right; e-invoice flag is shown in title and QR label.
  y += 2.5;
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 4;
  doc.setLineWidth(0.2);
  doc.setTextColor(0, 0, 0);

  if (isEInvoicePdf) {
    doc.setFillColor(240, 244, 250);
    const infoLabelW = 17;
    const infoTextW = contentW - 5 - infoLabelW;
    doc.setFontSize(FONT.small);
    const irnLines = doc.splitTextToSize(String(irn || '–'), infoTextW);
    const ackNoLines = doc.splitTextToSize(String(ackNo || '–'), infoTextW);
    const ackDtLines = doc.splitTextToSize(String(ackDt ? formatPdfDate(ackDt) : '–'), infoTextW);
    const rowGap = 0.45;
    const infoRowH = Math.max(
      12,
      3.2 +
        irnLines.length * LH(FONT.small) +
        rowGap +
        ackNoLines.length * LH(FONT.small) +
        rowGap +
        ackDtLines.length * LH(FONT.small) +
        1.6
    );
    doc.rect(MARGIN, y - 2.8, contentW, infoRowH, 'F');
    let infoY = y + 1.2;
    const drawEInvField = (label, lines) => {
      doc.setFont(undefined, 'bold');
      doc.text(`${label}:`, MARGIN + 1.5, infoY);
      doc.setFont(undefined, 'normal');
      doc.text(lines, MARGIN + 1.5 + infoLabelW, infoY);
      infoY += lines.length * LH(FONT.small) + rowGap;
    };
    drawEInvField('IRN No', irnLines);
    drawEInvField('Ack No', ackNoLines);
    drawEInvField('Ack Date', ackDtLines);
    y += infoRowH - 1.8;
  } else {
    y += 1;
  }

  // ----- Invoice details block (two columns centered)
  const blockTop = y;
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');

  const msmeNo = inv.msmeRegistrationNo || inv.msme_registration_no || SELLER.msmeUdyamNo;
  const msmeClause = inv.msmeClause || inv.msme_clause || DEFAULT_MSME_CLAUSE;
  const udhyamNo = msmeNo || DEFAULT_UDHYAM_REG_NO;
  const msmeText = `MSME Udyam : ${msmeClause ? msmeClause : ''}`;
  const udhyamLine = `Udhyam Registration No. : ${udhyamNo}`;

  const billMonth = inv.billingMonth || inv.billing_month || '–';
  const durFrom = inv.billingDurationFrom || inv.billing_duration_from;
  const durTo = inv.billingDurationTo || inv.billing_duration_to;
  const billingDur =
    durFrom && durTo ? `${formatPdfDate(durFrom)} to ${formatPdfDate(durTo)}` : durFrom || durTo ? formatPdfDate(durFrom || durTo) : '–';

  const origTaxNo =
    inv.originalTaxInvoiceNumber ||
    inv.original_tax_invoice_number ||
    inv.parentTaxInvoiceNumber ||
    inv.parent_tax_invoice_number;
  const origTaxNoRow =
    origTaxNo && (invoiceKind === 'credit_note' || invoiceKind === 'debit_note')
      ? [['Original Tax Invoice No.', String(origTaxNo)]]
      : [];

  const invVertical = resolveInvoiceVerticalKey(inv);
  const isManpowerInvoice = invVertical === 'manpower';

  const poNumberDisp =
    preferredTextValue(inv.poWoNumber, inv.po_wo_number) ||
    preferredTextValue(inv.ocNumber, inv.oc_number) ||
    '–';

  const deliveryNote = inv.deliveryNote || inv.delivery_note || '–';
  const otherReference = inv.otherReference || inv.other_reference || '–';
  const dispatchDocNo = inv.dispatchDocNo || inv.dispatch_doc_no || '–';
  const deliveryNoteDateRaw = inv.deliveryNoteDate || inv.delivery_note_date || '';
  const deliveryNoteDate = deliveryNoteDateRaw ? formatPdfDate(deliveryNoteDateRaw) : '–';
  const dispatchedThrough = inv.dispatchedThrough || inv.dispatched_through || '–';
  const destination = inv.destination || '–';
  const termsOfDelivery = inv.termsOfDelivery || inv.terms_of_delivery || '–';

  let leftMeta;
  let rightMeta;
  if (isManpowerInvoice) {
    leftMeta = [
      ['Invoice No.', invoiceNo],
      ['Billing Month', billMonth],
      ['PO Number', poNumberDisp],
    ];
    rightMeta = [
      ['Invoice Date', invoiceDate],
      ['Service Period', billingDur],
      ['Terms of Payment', paymentTerms],
      ...origTaxNoRow,
    ];
  } else {
    leftMeta = [
      ['Invoice No.', invoiceNo],
      ['Billing Month', billMonth],
      ['PO Number', poNumberDisp],
      ['Delivery Note', deliveryNote],
      ['Dispatch Doc. No.', dispatchDocNo],
      ['Terms of Delivery', termsOfDelivery],
      ['Other Reference', otherReference],
    ];
    rightMeta = [
      ['Invoice Date', invoiceDate],
      ['Service Period', billingDur],
      ['Terms of Payment', paymentTerms],
      ['Delivery Note Date', deliveryNoteDate],
      ['Dispatched Through', dispatchedThrough],
      ['Destination', destination],
      ...origTaxNoRow,
    ];
  }
  const detailsRowGap = isManpowerInvoice ? 0.72 : 0.9;
  const labelW = 35;
  const colPad = 2;
  const leftX = MARGIN + colPad;
  const rightX = midX + colPad;
  const detailsValueWidth = colW - labelW - 6;

  /** Manpower: a bit more space under top border + small matching gap above bottom (trim handles jsPDF cursor slack). Other verticals: more top, tight bottom. */
  const MANPOWER_DETAILS_TOP_MM = 4.1;
  const MANPOWER_DETAILS_BOTTOM_MM = 2.1;
  const detailsPadTop = isManpowerInvoice ? MANPOWER_DETAILS_TOP_MM : 5;
  const detailsPadBottom = isManpowerInvoice ? MANPOWER_DETAILS_BOTTOM_MM : 1.75;
  /** Pull bottom border up toward ink; keep trim moderate so bottom gap stays small, not huge. */
  const metaBottomTrim = isManpowerInvoice ? 1.05 : 0.82;

  const drawMeta = (x, rows, yStart) => {
    let curY = yStart;
    rows.forEach(([label, val], idx) => {
      doc.setFont(undefined, 'bold');
      doc.text(label + ':', x, curY);
      doc.setFont(undefined, 'normal');
      const vLines = doc.splitTextToSize(String(val), detailsValueWidth);
      doc.text(vLines, x + labelW, curY);
      const gap = idx < rows.length - 1 ? detailsRowGap : 0;
      curY += Math.max(LH(FONT.body), vLines.length * LH(FONT.body)) + gap;
    });
    return curY;
  };

  let yL = blockTop + detailsPadTop;
  let yR = blockTop + detailsPadTop;
  yL = drawMeta(leftX, leftMeta, yL);
  yR = drawMeta(rightX, rightMeta, yR);
  const contentBottom = Math.max(yL, yR);
  const detailsBoxH = contentBottom - blockTop + detailsPadBottom - metaBottomTrim;

  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, blockTop, contentW, detailsBoxH, 'S');

  y = blockTop + detailsBoxH + DETAILS_TO_MSME_GAP;

  if (msmeText) {
    doc.setDrawColor(230, 200, 0);
    doc.setFillColor(255, 251, 230);
    const msmeLineGap = LH(FONT.body) + 0.4;
    const msmeInnerTop = 4.8;
    const msmeInnerBottom = 2.2;
    const msmeBlockGap = 1.35;
    const msmeA = doc.splitTextToSize(msmeText, contentW - 6);
    const msmeB = doc.splitTextToSize(udhyamLine, contentW - 6);
    const hA = msmeA.length * msmeLineGap;
    const hB = msmeB.length * msmeLineGap;
    const msmeBoxH = Math.max(msmeInnerTop + hA + msmeBlockGap + hB + msmeInnerBottom, 13);
    doc.rect(MARGIN, y, contentW, msmeBoxH, 'FD');
    doc.setFontSize(FONT.body + 0.6);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(183, 121, 31);
    doc.text(msmeA, MARGIN + 2, y + msmeInnerTop, { align: 'left', baseline: 'top' });
    doc.text(msmeB, MARGIN + 2, y + msmeInnerTop + hA + msmeBlockGap, { align: 'left', baseline: 'top' });
    doc.setTextColor(0, 0, 0);
    y += msmeBoxH + BOX_GAP;
  }

  // ----- Buyer (Bill to) left | Consignee (Ship to) right
  const partyTop = y;
  const partyInnerTop = partyTop + 9.2;
  const partyColXLeft = MARGIN + 2;
  const partyColXRight = midX + 2;
  const partyColTextW = colW - 5;
  const buyerAddressLines = doc.splitTextToSize(buyerAddress, partyColTextW);
  const shipAddressLines = doc.splitTextToSize(shipAddress, partyColTextW);
  const shipStatePosLines = doc.splitTextToSize(
    `State Name: ${SELLER.state}, Code: ${SELLER.stateCode}, Place of Supply: ${placeOfSupply}`,
    partyColTextW
  );
  const billHeight =
    LH(FONT.body) + // name
    buyerAddressLines.length * LH(FONT.body) +
    LH(FONT.body) + // gstin
    LH(FONT.body); // state
  const shipHeight =
    LH(FONT.body) + // name
    shipAddressLines.length * LH(FONT.body) +
    LH(FONT.body) + // gstin
    shipStatePosLines.length * LH(FONT.body); // state + place of supply (one block)
  const partyContentHeight = Math.max(billHeight, shipHeight);
  const partyBottom = partyInnerTop + partyContentHeight + 2.2;
  const partyBoxH = Math.max(27, partyBottom - partyTop);

  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, partyTop, contentW, partyBoxH, 'S');
  doc.line(midX - GAP_COL / 2, partyTop, midX - GAP_COL / 2, partyTop + partyBoxH);
  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(26, 58, 108);
  doc.text('BUYER (BILL TO)', partyColXLeft, partyTop + 4.5);
  doc.text('CONSIGNEE (SHIP TO)', partyColXRight, partyTop + 4.5);
  doc.setDrawColor(210, 210, 210);
  doc.line(MARGIN + 2, partyTop + 6, midX - GAP_COL / 2 - 2, partyTop + 6);
  doc.line(midX + 2, partyTop + 6, MARGIN + contentW - 2, partyTop + 6);
  y = partyInnerTop;

  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(FONT.body);
  let yBill = y;
  let yShip = y;

  doc.setFont(undefined, 'bold');
  doc.text(buyerNameLine, partyColXLeft, yBill);
  doc.setFont(undefined, 'normal');
  yBill += LH(FONT.body);
  doc.text(buyerAddressLines, partyColXLeft, yBill);
  yBill += buyerAddressLines.length * LH(FONT.body);
  doc.text('GSTIN: ' + buyerGstin, partyColXLeft, yBill);
  yBill += LH(FONT.body);
  doc.text(`State Name: ${SELLER.state}, Code: ${SELLER.stateCode}`, partyColXLeft, yBill);
  yBill += LH(FONT.body);

  doc.setFont(undefined, 'bold');
  doc.text(buyerNameLine, partyColXRight, yShip);
  doc.setFont(undefined, 'normal');
  yShip += LH(FONT.body);
  doc.text(shipAddressLines, partyColXRight, yShip);
  yShip += shipAddressLines.length * LH(FONT.body);
  doc.text('GSTIN: ' + buyerGstin, partyColXRight, yShip);
  yShip += LH(FONT.body);
  doc.text(shipStatePosLines, partyColXRight, yShip);
  yShip += shipStatePosLines.length * LH(FONT.body);

  y = partyTop + partyBoxH + BOX_GAP;
  ensureSpace(18);

  const hdrRemarks = inv.invoiceHeaderRemarks || inv.invoice_header_remarks;
  const remarksText = hdrRemarks && String(hdrRemarks).trim() ? String(hdrRemarks).trim() : '–';
  doc.setDrawColor(187, 187, 187);
  doc.setFillColor(255, 255, 255);
  const hdrLines = doc.splitTextToSize(remarksText, contentW - 4);
  const boxH = Math.max(hdrLines.length * LH(FONT.body) + 8, 14);
  doc.rect(MARGIN, y, contentW, boxH, 'FD');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(FONT.small);
  doc.setTextColor(26, 58, 108);
  doc.text('Description / Remarks', MARGIN + 2, y + 4);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(110, 110, 110);
  doc.text(hdrLines, MARGIN + 2, y + 8);
  doc.setTextColor(0, 0, 0);
  y += boxH + BOX_GAP;
  ensureSpace(28);

  // ----- Item table (widths sum to contentW)
  const tableHeaders = [
    'SR\nNo.',
    'DESCRIPTION OF GOODS',
    'HSN/\nSAC',
    'Qty',
    `RATE\n(${PDF_RS})`,
    'UOM',
    'DISC.\n%',
    `AMOUNT\n(${PDF_RS})`,
  ];
  const rowItems =
    items.length > 0
      ? items
      : [{ description: 'Services as per PO', hsnSac: inv.hsnSac || '9983', quantity: 1, rate: taxableValue, amount: taxableValue }];

  const tableBody = rowItems.map((it, idx) => [
    String(idx + 1),
    (it.description || it.designation || '–').substring(0, 120),
    String(it.hsnSac || inv.hsnSac || '–'),
    formatInrPdf(it.quantity || 0),
    formatMoney2(it.rate || 0),
    'No.',
    '—',
    formatMoney2(it.amount || 0),
  ]);

  const subtotalRowStyle = { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] };
  if (gstMode === 'intra') {
    if (cgstAmt > 0) {
      tableBody.push([
        { content: 'CGST @ ' + cgstRate + '%', colSpan: 7, styles: subtotalRowStyle },
        { content: formatMoney2(cgstAmt), styles: subtotalRowStyle },
      ]);
    }
    if (sgstAmt > 0) {
      tableBody.push([
        { content: 'SGST @ ' + sgstRate + '%', colSpan: 7, styles: subtotalRowStyle },
        { content: formatMoney2(sgstAmt), styles: subtotalRowStyle },
      ]);
    }
  } else if (gstMode === 'inter' && igstAmt > 0) {
    tableBody.push([
      { content: 'IGST @ ' + igstRate + '%', colSpan: 7, styles: subtotalRowStyle },
      { content: formatMoney2(igstAmt), styles: subtotalRowStyle },
    ]);
  } else if (gstMode === 'sez_zero') {
    tableBody.push([
      { content: 'GST @ 0% (SEZ / nil rated)', colSpan: 7, styles: subtotalRowStyle },
      { content: formatMoney2(0), styles: subtotalRowStyle },
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [tableHeaders],
    body: tableBody,
    theme: 'grid',
    tableWidth: contentW,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      fontSize: FONT.tableBody,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 },
      valign: 'middle',
      lineColor: [100, 100, 100],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [225, 232, 244],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: FONT.tableHead,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 9,
    },
    columnStyles: {
      0: { cellWidth: ITEM_TABLE_COL_WIDTHS[0], halign: 'center' },
      1: { cellWidth: ITEM_TABLE_COL_WIDTHS[1], halign: 'left', overflow: 'linebreak' },
      2: { cellWidth: ITEM_TABLE_COL_WIDTHS[2], halign: 'center' },
      3: { cellWidth: ITEM_TABLE_COL_WIDTHS[3], halign: 'right' },
      4: { cellWidth: ITEM_TABLE_COL_WIDTHS[4], halign: 'right' },
      5: { cellWidth: ITEM_TABLE_COL_WIDTHS[5], halign: 'center' },
      6: { cellWidth: ITEM_TABLE_COL_WIDTHS[6], halign: 'center' },
      7: { cellWidth: ITEM_TABLE_COL_WIDTHS[7], halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 0.6;
  ensureSpace(48);

  // Totals under table — align split with item columns: SR…Rate (left) | UOM+Disc+Amount (blue bar)
  const totalQty = rowItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const invoiceTotalBarH = 7;
  const leftTotalColsW = ITEM_TABLE_COL_WIDTHS.slice(0, 5).reduce((a, b) => a + b, 0);
  const rightBlueColsW = ITEM_TABLE_COL_WIDTHS.slice(5).reduce((a, b) => a + b, 0);
  const totalBarSplitX = MARGIN + leftTotalColsW;
  const invoiceBarW = rightBlueColsW;

  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Total Quantity: ' + formatInrPdf(totalQty) + ' No.', MARGIN + 2, y + 4.7);

  doc.setFillColor(18, 61, 124);
  doc.rect(totalBarSplitX, y, invoiceBarW, invoiceTotalBarH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text('INVOICE TOTAL', totalBarSplitX + 1.6, y + 4.7);
  doc.text(`${PDF_RS} ${formatInvoiceTotalDisplay(totalAmount)}`, MARGIN + contentW - 2, y + 4.7, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  y += invoiceTotalBarH + 1.2;

  // Amount in words (directly under total row, before bank / summary)
  ensureSpace(22);
  const amtLines = doc.splitTextToSize(amountInWords(totalAmount), contentW - 4);
  const amtRowH = Math.max(amtLines.length * LH(FONT.body) + 6.5, 10);
  doc.setFillColor(248, 249, 251);
  doc.rect(MARGIN, y, contentW, amtRowH, 'F');
  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, y, contentW, amtRowH, 'S');
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text('AMOUNT CHARGEABLE (IN WORDS)', MARGIN + 2, y + 4);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(amtLines, MARGIN + 2, y + 7.6);
  y += amtRowH + BOX_GAP;

  // ----- Bank details (label column + left-aligned values)
  const bankAfterTitle = 8.6;
  const bankLabelColW = 36;
  const bankLabelX = MARGIN + 2;
  const bankValueX = bankLabelX + bankLabelColW;
  const bankValueW = Math.max(24, contentW - bankLabelColW - 6);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  const bankFieldH = (text) =>
    doc.splitTextToSize(String(text), bankValueW).length * LH(FONT.body);
  const branchGap = 1.5;
  const summaryH =
    bankAfterTitle +
    bankFieldH(BANK.accountHolder) +
    bankFieldH(BANK.bankName) +
    bankFieldH(BANK.accountNo) +
    bankFieldH(BANK.ifsc) +
    branchGap +
    bankFieldH(BANK.branchAddress) +
    4;

  ensureSpace(Math.ceil(summaryH) + 10);
  const summaryTop = y;
  doc.setFillColor(249, 250, 252);
  doc.rect(MARGIN, summaryTop, contentW, summaryH, 'F');
  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, summaryTop, contentW, summaryH, 'S');

  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text('BANK DETAILS', MARGIN + 2, summaryTop + 4.5);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  let yBank = summaryTop + bankAfterTitle;
  const drawBankField = (label, value) => {
    const vLines = doc.splitTextToSize(String(value), bankValueW);
    doc.text(label, bankLabelX, yBank);
    doc.text(vLines, bankValueX, yBank);
    yBank += vLines.length * LH(FONT.body) + 1.2;
  };
  drawBankField("A/c Holder's Name", BANK.accountHolder);
  drawBankField('Bank Name', BANK.bankName);
  drawBankField('A/c No.', BANK.accountNo);
  drawBankField('Branch & IFSC Code', BANK.ifsc);
  yBank += branchGap;
  drawBankField('Bank Branch', BANK.branchAddress);

  y = summaryTop + summaryH + BOX_GAP;

  // Terms and signature row
  ensureSpace(28);
  const termsTop = y;
  let termsH = 19;
  doc.setFillColor(250, 250, 251);
  doc.rect(MARGIN, termsTop, contentW, termsH, 'F');
  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, termsTop, contentW, termsH, 'S');
  doc.line(midX, termsTop, midX, termsTop + termsH);
  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text('TERMS & CONDITIONS', MARGIN + 2, termsTop + 4.5);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  const termsLines = resolveTermsLines(inv);
  const maxTermsLines = isEInvoicePdf ? 2 : 4;
  const termsLineStep = LH(FONT.body) * 1.5;
  /** Modest gaps (previous lh-based values read as huge on screen/PDF) */
  const gapBelowTermsHeading = termsLineStep * 0.2;
  const gapBetweenTermsItems = termsLineStep * 0.1;
  const termsTextMaxW = colW - 4;
  const drawTermsItemBlock = (idx, text, yStart) => {
    doc.setFontSize(FONT.body);
    doc.setFont(undefined, 'normal');
    const prefix = `${idx + 1}. `;
    const prefixW = doc.getTextWidth(prefix);
    const bodyMaxW = Math.max(12, termsTextMaxW - prefixW);
    const bodyLines = doc.splitTextToSize(String(text ?? '').trim(), bodyMaxW);
    let y = yStart;
    if (bodyLines.length === 0) {
      doc.text(prefix.trim(), MARGIN + 2, y, { lineHeightFactor: 1.5 });
      return y + termsLineStep;
    }
    doc.text(prefix + bodyLines[0], MARGIN + 2, y, { lineHeightFactor: 1.5 });
    y += termsLineStep;
    for (let j = 1; j < bodyLines.length; j++) {
      doc.text(bodyLines[j], MARGIN + 2 + prefixW, y, { lineHeightFactor: 1.5 });
      y += termsLineStep;
    }
    return y;
  };
  let tY = termsTop + 4.5 + LH(FONT.section) + gapBelowTermsHeading;
  termsLines.slice(0, maxTermsLines).forEach((t, i) => {
    tY = drawTermsItemBlock(i, t, tY);
    if (i < maxTermsLines - 1) tY += gapBetweenTermsItems;
  });

  // Signature block anchored from top of box (gap below “For …” before rule — room for wet ink signature)
  const signForY = termsTop + 4.9;
  const signLineY = signForY + 12;
  const signAuthY = signLineY + 3.5;
  const signatureBlockBottom = signAuthY + 2;
  doc.setFontSize(9.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text(`For ${COMPANY_DISPLAY_NAME}`, pageW - MARGIN - 2, signForY, { align: 'right' });
  doc.setDrawColor(130, 130, 130);
  doc.line(pageW - MARGIN - 46, signLineY, pageW - MARGIN - 2, signLineY);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Authorised Signatory', pageW - MARGIN - 2, signAuthY, { align: 'right' });
  const termsContentBottom = Math.max(tY + 0.8, signatureBlockBottom);
  if (termsContentBottom > termsTop + termsH) {
    termsH = termsContentBottom - termsTop;
    doc.setFillColor(250, 250, 251);
    doc.rect(MARGIN, termsTop, contentW, termsH, 'F');
    doc.setDrawColor(187, 187, 187);
    doc.rect(MARGIN, termsTop, contentW, termsH, 'S');
    doc.line(midX, termsTop, midX, termsTop + termsH);
    doc.setFontSize(FONT.section);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 47, 102);
    doc.text('TERMS & CONDITIONS', MARGIN + 2, termsTop + 4.5);
    doc.setFontSize(FONT.body);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    let redrawTY = termsTop + 4.5 + LH(FONT.section) + gapBelowTermsHeading;
    termsLines.slice(0, maxTermsLines).forEach((t, i) => {
      redrawTY = drawTermsItemBlock(i, t, redrawTY);
      if (i < maxTermsLines - 1) redrawTY += gapBetweenTermsItems;
    });
    const signForY2 = termsTop + 4.9;
    const signLineY2 = signForY2 + 12;
    const signAuthY2 = signLineY2 + 3.5;
    doc.setFontSize(9.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 47, 102);
    doc.text(`For ${COMPANY_DISPLAY_NAME}`, pageW - MARGIN - 2, signForY2, { align: 'right' });
    doc.setDrawColor(130, 130, 130);
    doc.line(pageW - MARGIN - 46, signLineY2, pageW - MARGIN - 2, signLineY2);
    doc.setFontSize(FONT.body);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Authorised Signatory', pageW - MARGIN - 2, signAuthY2, { align: 'right' });
  }

  y = termsTop + termsH + 1;

  // Digital signature (optional) — right column under terms area
  const sig = inv.digitalSignatureDataUrl || inv.digital_signature_data_url;
  if (typeof sig === 'string' && sig.startsWith('data:image/')) {
    try {
      const sigType = sig.startsWith('data:image/jpeg') || sig.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
      const sigW = 42;
      const sigH = 16;
      const sigX = pageW - MARGIN - sigW;
      const sigY = termsTop + termsH - sigH - 3;
      doc.addImage(sig, sigType, sigX, sigY, sigW, sigH);
      doc.setFontSize(FONT.small);
      doc.text('Digital Signature', sigX + sigW / 2, sigY + sigH + 4, { align: 'center' });
    } catch {
      /* ignore bad image */
    }
  }

  // Footer bar fixed at bottom: contacts left, jurisdiction right.
  const footerY = pageH - footerStripH;
  doc.setFillColor(18, 61, 124);
  doc.rect(0, footerY, pageW, footerStripH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.4);
  doc.setFont(undefined, 'normal');
  const leftFooterText = `Phone: ${FOOTER_PHONE} | Email: ${FOOTER_EMAIL} | Website: ${FOOTER_WEB}`;
  const rightFooterText = 'Subject to Vadodara Jurisdiction';
  const footerGap = 3;
  let footerFs = 6.4;
  const fitsFooter = () => {
    doc.setFontSize(footerFs);
    const leftW = doc.getTextWidth(leftFooterText);
    const rightW = doc.getTextWidth(rightFooterText);
    return MARGIN + leftW + footerGap <= pageW - MARGIN - rightW;
  };
  while (footerFs > 5.2 && !fitsFooter()) footerFs -= 0.2;
  doc.setFontSize(footerFs);
  doc.text(leftFooterText, MARGIN, footerY + 4.8);
  doc.text(rightFooterText, pageW - MARGIN, footerY + 4.8, { align: 'right' });

  const invoiceNumberForFile = String(inv.taxInvoiceNumber || inv.bill_number || 'Invoice')
    .trim()
    .replace(/\s+/g, '-');
  const fileName = isEInvoicePdf
    ? `E-INVOICE-${invoiceNumberForFile}.pdf`
    : `${invoiceKind === 'proforma' ? 'Proforma' : invoiceKind === 'draft' ? 'Draft' : 'Tax'}_Invoice_${invoiceNumberForFile}.pdf`;
  return { doc, fileName };
}

/**
 * Credit / Debit note PDF — full tax-invoice layout when invoice_snapshot exists; else simple legacy layout.
 */
export async function downloadCreditDebitNotePdf(note, parentInvoice, options = {}) {
  const snap = note.invoiceSnapshot || note.invoice_snapshot;
  if (snap && typeof snap === 'object') {
    const logoDataUrl = await fetchCompanyLogoDataUrlForPdf();
    const inv = {
      ...snap,
      digitalSignatureDataUrl:
        snap.digitalSignatureDataUrl ||
        snap.digital_signature_data_url ||
        options.digitalSignatureDataUrl ||
        parentInvoice?.digitalSignatureDataUrl ||
        parentInvoice?.digital_signature_data_url,
    };
    const built = buildTaxInvoiceDoc(inv, { ...options, logoDataUrl });
    if (built?.doc) {
      const num = inv.taxInvoiceNumber || inv.bill_number || note.noteTaxInvoiceNumber || note.id;
      const kind = note.type === 'debit' ? 'Debit' : 'Credit';
      built.doc.save(`${kind}_Note_${String(num).replace(/\s/g, '_')}.pdf`);
    }
    return;
  }
  const logoDataUrl = await fetchCompanyLogoDataUrlForPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = M;
  if (logoDataUrl && typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
    try {
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoDataUrl, fmt, M, y, 18, 12, undefined, 'FAST');
      y += 14;
    } catch {
      /* continue without logo */
    }
  }
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  const title = note.type === 'debit' ? 'DEBIT NOTE' : 'CREDIT NOTE';
  doc.text(title, pageW / 2, y, { align: 'center' });
  y += 10;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Parent Tax Invoice: ${note.parentTaxInvoiceNumber || parentInvoice?.taxInvoiceNumber || '–'}`, M, y);
  y += 6;
  doc.text(`Date: ${formatPdfDate(note.created_at)}`, M, y);
  y += 8;
  doc.text(`Amount: ${PDF_RS} ${formatMoney2(note.amount)}`, M, y);
  y += 6;
  const reasonLines = doc.splitTextToSize(`Reason: ${note.reason || '–'}`, pageW - 2 * M);
  doc.text(reasonLines, M, y);
  y += reasonLines.length * 5 + 10;
  const sig = options.digitalSignatureDataUrl || note.digitalSignatureDataUrl;
  if (typeof sig === 'string' && sig.startsWith('data:image/')) {
    try {
      const sigType = sig.startsWith('data:image/jpeg') || sig.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(sig, sigType, pageW - M - 45, y, 40, 16);
      doc.setFontSize(8);
      doc.text('Digital Signature', pageW - M - 25, y + 20, { align: 'center' });
    } catch {
      /* ignore */
    }
  }
  doc.save(`${title.replace(/\s/g, '_')}_${note.id}.pdf`);
}

export async function getTaxInvoicePdfBlobUrl(inv, options = {}) {
  const logoDataUrl = await fetchCompanyLogoDataUrlForPdf();
  const built = buildTaxInvoiceDoc(inv, { ...options, logoDataUrl });
  if (!built?.doc) return null;
  const blob = built.doc.output('blob');
  return URL.createObjectURL(blob);
}

export async function downloadTaxInvoicePdf(inv, options = {}) {
  const logoDataUrl = await fetchCompanyLogoDataUrlForPdf();
  const built = buildTaxInvoiceDoc(inv, { ...options, logoDataUrl });
  if (!built?.doc) return;
  built.doc.save(built.fileName);
}

/** Shared with UI preview (Manage Invoices / Create Invoice) — matches PDF copy */
export {
  SELLER,
  BANK,
  TERMS,
  JURISDICTION,
  FOOTER_ADDRESS,
  FOOTER_PHONE,
  FOOTER_EMAIL,
  FOOTER_WEB,
  formatPdfDate,
  amountInWords,
};
