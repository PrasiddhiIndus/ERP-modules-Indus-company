/**
 * Generate Tax Invoice PDF matching the standard structure/UI (header, seller, buyer,
 * item table, tax summary, bank details, terms, footer). Uses data from Create Invoice / Manage Invoices.
 */
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// Seller (company issuing invoice) – same as CreateInvoice.jsx
const SELLER = {
  name: 'M/s Indus Fire Safety Private Limited',
  address: 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara',
  state: 'Gujarat',
  stateCode: '24',
  gstin: '24AADCJ2182H1ZS',
};

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
  const dec = Math.round((Number(amount) || 0 - n) * 100);
  let str = 'INR ' + numberToWords(n) + ' Only';
  if (dec > 0) str += ' and ' + numberToWords(dec) + ' Paise';
  return str;
}

/**
 * Build invoice numbers/amounts from inv (with or without items)
 */
function getInvoiceTotals(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  let taxableValue = Number(inv.taxableValue);
  let cgstRate = Number(inv.cgstRate) || 9;
  let sgstRate = Number(inv.sgstRate) || 9;
  let cgstAmt = Number(inv.cgstAmt);
  let sgstAmt = Number(inv.sgstAmt);
  const total = Number(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0);

  if (items.length > 0 && (taxableValue === 0 || isNaN(taxableValue))) {
    taxableValue = round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));
    cgstAmt = round2((taxableValue * cgstRate) / 100);
    sgstAmt = round2((taxableValue * sgstRate) / 100);
  } else if (total > 0 && (taxableValue === 0 || isNaN(taxableValue))) {
    const taxRate = cgstRate + sgstRate;
    taxableValue = round2(total / (1 + taxRate / 100));
    cgstAmt = round2((taxableValue * cgstRate) / 100);
    sgstAmt = round2((taxableValue * sgstRate) / 100);
  }
  const totalAmount = round2(taxableValue + cgstAmt + sgstAmt);
  return { taxableValue, cgstRate, sgstRate, cgstAmt, sgstAmt, totalAmount, items };
}

/**
 * Generate and download Tax Invoice PDF for the given invoice object.
 * @param {Object} inv - Invoice from BillingContext (taxInvoiceNumber, clientLegalName, items, etc.)
 * @param {Object} [options]
 * @param {boolean} [options.includeEinvoiceHeader=false] - When true and IRN is present,
 *   render the e-invoice IRN / Ack No / Ack Date + QR block at the top (for Generated E-Invoice).
 *   Normal downloads (Manage Invoices) should omit this so layout stays clean.
 */
