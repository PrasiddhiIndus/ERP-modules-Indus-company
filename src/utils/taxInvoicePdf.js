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
  'Registered under MSME (Udyam). MSME benefits and clauses as notified by the Government from time to time shall apply where applicable.';

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
  const vert = inv.termsTemplateKey || inv.poVertical || 'BILL';
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
  const buyerOrderDate = inv.poWoDate ? formatPdfDate(inv.poWoDate) : invoiceDate;
  const placeOfSupply = inv.placeOfSupply || inv.place_of_supply || 'Gujarat';
  const irn = inv.e_invoice_irn || inv.eInvoiceIrn;
  const ackNo = inv.e_invoice_ack_no || inv.eInvoiceAckNo;
  const ackDt = inv.e_invoice_ack_dt || inv.eInvoiceAckDt;
  const qrData = inv.e_invoice_signed_qr || inv.eInvoiceSignedQr;

  const buyerNameLine = 'M/s ' + (buyerName.startsWith('M/s') ? buyerName.slice(3).trim() : buyerName);

  // ----- Top header strip + company logo (/public/indus-logo.png via options.logoDataUrl)
  const headerStripH = 22;
  const logoBox = { x: MARGIN, y: 4, w: 20, h: 14 };
  doc.setFillColor(22, 58, 112);
  doc.rect(0, 0, pageW, headerStripH, 'F');
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
    doc.setTextColor(22, 58, 112);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('INDUS', logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2 + 1.5, { align: 'center' });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(FONT.title);
  doc.text(SELLER.name.toUpperCase(), MARGIN + 24, 11);
  doc.setFontSize(FONT.small);
  doc.setFont(undefined, 'normal');
  doc.text('SECTION 31 OF GST ACT - 2017', MARGIN + 24, 17);
  doc.setTextColor(0, 0, 0);
  y = headerStripH + 5;

  const isEInvoicePdf = includeEinvoiceHeader && irn;
  const qrSize = 26;
  const qrX = pageW - MARGIN - qrSize;
  const leftBlockW = isEInvoicePdf ? pageW - 2 * MARGIN - qrSize - 6 : contentW;

  if (isEInvoicePdf) {
    const titleTop = y;
    doc.setFontSize(FONT.title);
    doc.setFont(undefined, 'bold');
    doc.text('GST INVOICE', MARGIN, titleTop);
    doc.setFontSize(FONT.small);
    doc.setFont(undefined, 'normal');
    doc.text('(ORIGINAL FOR RECIPIENT)', MARGIN, titleTop + LH(FONT.small));

    doc.setFontSize(8);
    doc.text('e-Invoice', pageW - MARGIN, titleTop - 0.5, { align: 'right' });
    const qrY = titleTop + 3;
    if (typeof qrData === 'string' && qrData.length > 0 && (qrData.startsWith('data:image/') || qrData.startsWith('data:application/'))) {
      try {
        const type = qrData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(qrData, type, qrX, qrY, qrSize, qrSize);
      } catch {
        doc.setDrawColor(180, 180, 180);
        doc.rect(qrX, qrY, qrSize, qrSize);
        doc.setFontSize(7);
        doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 1, { align: 'center' });
      }
    } else {
      doc.setDrawColor(180, 180, 180);
      doc.rect(qrX, qrY, qrSize, qrSize);
      doc.setFontSize(7);
      doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 1, { align: 'center' });
    }

    let infoY = titleTop + LH(FONT.title) + 2;
    doc.setFontSize(FONT.small);
    doc.setFont(undefined, 'normal');
    const irnLines = doc.splitTextToSize('IRN: ' + irn, leftBlockW);
    doc.text(irnLines, MARGIN, infoY);
    infoY += irnLines.length * LH(FONT.small) + 1;
    if (ackNo) {
      doc.text('Ack No.: ' + ackNo, MARGIN, infoY);
      infoY += LH(FONT.small) + 1;
    }
    if (ackDt) {
      doc.text('Ack Date: ' + formatPdfDate(ackDt), MARGIN, infoY);
      infoY += LH(FONT.small) + 1;
    }
    y = Math.max(infoY + 3, qrY + qrSize + 4);
  } else {
    doc.setFontSize(FONT.title);
    doc.setFont(undefined, 'bold');
    doc.text(docTitleForKind(invoiceKind), pageW / 2, y + 2, { align: 'center' });
    doc.setFontSize(FONT.small);
    doc.setFont(undefined, 'normal');
    doc.text('(ORIGINAL FOR RECIPIENT)', pageW - MARGIN, y, { align: 'right' });
    y += 12;
  }

  // ----- Seller (left) | Invoice meta (right)
  const blockTop = y;
  let yL = blockTop;
  let yR = blockTop;

  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.text(SELLER.name, MARGIN, yL);
  yL += LH(FONT.section) + 0.5;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(FONT.body);
  const sellerAddrLines = doc.splitTextToSize(SELLER.address, colW - 2);
  doc.text(sellerAddrLines, MARGIN, yL);
  yL += sellerAddrLines.length * LH(FONT.body);
  doc.text('GSTIN/UIN: ' + SELLER.gstin, MARGIN, yL);
  yL += LH(FONT.body);
  doc.text(`State Name: ${SELLER.state}, Code: ${SELLER.stateCode}`, MARGIN, yL);
  yL += LH(FONT.body);
  const cin = inv.sellerCin || inv.seller_cin || SELLER.cin;
  const pan = inv.sellerPan || inv.seller_pan || SELLER.pan;
  doc.text('CIN: ' + (cin && cin !== '—' ? cin : '–'), MARGIN, yL);
  yL += LH(FONT.body);
  doc.text('PAN: ' + (pan && pan !== '—' ? pan : '–'), MARGIN, yL);
  yL += LH(FONT.body);
  const msmeNo = inv.msmeRegistrationNo || inv.msme_registration_no || SELLER.msmeUdyamNo;
  const msmeClause = inv.msmeClause || inv.msme_clause || (msmeNo ? DEFAULT_MSME_CLAUSE : '');
  doc.setFont(undefined, 'bold');
  doc.text('MSME Udyam: ' + (msmeNo || '–'), MARGIN, yL);
  yL += LH(FONT.body);
  doc.setFont(undefined, 'normal');
  if (msmeClause) {
    const msmeLines = doc.splitTextToSize(msmeClause, colW - 2);
    doc.text(msmeLines, MARGIN, yL);
    yL += msmeLines.length * LH(FONT.body);
  }
  yL += 1;

  const billNo = inv.billNumber || inv.bill_number || '–';
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
    ...(origTaxNo && (invoiceKind === 'credit_note' || invoiceKind === 'debit_note')
      ? [['Original Tax Invoice No.', String(origTaxNo)]]
      : []),
    ['Bill No.', billNo],
    ['Billing Month', billMonth],
    ['Billing Duration', billingDur],
    ['Dated', invoiceDate],
    ['Mode/Terms of Payment', paymentTerms],
    ["Buyer's Order No.", buyerOrderNo],
    ['Order Dated', buyerOrderDate],
  ];
  doc.setFontSize(FONT.body);
  const labelW = 42;
  meta.forEach(([label, val]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label + ':', midX, yR);
    doc.setFont(undefined, 'normal');
    const vLines = doc.splitTextToSize(String(val), colW - labelW - 2);
    doc.text(vLines, midX + labelW, yR);
    yR += Math.max(LH(FONT.body), vLines.length * LH(FONT.body));
  });

  y = Math.max(yL, yR) + 5;

  // ----- Buyer (Bill to) left | Consignee (Ship to) right
  const partyTop = y;
  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.text('Buyer (Bill to)', MARGIN, partyTop);
  doc.text('Consignee (Ship to)', midX, partyTop);
  y = partyTop + LH(FONT.section) + 1;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(FONT.body);
  let yBill = y;
  let yShip = y;

  doc.text(buyerNameLine, MARGIN, yBill);
  yBill += LH(FONT.body);
  const buyerLines = doc.splitTextToSize(buyerAddress, colW - 2);
  doc.text(buyerLines, MARGIN, yBill);
  yBill += buyerLines.length * LH(FONT.body);
  doc.text('GSTIN/UIN: ' + buyerGstin, MARGIN, yBill);
  yBill += LH(FONT.body);
  doc.text(`State Name: ${SELLER.state}, Code: ${SELLER.stateCode}`, MARGIN, yBill);
  yBill += LH(FONT.body);
  doc.text('Place of Supply: ' + placeOfSupply, MARGIN, yBill);
  yBill += LH(FONT.body);

  doc.text(buyerNameLine, midX, yShip);
  yShip += LH(FONT.body);
  const shipLines = doc.splitTextToSize(shipAddress, colW - 2);
  doc.text(shipLines, midX, yShip);
  yShip += shipLines.length * LH(FONT.body);
  doc.text('GSTIN/UIN: ' + buyerGstin, midX, yShip);
  yShip += LH(FONT.body);
  doc.text(`State Name: ${SELLER.state}, Code: ${SELLER.stateCode}`, midX, yShip);
  yShip += LH(FONT.body);

  y = Math.max(yShip, yBill) + 6;

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
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
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
  y = doc.lastAutoTable.finalY + 4;

  // Totals under table (aligned to amount column)
  const totalQty = rowItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'bold');
  doc.text('Total Quantity: ' + formatInrPdf(totalQty) + ' NO', MARGIN, y);
  const totalLine = `Invoice Total: ${PDF_RS} ` + formatInvoiceTotalDisplay(totalAmount) + '  (E. & O.E.)';
  doc.text(totalLine, MARGIN + contentW, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  y += LH(FONT.body) + 4;

  doc.setFont(undefined, 'bold');
  doc.text('Amount Chargeable (in words)', MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += LH(FONT.body);
  const amtWordsLines = doc.splitTextToSize(amountInWords(totalAmount), contentW);
  doc.text(amtWordsLines, MARGIN, y);
  y += amtWordsLines.length * LH(FONT.body) + 5;

  // ----- Bank (left) | Terms & Conditions (right)
  const termsBankTop = y;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(FONT.section);
  doc.text('Bank Details', MARGIN, termsBankTop);
  doc.text('Terms & Conditions', midX, termsBankTop);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(FONT.body);

  let yBank = termsBankTop + LH(FONT.section);
  const holderLines = doc.splitTextToSize("A/c Holder's Name: " + BANK.accountHolder, colW - 2);
  doc.text(holderLines, MARGIN, yBank);
  yBank += holderLines.length * LH(FONT.body);
  doc.text('Bank Name: ' + BANK.bankName, MARGIN, yBank);
  yBank += LH(FONT.body);
  doc.text('A/c No.: ' + BANK.accountNo, MARGIN, yBank);
  yBank += LH(FONT.body);
  const branchLines = doc.splitTextToSize('Branch & IFS Code: ' + BANK.branchAndIfsc, colW - 2);
  doc.text(branchLines, MARGIN, yBank);
  yBank += branchLines.length * LH(FONT.body) + 4;
  doc.text('for ' + SELLER.name, MARGIN, yBank);
  yBank += LH(FONT.body) + 2;
  doc.setFont(undefined, 'bold');
  doc.text('Authorised Signatory', MARGIN, yBank);
  doc.setFont(undefined, 'normal');

  const termsLines = resolveTermsLines(inv);
  let yTerms = termsBankTop + LH(FONT.section);
  termsLines.forEach((t, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${t}`, colW - 2);
    doc.text(wrapped, midX, yTerms);
    yTerms += wrapped.length * LH(FONT.body);
  });
  doc.setFont(undefined, 'italic');
  doc.text("Customer's Seal and Signature", midX, yTerms + 3);
  doc.setFont(undefined, 'normal');

  y = Math.max(yTerms + 12, yBank + LH(FONT.section)) + 4;

  // Digital signature (optional) — right column under terms area
  const sig = inv.digitalSignatureDataUrl || inv.digital_signature_data_url;
  if (typeof sig === 'string' && sig.startsWith('data:image/')) {
    try {
      const sigType = sig.startsWith('data:image/jpeg') || sig.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
      const sigW = 42;
      const sigH = 16;
      const sigX = pageW - MARGIN - sigW;
      const sigY = y - 8;
      doc.addImage(sig, sigType, sigX, sigY, sigW, sigH);
      doc.setFontSize(FONT.small);
      doc.text('Digital Signature', sigX + sigW / 2, sigY + sigH + 4, { align: 'center' });
      y = Math.max(y, sigY + sigH + 8);
    } catch {
      /* ignore bad image */
    }
  }

  // Keep footer on page: if too low, new page for footer block only when needed
  const footerBlockH = 28;
  if (y + footerBlockH > pageH - MARGIN) {
    doc.addPage();
    y = MARGIN;
  }

  doc.setFontSize(FONT.section);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(JURISDICTION, pageW / 2, y, { align: 'center' });
  y += 10;

  // Red ribbon accent (letterhead style, bottom band)
  const ribbonH = 5;
  doc.setFillColor(185, 28, 28);
  doc.rect(0, y, pageW, ribbonH, 'F');
  y += ribbonH;

  const footerStripH = 16;
  doc.setFillColor(165, 42, 42);
  doc.rect(0, y, pageW, footerStripH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(FONT.body);
  doc.setFont(undefined, 'normal');
  doc.text('Phone: ' + FOOTER_PHONE, MARGIN + 4, y + 5);
  doc.text('Email: ' + FOOTER_EMAIL, MARGIN + 4, y + 10);
  doc.text('Website: ' + FOOTER_WEB, MARGIN + 62, y + 5);
  const addrLines = doc.splitTextToSize(FOOTER_ADDRESS, pageW - MARGIN - 62 - 8);
  doc.text(addrLines, MARGIN + 62, y + 10);

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
