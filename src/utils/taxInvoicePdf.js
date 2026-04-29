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

const SELLER_GSTIN = '24AADCJ2182H1ZS';

// Seller (company issuing invoice) — single source for CIN / PAN / MSME on all invoice PDFs & HTML preview
const SELLER = {
  name: 'M/s Indus Fire Safety Private Limited',
  address: 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara',
  state: 'Gujarat',
  stateCode: '24',
  gstin: SELLER_GSTIN,
  /** Companies Act CIN — set here once; optional per-invoice DB fields still override if present. */
  cin: '',
  pan: panEmbeddedInGstin(SELLER_GSTIN),
  /** MSME Udyam no. — set here once; optional per-invoice DB fields still override if present. */
  msmeUdyamNo: '',
};

export const DEFAULT_MSME_CLAUSE =
  'As per MSME Act, payment to be made within 45 days; delayed payments attract 18% p.a. interest.';

const BANK = {
  accountHolder: 'Indus Fire Safety Private Limited',
  bankName: 'State Bank of India',
  accountNo: 'XXXXXXXXXXXX',
  branchAndIfsc: 'Vadodara Branch & SBIN000XXXX',
};

const TERMS = [
  'Goods once sold will not be taken back.',
  'We cannot accept any responsibility for breakage, damage or loss in transit when the goods are dispatched.',
  'Full payment must be made by A/c Payee cheque, NEFT / RTGS.',
  'Interest at 24% per annum will be charged on bills not paid within the due date.',
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
const FONT = {
  title: 13,
  section: 9,
  body: 8,
  small: 7,
  tableHead: 7.5,
  tableBody: 8,
};
const LH = (fs) => Math.max(3.8, fs * 0.45);

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
  const gstMode = normalizeGstSupplyType(inv.gstSupplyType ?? inv.gst_supply_type);
  let taxableValue = Number(inv.taxableValue);
  let cgstRate = Number(inv.cgstRate) || 9;
  let sgstRate = Number(inv.sgstRate) || 9;
  let igstRate = Number(inv.igstRate) || 0;
  let cgstAmt = Number(inv.cgstAmt);
  let sgstAmt = Number(inv.sgstAmt);
  let igstAmt = Number(inv.igstAmt);
  const sumItems = round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));

  if (!Number.isFinite(taxableValue) || taxableValue === 0) {
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
    if (!Number.isFinite(igstAmt) || igstAmt === 0) {
      igstAmt = round2((taxableValue * igstRate) / 100);
    }
  } else {
    const hasPositiveStored =
      (Number.isFinite(cgstAmt) && cgstAmt > 0) || (Number.isFinite(sgstAmt) && sgstAmt > 0);
    if (taxableValue > 0 && !hasPositiveStored) {
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

  const buyerName = inv.clientLegalName || inv.client_name || '–';
  const buyerAddress = inv.clientAddress || inv.billingAddress || '–';
  const shipToRaw = inv.clientShippingAddress || inv.client_shipping_address;
  const shipAddress =
    shipToRaw && String(shipToRaw).trim() ? String(shipToRaw).trim() : buyerAddress;
  const buyerGstin = inv.gstin || '–';
  const invoiceNo = inv.taxInvoiceNumber || inv.bill_number || '–';
  const invoiceDate = formatPdfDate(inv.invoiceDate || inv.created_at);
  const paymentTerms = inv.paymentTerms || '30 Days';
  const buyerOrderNo = inv.poWoNumber || inv.ocNumber || '–';
  const placeOfSupply = inv.placeOfSupply || inv.place_of_supply || 'Gujarat';
  const irn = inv.e_invoice_irn || inv.eInvoiceIrn;
  const ackNo = inv.e_invoice_ack_no || inv.eInvoiceAckNo;
  const ackDt = inv.e_invoice_ack_dt || inv.eInvoiceAckDt;
  const qrData = inv.e_invoice_signed_qr || inv.eInvoiceSignedQr;

  const buyerNameLine = 'M/s ' + (buyerName.startsWith('M/s') ? buyerName.slice(3).trim() : buyerName);

  // ----- Top company header (logo + company details + QR)
  const isEInvoicePdf = includeEinvoiceHeader && irn;
  const headerTopY = 4;
  const logoBox = { x: MARGIN, y: headerTopY + 2, w: 15, h: 15 };
  const qrBoxW = 18;
  const qrBoxH = 18;
  const qrBoxX = pageW - MARGIN - qrBoxW;
  const qrBoxY = headerTopY + 1.5;
  const companyTextX = logoBox.x + logoBox.w + 3;
  const companyTextW = qrBoxX - companyTextX - 3;
  let logoPlaced = false;
  if (logoDataUrl && typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
    try {
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoDataUrl, fmt, logoBox.x, logoBox.y, logoBox.w, logoBox.h, undefined, 'FAST');
      logoPlaced = true;
    } catch {
      /* fallback below */
    }
  }
  if (!logoPlaced) {
    doc.setFillColor(255, 255, 255);
    doc.rect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 'F');
    doc.setTextColor(20, 56, 110);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('INDUS', logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2 + 1.5, { align: 'center' });
  }

  doc.setTextColor(20, 56, 110);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(SELLER.name.toUpperCase(), companyTextX, headerTopY + 6);
  doc.setFontSize(FONT.small);
  doc.setFont(undefined, 'normal');
  doc.text('SECTION 31 OF GST ACT - 2017', companyTextX, headerTopY + 10);
  const sellerAddrHeaderLines = doc.splitTextToSize(SELLER.address, companyTextW);
  doc.text(sellerAddrHeaderLines, companyTextX, headerTopY + 13);
  const gstLineY = headerTopY + 13 + sellerAddrHeaderLines.length * LH(FONT.small) + 0.8;
  doc.text(
    `GSTIN/UIN: ${SELLER.gstin}  |  State: ${SELLER.state}, Code: ${SELLER.stateCode}  |  PAN: ${SELLER.pan || '–'}`,
    companyTextX,
    gstLineY
  );

  doc.setDrawColor(150, 150, 150);
  doc.rect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 'S');
  doc.setFontSize(6);
  doc.setTextColor(90, 90, 90);
  doc.text('Scan QR', qrBoxX + qrBoxW / 2, qrBoxY - 0.6, { align: 'center' });
  if (isEInvoicePdf && typeof qrData === 'string' && qrData.length > 0 && (qrData.startsWith('data:image/') || qrData.startsWith('data:application/'))) {
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

  doc.setTextColor(0, 0, 0);
  y = Math.max(gstLineY + 3, qrBoxY + qrBoxH + 3);

  doc.setDrawColor(20, 56, 110);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 5;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(20, 56, 110);
  doc.text('GST INVOICE    (ORIGINAL FOR RECIPIENT)', pageW / 2, y, { align: 'center' });
  doc.text(isEInvoicePdf ? 'e-Invoice' : '', pageW - MARGIN - 36, y);
  y += 2.5;
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 4;
  doc.setLineWidth(0.2);
  doc.setTextColor(0, 0, 0);

  if (isEInvoicePdf) {
    doc.setFillColor(240, 244, 250);
    const irnLabel = 'IRN No:';
    const irnLabelW = 16;
    const irnTextW = contentW - 5 - irnLabelW;
    doc.setFontSize(FONT.small);
    const irnLines = doc.splitTextToSize(String(irn || '–'), irnTextW);
    const infoRowH = Math.max(11, 4 + irnLines.length * LH(FONT.small) + 4.5);
    doc.rect(MARGIN, y - 2.8, contentW, infoRowH, 'F');
    let infoY = y + 0.1;
    const eInvLabelW = 15;
    const leftBlockW = contentW - 2;
    const eInvValueW = Math.max(30, leftBlockW / 2 - eInvLabelW - 2);
    doc.setFontSize(FONT.small);
    doc.setFont(undefined, 'bold');
    doc.text(irnLabel, MARGIN + 1.5, infoY);
    doc.setFont(undefined, 'normal');
    doc.text(irnLines, MARGIN + 1.5 + irnLabelW, infoY);
    infoY += irnLines.length * LH(FONT.small) + 0.8;

    const drawEInvField = (label, value, x, width) => {
      doc.setFont(undefined, 'bold');
      doc.text(`${label}:`, x, infoY);
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(String(value || '–'), width - eInvLabelW);
      doc.text(lines, x + eInvLabelW, infoY);
    };
    const colW = leftBlockW / 2;
    const x1 = MARGIN + 1.5;
    const x2 = MARGIN + 1.5 + colW;
    drawEInvField('Ack No', ackNo || '–', x1, colW);
    drawEInvField('Ack Date', ackDt ? formatPdfDate(ackDt) : '–', x2, colW);
    y += infoRowH - 1.8;
  } else {
    y += 1;
  }

  // ----- Invoice details block (two columns centered)
  const blockTop = y;
  doc.setDrawColor(145, 145, 145);
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, blockTop, contentW, 24, 'FD');

  let yL = blockTop + 4;
  let yR = blockTop + 4;
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');

  const cin = inv.sellerCin || inv.seller_cin || SELLER.cin;
  const pan = inv.sellerPan || inv.seller_pan || SELLER.pan;
  const msmeNo = inv.msmeRegistrationNo || inv.msme_registration_no || SELLER.msmeUdyamNo;
  const msmeClause = inv.msmeClause || inv.msme_clause || DEFAULT_MSME_CLAUSE;
  const msmeText = `MSME Udyam: ${msmeNo ? `${msmeNo} ` : ' '}${msmeClause ? msmeClause : ''}`;

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
  const meta = [
    ['Invoice No.', invoiceNo],
    ['Billing Month', billMonth],
    ['Billing Duration', billingDur],
    ['Invoice Date', invoiceDate],
    ['Mode/Terms of Payment', paymentTerms],
    ["Buyer's Order No.", buyerOrderNo],
    ...(origTaxNo && (invoiceKind === 'credit_note' || invoiceKind === 'debit_note')
      ? [['Original Tax Invoice No.', String(origTaxNo)]]
      : []),
  ];
  const leftMeta = meta.slice(0, 3);
  const rightMeta = meta.slice(3);
  const labelW = 33;
  const colPad = 2;
  const leftX = MARGIN + colPad;
  const rightX = midX + colPad;
  const drawMeta = (x, rows, yStart) => {
    let curY = yStart;
    rows.forEach(([label, val]) => {
      doc.setFont(undefined, 'bold');
      doc.text(label + ':', x, curY);
      doc.setFont(undefined, 'normal');
      const vLines = doc.splitTextToSize(String(val), colW - labelW - 6);
      doc.text(vLines, x + labelW, curY);
      curY += Math.max(LH(FONT.body), vLines.length * LH(FONT.body)) + 0.6;
    });
    return curY;
  };
  yL = drawMeta(leftX, leftMeta, yL);
  yR = drawMeta(rightX, rightMeta, yR);
  const cinPanY = Math.max(yL, yR) + 0.6;
  doc.setFont(undefined, 'normal');
  doc.text(
    `CIN: ${cin && cin !== '—' ? cin : '–'}   |   PAN: ${pan && pan !== '—' ? pan : '–'}`,
    MARGIN + 2,
    cinPanY
  );

  y = Math.max(cinPanY, blockTop + 21.5) + 3;

  if (msmeText) {
    doc.setDrawColor(140, 140, 140);
    const msmeLines = doc.splitTextToSize(msmeText, contentW - 6);
    const msmeBoxH = Math.max(msmeLines.length * LH(FONT.body) + 6, 10);
    doc.rect(MARGIN, y, contentW, msmeBoxH, 'S');
    doc.setFontSize(FONT.body);
    doc.setFont(undefined, 'bold');
    doc.text(msmeLines, pageW / 2, y + 4.5, { align: 'center' });
    y += msmeBoxH + 4;
  }

  // ----- Buyer (Bill to) left | Consignee (Ship to) right
  const partyTop = y;
  const partyInnerTop = partyTop + 9.2;
  const partyColXLeft = MARGIN + 2;
  const partyColXRight = midX + 2;
  const partyColTextW = colW - 5;
  const buyerAddressLines = doc.splitTextToSize(buyerAddress, partyColTextW);
  const shipAddressLines = doc.splitTextToSize(shipAddress, partyColTextW);
  const billHeight =
    LH(FONT.body) + // name
    buyerAddressLines.length * LH(FONT.body) +
    LH(FONT.body) + // gstin
    LH(FONT.body) + // state
    LH(FONT.body); // place of supply
  const shipHeight =
    LH(FONT.body) + // name
    shipAddressLines.length * LH(FONT.body) +
    LH(FONT.body) + // gstin
    LH(FONT.body); // state
  const partyContentHeight = Math.max(billHeight, shipHeight);
  const partyBottom = partyInnerTop + partyContentHeight + 2.2;
  const partyBoxH = Math.max(27, partyBottom - partyTop);

  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, partyTop, contentW, partyBoxH, 'S');
  doc.line(midX - GAP_COL / 2, partyTop, midX - GAP_COL / 2, partyTop + partyBoxH);
  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(26, 58, 108);
  doc.text('Buyer (Bill to)', partyColXLeft, partyTop + 4.5);
  doc.text('Consignee (Ship to)', partyColXRight, partyTop + 4.5);
  doc.setDrawColor(210, 210, 210);
  doc.line(MARGIN + 2, partyTop + 6, midX - GAP_COL / 2 - 2, partyTop + 6);
  doc.line(midX + 2, partyTop + 6, MARGIN + contentW - 2, partyTop + 6);
  y = partyInnerTop;

  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(FONT.body);
  let yBill = y;
  let yShip = y;

  doc.text(buyerNameLine, partyColXLeft, yBill);
  yBill += LH(FONT.body);
  doc.text(buyerAddressLines, partyColXLeft, yBill);
  yBill += buyerAddressLines.length * LH(FONT.body);
  doc.text('GSTIN/UIN: ' + buyerGstin, partyColXLeft, yBill);
  yBill += LH(FONT.body);
  doc.text(`State Name: ${SELLER.state}, Code: ${SELLER.stateCode}`, partyColXLeft, yBill);
  yBill += LH(FONT.body);
  doc.text('Place of Supply: ' + placeOfSupply, partyColXLeft, yBill);
  yBill += LH(FONT.body);

  doc.text(buyerNameLine, partyColXRight, yShip);
  yShip += LH(FONT.body);
  doc.text(shipAddressLines, partyColXRight, yShip);
  yShip += shipAddressLines.length * LH(FONT.body);
  doc.text('GSTIN/UIN: ' + buyerGstin, partyColXRight, yShip);
  yShip += LH(FONT.body);
  doc.text(`State Name: ${SELLER.state}, Code: ${SELLER.stateCode}`, partyColXRight, yShip);
  yShip += LH(FONT.body);

  y = partyTop + partyBoxH + 3;

  const hdrRemarks = inv.invoiceHeaderRemarks || inv.invoice_header_remarks;
  const remarksText = hdrRemarks && String(hdrRemarks).trim() ? String(hdrRemarks).trim() : '–';
  doc.setDrawColor(160, 160, 160);
  doc.setFillColor(252, 252, 253);
  const hdrLines = doc.splitTextToSize(remarksText, contentW - 4);
  const boxH = Math.max(hdrLines.length * LH(FONT.body) + 8, 14);
  doc.rect(MARGIN, y, contentW, boxH, 'FD');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(FONT.small);
  doc.setTextColor(60, 60, 60);
  doc.text('Description / Remarks', MARGIN + 2, y + 4);
  doc.setFont(undefined, 'normal');
  doc.text(hdrLines, MARGIN + 2, y + 8);
  doc.setTextColor(0, 0, 0);
  y += boxH + 4;

  // ----- Item table (widths sum to contentW)
  const tableHeaders = [
    'Sl.\nNo.',
    'Description of Goods',
    'HSN/\nSAC',
    'Qty',
    `Rate\n(${PDF_RS})`,
    'UOM',
    'Disc.\n%',
    `Amount\n(${PDF_RS})`,
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
    'NO',
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
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 64, halign: 'left', overflow: 'linebreak' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 25, halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 5;

  // Totals under table
  const totalQty = rowItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'bold');
  doc.text('Total Quantity: ' + formatInrPdf(totalQty) + ' NO', MARGIN, y);
  const totalLine = `Invoice Total: ${PDF_RS} ` + formatInvoiceTotalDisplay(totalAmount);
  doc.text(totalLine, MARGIN + contentW, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  y += LH(FONT.body) + 2.5;

  doc.setFont(undefined, 'bold');
  doc.text('Amount Chargeable (in words)', MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += LH(FONT.body);
  const amtWordsLines = doc.splitTextToSize(amountInWords(totalAmount), contentW);
  doc.text(amtWordsLines, MARGIN, y);
  y += amtWordsLines.length * LH(FONT.body) + 3;

  // ----- Bank details + invoice summary block
  const summaryTop = y;
  const summaryH = 24;
  const summarySplitX = MARGIN + contentW * 0.7;
  doc.setFillColor(249, 250, 252);
  doc.rect(MARGIN, summaryTop, contentW, summaryH, 'F');
  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, summaryTop, contentW, summaryH, 'S');
  doc.line(summarySplitX, summaryTop, summarySplitX, summaryTop + summaryH);

  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text('BANK DETAILS', MARGIN + 2, summaryTop + 4.5);
  doc.text('INVOICE SUMMARY', summarySplitX + 2, summaryTop + 4.5);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  let yBank = summaryTop + 8.5;
  doc.text("A/c Holder's Name", MARGIN + 2, yBank);
  doc.text(BANK.accountHolder, summarySplitX - 2, yBank, { align: 'right' });
  yBank += 4.5;
  doc.text('Bank Name', MARGIN + 2, yBank);
  doc.text(BANK.bankName, summarySplitX - 2, yBank, { align: 'right' });
  yBank += 4.5;
  doc.text('A/c No.', MARGIN + 2, yBank);
  doc.text(BANK.accountNo, summarySplitX - 2, yBank, { align: 'right' });
  yBank += 4.5;
  doc.text('Branch & IFS Code', MARGIN + 2, yBank);
  doc.text(BANK.branchAndIfsc, summarySplitX - 2, yBank, { align: 'right' });

  const subtotal = round2(taxableValue);
  let ySum = summaryTop + 9;
  doc.text('Subtotal', summarySplitX + 2, ySum);
  doc.text(formatMoney2(subtotal), MARGIN + contentW - 2, ySum, { align: 'right' });
  ySum += 4.5;
  if (cgstAmt > 0) {
    doc.text(`CGST @ ${cgstRate}%`, summarySplitX + 2, ySum);
    doc.text(formatMoney2(cgstAmt), MARGIN + contentW - 2, ySum, { align: 'right' });
    ySum += 4.5;
  }
  if (sgstAmt > 0) {
    doc.text(`SGST @ ${sgstRate}%`, summarySplitX + 2, ySum);
    doc.text(formatMoney2(sgstAmt), MARGIN + contentW - 2, ySum, { align: 'right' });
    ySum += 4.5;
  }
  if (igstAmt > 0) {
    doc.text(`IGST @ ${igstRate}%`, summarySplitX + 2, ySum);
    doc.text(formatMoney2(igstAmt), MARGIN + contentW - 2, ySum, { align: 'right' });
  }

  const totalBarY = summaryTop + summaryH - 8.5;
  doc.setFillColor(18, 61, 124);
  doc.rect(summarySplitX + 2, totalBarY, MARGIN + contentW - (summarySplitX + 4), 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text('INVOICE TOTAL', summarySplitX + 4, totalBarY + 4.7);
  doc.text(`${PDF_RS} ${formatInvoiceTotalDisplay(totalAmount)}`, MARGIN + contentW - 3.5, totalBarY + 4.7, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  y = summaryTop + summaryH + 2.5;

  // Amount in words row
  const amtLines = doc.splitTextToSize(amountInWords(totalAmount), contentW - 4);
  const amtRowH = Math.max(amtLines.length * LH(FONT.body) + 5.5, 8.5);
  doc.setFillColor(248, 249, 251);
  doc.rect(MARGIN, y, contentW, amtRowH, 'F');
  doc.setDrawColor(187, 187, 187);
  doc.rect(MARGIN, y, contentW, amtRowH, 'S');
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text('AMOUNT CHARGEABLE (IN WORDS)', MARGIN + 2, y + 4);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(amtLines, MARGIN + 2, y + 7.2);
  y += amtRowH + 2.5;

  // Terms and signature row
  const termsTop = y;
  let termsH = 22;
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
  let tY = termsTop + 8.5;
  termsLines.slice(0, 4).forEach((t, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${t}`, colW - 4);
    doc.text(wrapped, MARGIN + 2, tY);
    tY += wrapped.length * LH(FONT.body);
  });

  doc.setFontSize(FONT.small);
  doc.text('for M/s Indus Fire Safety Private Limited', pageW - MARGIN - 2, termsTop + 4.5, { align: 'right' });
  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 47, 102);
  doc.text('M/S INDUS FIRE SAFETY PRIVATE LIMITED', pageW - MARGIN - 2, termsTop + 9.5, { align: 'right' });
  doc.setDrawColor(130, 130, 130);
  doc.line(pageW - MARGIN - 46, termsTop + 16, pageW - MARGIN - 2, termsTop + 16);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Authorised Signatory', pageW - MARGIN - 2, termsTop + 19.2, { align: 'right' });
  doc.text("Customer's Seal and Signature", pageW - MARGIN - 2, termsTop + 24, { align: 'right' });
  const termsContentBottom = Math.max(tY + 1, termsTop + 25.5);
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
    let redrawTY = termsTop + 8.5;
    termsLines.slice(0, 4).forEach((t, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${t}`, colW - 4);
      doc.text(wrapped, MARGIN + 2, redrawTY);
      redrawTY += wrapped.length * LH(FONT.body);
    });
    doc.setFontSize(FONT.small);
    doc.text('for M/s Indus Fire Safety Private Limited', pageW - MARGIN - 2, termsTop + 4.5, { align: 'right' });
    doc.setFontSize(FONT.section);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 47, 102);
    doc.text('M/S INDUS FIRE SAFETY PRIVATE LIMITED', pageW - MARGIN - 2, termsTop + 9.5, { align: 'right' });
    doc.setDrawColor(130, 130, 130);
    doc.line(pageW - MARGIN - 46, termsTop + 16, pageW - MARGIN - 2, termsTop + 16);
    doc.setFontSize(FONT.body);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Authorised Signatory', pageW - MARGIN - 2, termsTop + 19.2, { align: 'right' });
    doc.text("Customer's Seal and Signature", pageW - MARGIN - 2, termsTop + 24, { align: 'right' });
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
  const footerStripH = 8;
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

  const filePrefix = invoiceKind === 'proforma' ? 'Proforma' : invoiceKind === 'draft' ? 'Draft' : 'Tax';
  const fileName = `${filePrefix}_Invoice_${(inv.taxInvoiceNumber || inv.bill_number || 'Invoice').replace(/\s/g, '_')}.pdf`;
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
