import React from 'react';
import {
  SELLER as PDF_SELLER,
  BANK,
  JURISDICTION,
  INVOICE_LETTERHEAD_FOOTER,
  INVOICE_LETTERHEAD_STRIP_COLOR,
  formatPdfDate,
  amountInWords,
  getInvoiceTotals,
  resolveTermsLines,
  resolveInvoiceVerticalKey,
  DEFAULT_MSME_CLAUSE,
} from '../../../utils/taxInvoicePdf';
import { formatAmountUpTo3Decimals, formatInvoiceTotalDisplay } from '../../../utils/invoiceRound';
import { INDUS_LOGO_SRC } from '../../../constants/branding.js';

const PDF_RS = 'Rs.';
const COMPANY_DISPLAY_NAME = 'INDUS FIRE SAFETY PRIVATE LIMITED';
const GST_RULE_LINE = 'Rule 46, Section 31 of GST Act - 2017';
const DEFAULT_UDHYAM_REG_NO = 'UDYAM-GJ-24-0001805';
const DEFAULT_SELLER_CIN = 'U29193GJ2012PTC070236';
const invoiceBlueHeaderTextStyle = {
  color: '#ffffff',
  WebkitTextFillColor: '#ffffff',
  opacity: 1,
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

function docTitleForKind(kind) {
  if (kind === 'proforma') return 'PROFORMA INVOICE';
  if (kind === 'draft') return 'DRAFT INVOICE';
  if (kind === 'credit_note') return 'CREDIT NOTE';
  if (kind === 'debit_note') return 'DEBIT NOTE';
  return 'TAX INVOICE';
}

/**
 * Static HTML invoice preview — shared by Create Invoice and Manage Invoices.
 * Field order and layout mirror buildTaxInvoiceDoc in taxInvoicePdf.js.
 */
export default function InvoiceHtmlPreview({ inv, showEInvoiceMeta = true }) {
  if (!inv) return null;

  const previewItems = Array.isArray(inv.items) ? inv.items : [];
  const totals = getInvoiceTotals(inv);
  const {
    cgstRate: previewCgstRate,
    sgstRate: previewSgstRate,
    cgstAmt: previewCgst,
    sgstAmt: previewSgst,
    igstRate: previewIgstRate,
    igstAmt: previewIgst,
    gstMode: previewGstMode,
    totalAmount: previewTotal,
  } = totals;

  const invoiceKind = inv.invoiceKind || 'tax';
  const docTitle = docTitleForKind(invoiceKind);

  const previewPaymentTerms = inv.paymentTerms || '30 Days';
  const previewInvoiceDateStr = formatPdfDate(inv.invoiceDate || inv.created_at);

  const buyerName = inv.clientLegalName || inv.client_name || '–';
  const buyerAddress = inv.clientAddress || inv.billingAddress || '–';
  const shipToRaw = inv.clientShippingAddress || inv.client_shipping_address;
  const shipAddress =
    shipToRaw && String(shipToRaw).trim() ? String(shipToRaw).trim() : buyerAddress;
  const buyerGstin = inv.gstin || '–';
  const buyerNameLine = 'M/s ' + (buyerName.startsWith('M/s') ? buyerName.slice(3).trim() : buyerName);

  const placeOfSupply = inv.placeOfSupply || inv.place_of_supply || 'Gujarat';

  const cin = preferredTextValue(inv.sellerCin, inv.seller_cin, PDF_SELLER.cin, DEFAULT_SELLER_CIN);
  const sellerGstin = preferredTextValue(inv.sellerGstin, inv.seller_gstin, PDF_SELLER.gstin);
  const pan = inv.sellerPan || inv.seller_pan || PDF_SELLER.pan;
  const cinDisp = cin && cin !== '—' ? cin : '–';
  const panDisp = pan && pan !== '—' ? pan : '–';
  const msmeNo = inv.msmeRegistrationNo || inv.msme_registration_no || PDF_SELLER.msmeUdyamNo;
  const msmeClause = inv.msmeClause || inv.msme_clause || DEFAULT_MSME_CLAUSE;
  const udhyamNo = msmeNo || DEFAULT_UDHYAM_REG_NO;
  const msmeText = `MSME Udyam : ${msmeClause ? msmeClause : ''}`;
  const udhyamLine = `Udhyam Registration No. : ${udhyamNo}`;

  const billMonth = inv.billingMonth || inv.billing_month || '–';
  const durFrom = inv.billingDurationFrom || inv.billing_duration_from;
  const durTo = inv.billingDurationTo || inv.billing_duration_to;
  const billingDur =
    durFrom && durTo
      ? `${formatPdfDate(durFrom)} to ${formatPdfDate(durTo)}`
      : durFrom || durTo
        ? formatPdfDate(durFrom || durTo)
        : '–';

  const hdrRemarks = inv.invoiceHeaderRemarks || inv.invoice_header_remarks;
  const remarksText = hdrRemarks && String(hdrRemarks).trim() ? String(hdrRemarks).trim() : '–';

  const previewTotalQty = previewItems.length ? previewItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0) : 0;

  const termsLines = resolveTermsLines(inv);
  const sig = inv.digitalSignatureDataUrl || inv.digital_signature_data_url;

  const invoiceNo = inv.taxInvoiceNumber || inv.billNumber || inv.bill_number || '–';
  const irn = inv.e_invoice_irn || inv.eInvoiceIrn || '';
  const ackNo = inv.e_invoice_ack_no || inv.eInvoiceAckNo || '';
  const ackDt = inv.e_invoice_ack_dt || inv.eInvoiceAckDt || '';
  const qrData = inv.e_invoice_signed_qr || inv.eInvoiceSignedQr || '';
  const isEInvoicePreview = Boolean(irn);

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

  let metaRowsLeft;
  let metaRowsRight;
  if (isManpowerInvoice) {
    metaRowsLeft = [
      ['Invoice No.', invoiceNo],
      ['Billing Month', billMonth],
      ['PO Number', poNumberDisp],
    ];
    metaRowsRight = [
      ['Invoice Date', previewInvoiceDateStr],
      ['Service Period', billingDur],
      ['Terms of Payment', previewPaymentTerms],
      ...origTaxNoRow,
    ];
  } else {
    metaRowsLeft = [
      ['Invoice No.', invoiceNo],
      ['Billing Month', billMonth],
      ['PO Number', poNumberDisp],
      ['Delivery Note', deliveryNote],
      ['Dispatch Doc. No.', dispatchDocNo],
      ['Terms of Delivery', termsOfDelivery],
      ['Other Reference', otherReference],
    ];
    metaRowsRight = [
      ['Invoice Date', previewInvoiceDateStr],
      ['Service Period', billingDur],
      ['Terms of Payment', previewPaymentTerms],
      ['Delivery Note Date', deliveryNoteDate],
      ['Dispatched Through', dispatchedThrough],
      ['Destination', destination],
      ...origTaxNoRow,
    ];
  }
  const invoiceSubtotal = round2(previewTotal - previewCgst - previewSgst - previewIgst);
  const showEinvBlock = showEInvoiceMeta && isEInvoicePreview;
  const uiTitle = docTitle;

  return (
    <div className="w-full bg-[#e8e8e8] p-4 sm:p-6">
      <div
        className="mx-auto w-full max-w-[780px] bg-white border border-[#ccc] text-[#1f2937]"
        style={{ fontFamily: "'Times New Roman', serif" }}
      >
        <div className="px-[28px] pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-16 w-16 rounded-full bg-white overflow-hidden shrink-0">
              <img
                src={INDUS_LOGO_SRC}
                alt="IFS logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold uppercase tracking-[0.3px] text-[#1a3a6c]">{COMPANY_DISPLAY_NAME}</p>
              <p className="text-[8.5px] text-[#1a3a6c] mt-0.5">{GST_RULE_LINE}</p>
              <p className="text-[8px] mt-0.5">{PDF_SELLER.address}</p>
              <p className="text-[8px] mt-0.5 break-words leading-snug">
                GSTIN: {sellerGstin} | PAN Number - {panDisp} | CIN Number-{cinDisp}
              </p>
            </div>
            {showEinvBlock ? (
              <div className="h-16 w-16 shrink-0">
                <div className="h-full w-full border border-[#bbb] bg-white grid place-items-center">
                  {qrData ? (
                    <img src={qrData} alt="QR Code" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[7px] text-gray-500">QR</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-[28px]">
          <div className="border-y-2 border-[#1a3a6c] py-1 text-center">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-[#1a3a6c] text-center">{uiTitle}</p>
              <p className="text-[7px] font-semibold uppercase tracking-[0.4px] text-[#1a3a6c] whitespace-nowrap text-right">
                (Original for recipient)
              </p>
            </div>
            {showEinvBlock ? (
              <p className="text-[6.5px] font-medium uppercase tracking-[0.35px] text-[#1a3a6c] text-right -mt-0.5">e-Invoice</p>
            ) : null}
          </div>
        </div>

        {showEinvBlock ? (
          <div className="px-[28px] bg-[#f0f4fa] border-y border-[#bbb] py-1.5">
            <div className="space-y-0.5 text-[8px]">
              <p className="flex gap-2">
                <span className="min-w-[48px] font-bold text-[#1a3a6c]">IRN No:</span>
                <span className="font-mono text-[#4b5563] break-all">{irn || '–'}</span>
              </p>
              <p className="flex gap-2">
                <span className="min-w-[48px] font-bold text-[#1a3a6c]">Ack No:</span>
                <span className="font-mono text-[#4b5563]">{ackNo || '–'}</span>
              </p>
              <p className="flex gap-2">
                <span className="min-w-[48px] font-bold text-[#1a3a6c]">Ack Date:</span>
                <span className="font-mono text-[#4b5563]">{ackDt ? formatPdfDate(ackDt) : '–'}</span>
              </p>
            </div>
          </div>
        ) : null}

        <div className="px-[28px]">
          <div
            className={`border border-[#bbb] text-[8.5px] w-full ${isManpowerInvoice ? 'leading-tight' : ''}`}
          >
            <div className="grid grid-cols-2 items-start gap-0">
              <div
                className={
                  isManpowerInvoice
                    ? 'px-2 py-2 flex flex-col gap-y-1'
                    : 'px-2 pt-2.5 pb-1.5 space-y-1.5'
                }
              >
                {metaRowsLeft.map(([label, val], idx) => (
                  <p key={`l-${idx}-${label}`} className="grid grid-cols-[110px_1fr] gap-2 m-0 leading-tight">
                    <span className="font-semibold text-gray-700">{label}:</span>
                    <span className="text-black">{val}</span>
                  </p>
                ))}
              </div>
              <div
                className={
                  isManpowerInvoice
                    ? 'px-2 py-2 flex flex-col gap-y-1 border-l border-[#bbb]'
                    : 'px-2 pt-2.5 pb-1.5 space-y-1.5 border-l border-[#bbb]'
                }
              >
                {metaRowsRight.map(([label, val], idx) => (
                  <p key={`r-${idx}-${label}`} className="grid grid-cols-[110px_1fr] gap-2 m-0 leading-tight">
                    <span className="font-semibold text-gray-700">{label}:</span>
                    <span className="text-black">{val}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-[28px] mt-3">
          <div className="border border-[#e6c800] bg-[#fffbe6] px-2 py-1.5 text-left flex flex-col gap-1.5">
            <p className="text-[8.8px] font-bold text-[#b7791f] leading-[1.35] m-0">{msmeText}</p>
            <p className="text-[8.8px] font-bold text-[#b7791f] leading-[1.35] m-0">{udhyamLine}</p>
          </div>
        </div>

        <div className="px-[28px] pt-2">
          <div className="border border-[#bbb]">
            <div className="grid grid-cols-2">
              <div className="px-2 py-2 border-r border-[#bbb] text-[8.5px]">
                <p className="font-bold uppercase text-[#1a3a6c] border-b border-[#bbb] pb-1 mb-1">BUYER (BILL TO)</p>
                <p className="font-bold">{buyerNameLine}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{buyerAddress}</p>
                <p className="mt-0.5">GSTIN: {buyerGstin}</p>
                <p>State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}</p>
              </div>
              <div className="px-2 py-2 text-[8.5px]">
                <p className="font-bold uppercase text-[#1a3a6c] border-b border-[#bbb] pb-1 mb-1">CONSIGNEE (SHIP TO)</p>
                <p className="font-bold">{buyerNameLine}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{shipAddress}</p>
                <p className="mt-0.5">GSTIN: {buyerGstin}</p>
                <p>
                  State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}, Place of Supply: {placeOfSupply}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-[28px] pt-2">
          <div className="border border-[#bbb] px-2 py-1.5 text-[8px]">
            <p className="font-bold text-[#1a3a6c]">Description / Remarks</p>
            <p className="italic text-gray-500 mt-0.5">{remarksText || '–'}</p>
          </div>
        </div>

        <div className="px-[28px] pt-2 space-y-0">
          <table className="w-full border-collapse border border-[#bbb] text-[8.5px]">
            <thead>
              <tr className="bg-[#1a3a6c] text-white" style={invoiceBlueHeaderTextStyle}>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[6%]" style={invoiceBlueHeaderTextStyle}>SR No.</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-left font-bold text-white leading-tight w-[39%]" style={invoiceBlueHeaderTextStyle}>Description of Goods</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[10%]" style={invoiceBlueHeaderTextStyle}>HSN/SAC</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[6%]" style={invoiceBlueHeaderTextStyle}>Qty</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[12%]" style={invoiceBlueHeaderTextStyle}>Rate ({PDF_RS})</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[6%]" style={invoiceBlueHeaderTextStyle}>UOM</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[6%]" style={invoiceBlueHeaderTextStyle}>Disc.%</th>
                <th className="border border-[#bbb] px-1.5 py-1.5 text-center font-bold text-white leading-tight w-[15%]" style={invoiceBlueHeaderTextStyle}>Amount ({PDF_RS})</th>
              </tr>
            </thead>
            <tbody>
              {(previewItems.length ? previewItems : [{ description: 'Services as per PO', quantity: 1, rate: invoiceSubtotal, amount: invoiceSubtotal }]).map((it, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fc]'}>
                  <td className="border border-[#bbb] px-1 py-1 text-center">{idx + 1}</td>
                  <td className="border border-[#bbb] px-1 py-1 font-bold">{(it.description || it.designation || '–').slice(0, 120)}</td>
                  <td className="border border-[#bbb] px-1 py-1 text-center font-mono text-gray-600">{it.hsnSac || inv.hsnSac || '–'}</td>
                  <td className="border border-[#bbb] px-1 py-1 text-right">{formatAmountUpTo3Decimals(it.quantity || 0)}</td>
                  <td className="border border-[#bbb] px-1 py-1 text-right" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(it.rate || 0)}</td>
                  <td className="border border-[#bbb] px-1 py-1 text-center">No.</td>
                  <td className="border border-[#bbb] px-1 py-1 text-center">—</td>
                  <td className="border border-[#bbb] px-1 py-1 text-right" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(it.amount || 0)}</td>
                </tr>
              ))}
              {previewCgst > 0 ? (
                <tr className="bg-[#f0f4fa]">
                  <td colSpan={7} className="border border-[#bbb] px-1 py-1 text-right font-bold text-[#1a3a6c]">CGST @ {previewCgstRate}%</td>
                  <td className="border border-[#bbb] px-1 py-1 text-right" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(previewCgst)}</td>
                </tr>
              ) : null}
              {previewSgst > 0 ? (
                <tr className="bg-[#f0f4fa]">
                  <td colSpan={7} className="border border-[#bbb] px-1 py-1 text-right font-bold text-[#1a3a6c]">SGST @ {previewSgstRate}%</td>
                  <td className="border border-[#bbb] px-1 py-1 text-right" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(previewSgst)}</td>
                </tr>
              ) : null}
              {previewIgst > 0 ? (
                <tr className="bg-[#f0f4fa]">
                  <td colSpan={7} className="border border-[#bbb] px-1 py-1 text-right font-bold text-[#1a3a6c]">IGST @ {previewIgstRate}%</td>
                  <td className="border border-[#bbb] px-1 py-1 text-right" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(previewIgst)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div
            className="border-x border-b border-[#bbb] grid items-stretch -mt-px"
            style={{ gridTemplateColumns: 'minmax(0, 133fr) minmax(0, 49fr)' }}
          >
            <div className="px-2 py-2 flex items-center bg-white min-w-0 border-r border-[#bbb]">
              <p className="text-[8px] font-bold text-black m-0">
                Total Quantity: {formatAmountUpTo3Decimals(previewTotalQty)} No.
              </p>
            </div>
            <div
              className="flex items-center justify-between gap-2 px-1.5 py-1.5 text-white min-h-[28px] min-w-0"
              style={{ backgroundColor: 'rgb(18, 61, 124)' }}
            >
              <span className="text-[7px] font-bold uppercase tracking-wide leading-tight shrink min-w-0">
                INVOICE TOTAL
              </span>
              <span
                className="text-[11px] font-bold tabular-nums text-right shrink-0 leading-none"
                style={{ fontFamily: "'Courier New', monospace" }}
              >
                {PDF_RS} {formatInvoiceTotalDisplay(previewTotal)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-[28px] -mt-px">
          <div className="border-x border-b border-[#bbb] bg-[#f0f4fa] px-2 py-1.5">
            <p className="text-[7.5px] font-bold uppercase text-[#1a3a6c]">AMOUNT CHARGEABLE (IN WORDS)</p>
            <p className="text-[8.5px] italic font-bold mt-0.5">{amountInWords(previewTotal)}</p>
          </div>
        </div>

        <div className="px-[28px]">
          <div className="border-x border-b border-[#bbb] text-[8px] -mt-px px-2 py-2">
            <p className="font-bold uppercase text-[#1a3a6c] text-[8px]">BANK DETAILS</p>
            <div className="mt-1.5 space-y-1.5 text-[8px]">
              <div className="flex gap-2 items-start">
                <span className="text-gray-600 shrink-0 w-[118px]">A/c Holder&apos;s Name</span>
                <span className="font-bold text-left leading-snug text-neutral-900 min-w-0" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.accountHolder}</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-gray-600 shrink-0 w-[118px]">Bank Name</span>
                <span className="font-bold text-left leading-snug text-neutral-900 min-w-0" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.bankName}</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-gray-600 shrink-0 w-[118px]">A/c No.</span>
                <span className="font-bold text-left leading-snug text-neutral-900 min-w-0" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.accountNo}</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-gray-600 shrink-0 w-[118px]">Branch &amp; IFSC Code</span>
                <span className="font-bold text-left leading-snug text-neutral-900 min-w-0" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.ifsc}</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-gray-600 shrink-0 w-[118px] pt-px">Bank Branch</span>
                <span className="font-bold text-left leading-relaxed text-neutral-900 min-w-0" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.branchAddress}</span>
              </div>
            </div>
            <p className="text-right text-[7px] text-gray-500 mt-2">(E. &amp; O.E.)</p>
          </div>
        </div>

        <div className="px-[28px]">
          <div className="grid grid-cols-2 items-start border-x border-b border-[#bbb] text-[7.5px]">
            <div className="px-2 py-2 border-r border-[#bbb]">
              <p className="font-bold uppercase text-[#1a3a6c] m-0 leading-snug">TERMS & CONDITIONS</p>
              <ol className="mt-1.5 list-none space-y-0.5 pl-0 text-gray-600">
                {termsLines.slice(0, 4).map((t, i) => (
                  <li key={i} className="flex gap-1.5 items-start leading-[1.5]">
                    <span className="shrink-0 w-[2em] text-right tabular-nums text-gray-600">{i + 1}.</span>
                    <span className="min-w-0 flex-1 text-neutral-900">{t}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="px-2 pt-1 pb-2 text-right">
              <p className="text-[9px] font-bold text-[#1a3a6c] leading-snug m-0">For {COMPANY_DISPLAY_NAME}</p>
              <div className="h-12" aria-hidden />
              <div className="w-[120px] border-b border-[#333] ml-auto" />
              <p className="text-center w-[120px] ml-auto mt-2">Authorised Signatory</p>
              {typeof sig === 'string' && sig.startsWith('data:image/') ? (
                <div className="mt-2 flex justify-end">
                  <img src={sig} alt="" className="max-h-12 max-w-[9rem] object-contain" />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="bg-[#1a3a6c] text-[#d9e4f5] text-[7.5px] px-[28px] py-1.5 flex items-center justify-between gap-3 border-t border-[#16335d]">
          <p>
            Phone: {INVOICE_LETTERHEAD_FOOTER.phone} | Email: {INVOICE_LETTERHEAD_FOOTER.email} | Website: {INVOICE_LETTERHEAD_FOOTER.website}
          </p>
          <p className="text-right whitespace-nowrap">{JURISDICTION}</p>
        </div>
      </div>
    </div>
  );
}
