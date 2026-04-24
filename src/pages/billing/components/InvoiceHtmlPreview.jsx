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
  DEFAULT_MSME_CLAUSE,
} from '../../../utils/taxInvoicePdf';
import { formatAmountUpTo3Decimals, formatInvoiceTotalDisplay } from '../../../utils/invoiceRound';
import { INDUS_LOGO_SRC } from '../../../constants/branding.js';

const PDF_RS = 'Rs.';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatMoney2(n) {
  return round2(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
export default function InvoiceHtmlPreview({ inv }) {
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
  const previewBuyerOrderNo = inv.poWoNumber || inv.ocNumber || '–';

  const buyerName = inv.clientLegalName || inv.client_name || '–';
  const buyerAddress = inv.clientAddress || inv.billingAddress || '–';
  const shipToRaw = inv.clientShippingAddress || inv.client_shipping_address;
  const shipAddress =
    shipToRaw && String(shipToRaw).trim() ? String(shipToRaw).trim() : buyerAddress;
  const buyerGstin = inv.gstin || '–';
  const buyerNameLine = 'M/s ' + (buyerName.startsWith('M/s') ? buyerName.slice(3).trim() : buyerName);

  const placeOfSupply = inv.placeOfSupply || inv.place_of_supply || 'Gujarat';

  const cin = inv.sellerCin || inv.seller_cin || PDF_SELLER.cin;
  const pan = inv.sellerPan || inv.seller_pan || PDF_SELLER.pan;
  const cinDisp = cin && cin !== '—' ? cin : '–';
  const panDisp = pan && pan !== '—' ? pan : '–';
  const msmeNo = inv.msmeRegistrationNo || inv.msme_registration_no || PDF_SELLER.msmeUdyamNo;
  const msmeClause = inv.msmeClause || inv.msme_clause || DEFAULT_MSME_CLAUSE;
  const msmeText = `MSME Udyam: ${msmeNo ? `${msmeNo} ` : ' '}${msmeClause ? msmeClause : ''}`;

  const billMonth = inv.billingMonth || inv.billing_month || '–';
  const billNo = inv.billNumber || inv.bill_number || '–';
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
  const orderDated = inv.poWoDate ? formatPdfDate(inv.poWoDate) : previewInvoiceDateStr;
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
  const metaRowsLeft = [
    ['Invoice No.', invoiceNo],
    ['Bill No.', billNo],
    ['Billing Month', billMonth],
    ['Billing Duration', billingDur],
  ];
  const metaRowsRight = [
    ['Dated', previewInvoiceDateStr],
    ['Mode/Terms of Payment', previewPaymentTerms],
    ["Buyer's Order No.", previewBuyerOrderNo],
    ['Order Dated', orderDated],
    ...(origTaxNo && (invoiceKind === 'credit_note' || invoiceKind === 'debit_note')
      ? [['Original Tax Invoice No.', String(origTaxNo)]]
      : []),
  ];
  const invoiceSubtotal = round2(previewTotal - previewCgst - previewSgst - previewIgst);
  const uiTitle = `${docTitle}   (ORIGINAL FOR RECIPIENT)${isEInvoicePreview ? '   e-Invoice' : ''}`;

  return (
    <div className="w-full bg-[#e8e8e8] p-4 sm:p-6">
      <div
        className="mx-auto w-full max-w-[780px] bg-white border border-[#ccc] text-[#1f2937]"
        style={{ fontFamily: "'Times New Roman', serif" }}
      >
        <div className="px-[28px] pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full border border-[#bbb] flex items-center justify-center text-[10px] font-bold text-[#1a3a6c] leading-tight text-center shrink-0">
              IFS
              <br />
              PVT
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold uppercase tracking-[0.3px] text-[#1a3a6c]">M/S INDUS FIRE SAFETY PRIVATE LIMITED</p>
              <p className="text-[8.5px] text-[#1a3a6c] mt-0.5">SECTION 31 OF GST ACT - 2017</p>
              <p className="text-[8px] mt-0.5">{PDF_SELLER.address}</p>
              <p className="text-[8px] mt-0.5">
                GSTIN/UIN: {PDF_SELLER.gstin} | State: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode} | PAN: {PDF_SELLER.pan || '–'}
              </p>
            </div>
            <div className="w-14 shrink-0">
              <div className="h-14 w-14 border border-[#bbb] bg-white grid place-items-center">
                {isEInvoicePreview && qrData ? (
                  <img src={qrData} alt="QR Code" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[7px] text-gray-500">QR</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-[28px]">
          <div className="border-y-2 border-[#1a3a6c] py-1 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-[#1a3a6c]">{uiTitle}</p>
          </div>
        </div>

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

        <div className="px-[28px]">
          <div className="border border-[#bbb] border-t-0 text-[8.5px]">
            <div className="grid grid-cols-2">
              <div className="px-2 py-2 space-y-1.5">
                {metaRowsLeft.map(([label, val]) => (
                  <p key={label} className="grid grid-cols-[110px_1fr] gap-2">
                    <span className="text-gray-600">{label}:</span>
                    <span className="font-bold text-black">{val}</span>
                  </p>
                ))}
              </div>
              <div className="px-2 py-2 space-y-1.5 border-l border-[#bbb]">
                {metaRowsRight.map(([label, val]) => (
                  <p key={label} className="grid grid-cols-[110px_1fr] gap-2">
                    <span className="text-gray-600">{label}:</span>
                    <span className="font-bold text-black">{val}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-[28px]">
          <div className="border-x border-b border-[#e6c800] bg-[#fffbe6] px-2 py-1">
            <p className="text-[8px] font-bold text-[#b7791f]">{msmeText}</p>
          </div>
        </div>

        <div className="px-[28px] pt-2">
          <div className="border border-[#bbb]">
            <div className="grid grid-cols-2">
              <div className="px-2 py-2 border-r border-[#bbb] text-[8.5px]">
                <p className="font-bold uppercase text-[#1a3a6c] border-b border-[#bbb] pb-1 mb-1">Buyer (Bill to)</p>
                <p className="font-bold">{buyerNameLine}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{buyerAddress}</p>
                <p className="mt-0.5">GSTIN/UIN: {buyerGstin}</p>
                <p>State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}</p>
                <p>Place of Supply: {placeOfSupply}</p>
              </div>
              <div className="px-2 py-2 text-[8.5px]">
                <p className="font-bold uppercase text-[#1a3a6c] border-b border-[#bbb] pb-1 mb-1">Consignee (Ship to)</p>
                <p className="font-bold">{buyerNameLine}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{shipAddress}</p>
                <p className="mt-0.5">GSTIN/UIN: {buyerGstin}</p>
                <p>State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}</p>
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

        <div className="px-[28px] pt-2">
          <table className="w-full border-collapse border border-[#bbb] text-[8px]">
            <thead>
              <tr className="bg-[#1a3a6c] text-white">
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[5%]">Sl.No</th>
                <th className="border border-[#bbb] px-1 py-1 text-left font-bold w-[40%]">Description of Goods</th>
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[10%]">HSN/SAC</th>
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[6%]">Qty</th>
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[11%]">Rate ({PDF_RS})</th>
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[6%]">UOM</th>
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[6%]">Disc.%</th>
                <th className="border border-[#bbb] px-1 py-1 text-center font-bold w-[16%]">Amount ({PDF_RS})</th>
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
                  <td className="border border-[#bbb] px-1 py-1 text-center">NO</td>
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
        </div>

        <div className="px-[28px]">
        <div className="grid grid-cols-[2fr_1fr] border-x border-b border-[#bbb] text-[8px]">
            <div className="px-2 py-2">
              <p className="font-bold uppercase text-[#1a3a6c] text-[8px]">BANK DETAILS</p>
              <div className="mt-1.5 space-y-1">
                <p className="flex justify-between"><span className="text-gray-600">A/c Holder Name</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.accountHolder}</span></p>
                <p className="flex justify-between"><span className="text-gray-600">Bank Name</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.bankName}</span></p>
                <p className="flex justify-between"><span className="text-gray-600">A/c No.</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.accountNo}</span></p>
                <p className="flex justify-between"><span className="text-gray-600">Branch & IFSC</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{BANK.branchAndIfsc}</span></p>
              </div>
              <div className="mt-3">
                <p className="text-gray-600">Total Quantity</p>
                <p className="text-[20px] font-bold text-[#1a3a6c]" style={{ fontFamily: "'Courier New', monospace" }}>
                  {formatAmountUpTo3Decimals(previewTotalQty)} <span className="text-[9px]">NO</span>
                </p>
              </div>
            </div>
            <div className="px-2 py-2 border-l border-[#bbb]">
              <p className="font-bold uppercase text-[#1a3a6c] text-[8px]">INVOICE SUMMARY</p>
              <div className="mt-1.5 space-y-1">
                <p className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(invoiceSubtotal)}</span></p>
                {previewCgst > 0 ? <p className="flex justify-between"><span className="text-gray-600">CGST @ {previewCgstRate}%</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(previewCgst)}</span></p> : null}
                {previewSgst > 0 ? <p className="flex justify-between"><span className="text-gray-600">SGST @ {previewSgstRate}%</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(previewSgst)}</span></p> : null}
                {previewIgst > 0 ? <p className="flex justify-between"><span className="text-gray-600">IGST @ {previewIgstRate}%</span><span className="font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{formatMoney2(previewIgst)}</span></p> : null}
              </div>
              <div className="border-t border-[#bbb] mt-2 pt-2">
                <div className="bg-[#1a3a6c] text-white px-2 py-1.5">
                  <p className="text-[7.5px]">Invoice Total</p>
                  <p className="text-[16px] font-bold" style={{ fontFamily: "'Courier New', monospace" }}>{PDF_RS} {formatInvoiceTotalDisplay(previewTotal)}</p>
                </div>
                <p className="text-right text-[7px] text-gray-500 mt-0.5">(E. &amp; O.E.)</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-[28px]">
          <div className="border-x border-b border-[#bbb] bg-[#f0f4fa] px-2 py-1.5">
            <p className="text-[7.5px] font-bold uppercase text-[#1a3a6c]">AMOUNT CHARGEABLE (IN WORDS)</p>
            <p className="text-[8.5px] italic font-bold mt-0.5">{amountInWords(previewTotal)}</p>
          </div>
        </div>

        <div className="px-[28px]">
          <div className="grid grid-cols-2 border-x border-b border-[#bbb] text-[7.5px]">
            <div className="px-2 py-2 border-r border-[#bbb]">
              <p className="font-bold uppercase text-[#1a3a6c]">TERMS & CONDITIONS</p>
              <ol className="mt-1 space-y-1 text-gray-600 leading-[1.6]">
                {termsLines.slice(0, 4).map((t, i) => (
                  <li key={i}>{i + 1}. {t}</li>
                ))}
              </ol>
            </div>
            <div className="px-2 py-2 text-right">
              <p className="text-gray-500">for M/s Indus Fire Safety Private Limited</p>
              <p className="font-bold text-[#1a3a6c] mt-0.5 text-[11px]">M/S INDUS FIRE SAFETY PRIVATE LIMITED</p>
              <div className="h-7" />
              <div className="w-[120px] border-b border-[#333] ml-auto" />
              <p className="text-center w-[120px] ml-auto mt-0.5">Authorised Signatory</p>
              <p className="text-gray-500 mt-2">Customer&apos;s Seal and Signature</p>
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