export function downloadTaxInvoicePdf(inv, options = {}) {
  if (!inv) return;
  const { includeEinvoiceHeader = false } = options;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = 10;

  const { taxableValue, cgstRate, sgstRate, cgstAmt, sgstAmt, totalAmount, items } = getInvoiceTotals(inv);

  const buyerName = inv.clientLegalName || inv.client_name || '–';
  const buyerAddress = inv.clientAddress || inv.billingAddress || '–';
  const buyerGstin = inv.gstin || '–';
  const invoiceNo = inv.taxInvoiceNumber || inv.bill_number || '–';
  const invoiceDate = formatPdfDate(inv.invoiceDate || inv.created_at);
  const paymentTerms = inv.paymentTerms || '30 Days';
  const buyerOrderNo = inv.poWoNumber || inv.ocNumber || '–';
  const buyerOrderDate = inv.poWoDate ? formatPdfDate(inv.poWoDate) : invoiceDate;
  const placeOfSupply = inv.placeOfSupply || 'Gujarat';
  const irn = inv.e_invoice_irn || inv.eInvoiceIrn;
  const ackNo = inv.e_invoice_ack_no || inv.eInvoiceAckNo;
  const ackDt = inv.e_invoice_ack_dt || inv.eInvoiceAckDt;
  const qrData = inv.e_invoice_signed_qr || inv.eInvoiceSignedQr;

  // ----- Header bar (red/blue style - using dark blue)
  doc.setFillColor(20, 60, 120);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(SELLER.name.toUpperCase(), margin, 12);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text('An ISO 9001:2015 Certified Company', margin, 18);
  y = 26;

  // ----- Title: GST INVOICE (e-invoice style) or Tax Invoice (normal)
  doc.setTextColor(0, 0, 0);
  const isEInvoicePdf = includeEinvoiceHeader && irn;
  const qrSize = 28;
  const qrX = pageW - margin - qrSize;
  const leftContentWidth = pageW - 2 * margin - qrSize - 8;

  if (isEInvoicePdf) {
    // Government-portal style: left = GST INVOICE + (ORIGINAL FOR RECIPIENT); right = e-Invoice + QR; below = IRN, Ack No., Ack Date
    const titleTop = y;
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('GST INVOICE', margin, titleTop);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text('(ORIGINAL FOR RECIPIENT)', margin, titleTop + 6);

    doc.setFontSize(9);
    doc.text('e-Invoice', pageW - margin, titleTop - 1, { align: 'right' });
    const qrY = titleTop + 4;
    if (typeof qrData === 'string' && qrData.length > 0 && (qrData.startsWith('data:image/') || qrData.startsWith('data:application/'))) {
      try {
        const type = qrData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(qrData, type, qrX, qrY, qrSize, qrSize);
      } catch {
        doc.rect(qrX, qrY, qrSize, qrSize);
        doc.setFontSize(7);
        doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
      }
    } else {
      doc.rect(qrX, qrY, qrSize, qrSize);
      doc.setFontSize(7);
      doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
    }

    let infoY = titleTop + 10;
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    const irnLines = doc.splitTextToSize('IRN: ' + irn, leftContentWidth);
    doc.text(irnLines, margin, infoY);
    infoY += irnLines.length * 4 + 2;
    if (ackNo) {
      doc.text('Ack No.: ' + ackNo, margin, infoY);
      infoY += 5;
    }
    if (ackDt) {
      doc.text('Ack Date: ' + formatPdfDate(ackDt), margin, infoY);
      infoY += 5;
    }
    y = Math.max(infoY + 4, qrY + qrSize + 4);
  } else {
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Tax Invoice', pageW / 2, y, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.text('(ORIGINAL FOR RECIPIENT)', pageW - margin, y - 2, { align: 'right' });
    y += 10;
  }

  // ----- Seller (left) and Invoice details (right)
  const col1 = margin;
  const col2 = pageW / 2 + 2;
  const headerBlockTop = y;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(SELLER.name, col1, y);
  doc.setFont(undefined, 'normal');
  y += 5;
  doc.setFontSize(8);
  const sellerAddrLines = doc.splitTextToSize(SELLER.address, pageW / 2 - margin - 4);
  doc.text(sellerAddrLines, col1, y);
  y += sellerAddrLines.length * 4;
  doc.text('GSTIN/UIN: ' + SELLER.gstin, col1, y);
  y += 4;
  doc.text('State Name: ' + SELLER.state + ', Code: ' + SELLER.stateCode, col1, y);

  // Right column (invoice meta) – aligned from the same top, independent of left height
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  let yRight = headerBlockTop;
  doc.text('Invoice No.: ' + invoiceNo, col2, yRight);
  yRight += 5;
  doc.text('Dated: ' + invoiceDate, col2, yRight);
  yRight += 5;
  doc.text('Mode/Terms of Payment: ' + paymentTerms, col2, yRight);
  yRight += 5;
  doc.text("Buyer's Order No.: " + buyerOrderNo, col2, yRight);
  yRight += 5;
  doc.text('Dated: ' + buyerOrderDate, col2, yRight);

  y += 8;

  // ----- Consignee (Ship to) / Buyer (Bill to)
  doc.setFont(undefined, 'bold');
  doc.setFontSize(9);
  doc.text('Consignee (Ship to):', col1, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  const buyerNameLine = 'M/s ' + (buyerName.startsWith('M/s') ? buyerName.slice(3).trim() : buyerName);
  const consigneeAddrLines = doc.splitTextToSize(buyerAddress, pageW / 2 - margin - 4);
  let yCons = y + 5;
  doc.text(buyerNameLine, col1, yCons);
  yCons += 4;
  doc.text(consigneeAddrLines, col1, yCons);
  yCons += consigneeAddrLines.length * 4;
  doc.text('GSTIN/UIN: ' + buyerGstin, col1, yCons);
  yCons += 4;
  doc.text('State Name: Gujarat, Code: 24', col1, yCons);

  doc.setFont(undefined, 'bold');
  doc.text('Buyer (Bill to):', col2, y);
  doc.setFont(undefined, 'normal');
  let yBuyer = y + 5;
  doc.text(buyerNameLine, col2, yBuyer);
  yBuyer += 4;
  const buyerAddrLines2 = doc.splitTextToSize(buyerAddress, pageW - col2 - margin);
  doc.text(buyerAddrLines2, col2, yBuyer);
  yBuyer += buyerAddrLines2.length * 4;
  doc.text('GSTIN/UIN: ' + buyerGstin, col2, yBuyer);
  yBuyer += 4;
  doc.text('State Name: Gujarat, Code: 24', col2, yBuyer);
  yBuyer += 4;
  doc.text('Place of Supply: ' + placeOfSupply, col2, yBuyer);
  y = Math.max(yCons, yBuyer) + 6;

  // ----- Item table
  const tableHeaders = ['SI No.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Disc. %', 'Amount'];
  const tableRows = (items.length ? items : [{ description: 'Services as per PO', hsnSac: inv.hsnSac || '9983', quantity: 1, rate: taxableValue, amount: taxableValue }]).map((it, idx) => [
    String(idx + 1),
    (it.description || it.designation || '–').substring(0, 45),
    String(it.hsnSac || inv.hsnSac || '–'),
    String(Number(it.quantity) || 0) + ' NO',
    Number(it.rate || 0).toFixed(2),
    'NO',
    '',
    Number(it.amount || 0).toFixed(2),
  ]);
  tableRows.push(['', 'CGST', '', '', '', '', '', cgstAmt.toFixed(2)]);
  tableRows.push(['', 'SGST', '', '', '', '', '', sgstAmt.toFixed(2)]);

  autoTable(doc, {
    startY: y,
    head: [tableHeaders],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 7 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 55 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 18 },
      5: { cellWidth: 12 },
      6: { cellWidth: 15 },
      7: { cellWidth: 22 },
    },
    margin: { left: margin },
    tableWidth: pageW - 2 * margin,
  });
  y = doc.lastAutoTable.finalY + 4;

  // Total row below table (Total Quantity, Total Amount)
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  const totalQty = items.length ? items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) : 1;
  const totalLabelX = col1 + 12 + 55 + 18;
  const totalAmountX = totalLabelX + 22 + 18 + 12 + 10;
  doc.text('Total Quantity: ' + totalQty + ' NO', totalLabelX, y);
  const totalText = 'Total Amount: Rs.' + totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '  E. & O.E';
  const totalLines = doc.splitTextToSize(totalText, pageW - totalAmountX - margin);
  doc.text(totalLines, totalAmountX, y);
  doc.setFont(undefined, 'normal');
  y += 6 + (totalLines.length - 1) * 4;

  // Amount chargeable in words
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.text('Amount Chargeable (in words):', col1, y);
  doc.setFont(undefined, 'normal');
  const amtWordsLines = doc.splitTextToSize(amountInWords(totalAmount), pageW - 2 * margin);
  doc.text(amtWordsLines, col1, y + 5);
  y += 5 + amtWordsLines.length * 4 + 4;

  // ----- Tax summary table
  const hsn = (items[0] && (items[0].hsnSac || inv.hsnSac)) || inv.hsnSac || '9983';
  autoTable(doc, {
    startY: y,
    head: [['HSN/SAC', 'Taxable Value', 'CGST Rate', 'CGST Amount', 'SGST/UTGST Rate', 'SGST/UTGST Amount', 'Total Tax Amount']],
    body: [
      [hsn, taxableValue.toFixed(2), cgstRate + '%', cgstAmt.toFixed(2), sgstRate + '%', sgstAmt.toFixed(2), (cgstAmt + sgstAmt).toFixed(2)],
    ],
    theme: 'grid',
    styles: { fontSize: 7 },
    headStyles: { fillColor: [240, 240, 240] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 28 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 28 },
    },
  });
  y = doc.lastAutoTable.finalY + 3;
  doc.setFontSize(7);
  doc.text('Tax Amount (in words): ' + amountInWords(cgstAmt + sgstAmt), col1, y);
  y += 10;

  // ----- Terms (left) and Bank details (right)
  const termsStartY = y;
  doc.setFontSize(8);
  let yTerms = termsStartY;
  TERMS.forEach((t, i) => {
    const line = `${i + 1}. ${t}`;
    const wrapped = doc.splitTextToSize(line, pageW / 2 - margin - 4);
    doc.text(wrapped, col1, yTerms);
    yTerms += wrapped.length * 4;
  });
  doc.text("Customer's Seal and Signature", col1, yTerms + 4);

  doc.setFont(undefined, 'bold');
  doc.text("Bank Details", col2, y);
  doc.setFont(undefined, 'normal');
  let yBank = y + 5;
  const holderLines = doc.splitTextToSize("A/c Holder's Name: " + BANK.accountHolder, pageW - col2 - margin);
  doc.text(holderLines, col2, yBank);
  yBank += holderLines.length * 4;
  doc.text('Bank Name: ' + BANK.bankName, col2, yBank);
  yBank += 4;
  doc.text('A/c No.: ' + BANK.accountNo, col2, yBank);
  yBank += 4;
  const branchLines = doc.splitTextToSize('Branch & IFS Code: ' + BANK.branchAndIfsc, pageW - col2 - margin);
  doc.text(branchLines, col2, yBank);
  yBank += branchLines.length * 4;
  doc.text('for ' + SELLER.name, col2, yBank + 4);
  doc.text('Authorised Signatory', col2, yBank + 9);

  y = Math.max(yTerms + 10, yBank + 14);
  if (y < doc.internal.pageSize.getHeight() - 35) y = doc.internal.pageSize.getHeight() - 35;

  // ----- Footer: Jurisdiction
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(JURISDICTION, pageW / 2, y, { align: 'center' });
  y += 8;

  // Footer strip (red/dark background)
  const footerHeight = 14;
  doc.setFillColor(180, 40, 40);
  doc.rect(0, y - 2, pageW, footerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  const footerY1 = y + 3;
  const footerY2 = y + 7;
  doc.text('Phone: ' + FOOTER_PHONE, margin + 5, footerY1);
  doc.text('Website: ' + FOOTER_WEB, margin + 65, footerY1);
  doc.text('Email: ' + FOOTER_EMAIL, margin + 5, footerY2);
  const addrLines = doc.splitTextToSize(FOOTER_ADDRESS, pageW - (margin + 70));
  doc.text(addrLines, margin + 70, footerY2);

  doc.save(`Tax_Invoice_${(inv.taxInvoiceNumber || inv.bill_number || 'Invoice').replace(/\s/g, '_')}.pdf`);
}
