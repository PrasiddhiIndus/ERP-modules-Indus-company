import React from 'react';
import {
  SELLER as PDF_SELLER,
  BANK,
  JURISDICTION,
  FOOTER_ADDRESS,
  FOOTER_PHONE,
  FOOTER_EMAIL,
  FOOTER_WEB,
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
  const previewOrderDateStr = inv.poWoDate ? formatPdfDate(inv.poWoDate) : previewInvoiceDateStr;
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
  const msmeClause = inv.msmeClause || inv.msme_clause || (msmeNo ? DEFAULT_MSME_CLAUSE : '');

  const billNo = inv.billNumber || inv.bill_number || '–';
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

  const origTaxNo =
    inv.originalTaxInvoiceNumber ||
    inv.original_tax_invoice_number ||
    inv.parentTaxInvoiceNumber ||
    inv.parent_tax_invoice_number;
  const metaRows = [
    ['Invoice No.', invoiceNo],
    ...(origTaxNo && (invoiceKind === 'credit_note' || invoiceKind === 'debit_note')
      ? [['Original Tax Invoice No.', String(origTaxNo)]]
      : []),
    ['Bill No.', billNo],
    ['Billing Month', billMonth],
    ['Billing Duration', billingDur],
    ['Dated', previewInvoiceDateStr],
    ['Mode/Terms of Payment', previewPaymentTerms],
    ["Buyer's Order No.", previewBuyerOrderNo],
    ['Order Dated', previewOrderDateStr],
  ];

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white border border-gray-400 shadow-md text-[11px] sm:text-xs text-gray-900 leading-snug">
      <div className="bg-[rgb(22,58,112)] text-white px-4 py-2.5 flex items-center gap-3">
        <div className="shrink-0 bg-white rounded-none border border-white/70 p-0.5">
          <img src={INDUS_LOGO_SRC} alt="" className="h-[3.5rem] w-[3.5rem] object-contain" width={56} height={56} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base sm:text-lg font-bold uppercase tracking-tight leading-tight">{PDF_SELLER.name}</p>
          <p className="text-[10px] sm:text-xs opacity-90 mt-1">SECTION 31 OF GST ACT - 2017</p>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-300 flex items-start gap-2">
        <div className="hidden sm:block w-[10rem] shrink-0" aria-hidden />
        <p className="flex-1 text-center text-sm sm:text-base font-bold tracking-wide min-w-0">{docTitle}</p>
        <p className="w-[10rem] shrink-0 text-right text-[10px] text-gray-600 leading-tight pt-0.5">(ORIGINAL FOR RECIPIENT)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3 border-b border-gray-300 sm:divide-x sm:divide-gray-300">
        <div className="sm:pr-4">
          <p className="font-bold text-gray-900">{PDF_SELLER.name}</p>
          <p className="text-gray-800 mt-1">{PDF_SELLER.address}</p>
          <p className="mt-1">GSTIN/UIN: <span className="font-mono">{PDF_SELLER.gstin}</span></p>
          <p>State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}</p>
          <p className="mt-1">CIN: <span className="font-mono">{cinDisp}</span></p>
          <p>PAN: <span className="font-mono">{panDisp}</span></p>
          <p className="mt-1 font-bold">MSME Udyam: <span className="font-mono font-bold">{msmeNo || '–'}</span></p>
          {msmeClause ? <p className="mt-1 text-gray-800 leading-snug">{msmeClause}</p> : null}
        </div>
        <div className="sm:pl-4 space-y-1.5">
          {metaRows.map(([label, val]) => (
            <div key={label} className="grid grid-cols-1 min-[420px]:grid-cols-[10.5rem_1fr] gap-x-2 gap-y-0.5 text-left items-start">
              <span className="font-semibold">{label}:</span>
              <span className="min-w-0 break-words">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3 border-b border-gray-300 sm:divide-x sm:divide-gray-300">
        <div className="sm:pr-4">
          <p className="font-bold text-gray-900 mb-1">Buyer (Bill to)</p>
          <p className="font-semibold">{buyerNameLine}</p>
          <p className="text-gray-800 mt-1 whitespace-pre-wrap">{buyerAddress}</p>
          <p className="mt-1">GSTIN/UIN: <span className="font-mono">{buyerGstin}</span></p>
          <p>State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}</p>
          <p className="mt-1"><span className="font-semibold">Place of Supply:</span> {placeOfSupply}</p>
        </div>
        <div className="sm:pl-4">
          <p className="font-bold text-gray-900 mb-1">Consignee (Ship to)</p>
          <p className="font-semibold">{buyerNameLine}</p>
          <p className="text-gray-800 mt-1 whitespace-pre-wrap">{shipAddress}</p>
          <p className="mt-1">GSTIN/UIN: <span className="font-mono">{buyerGstin}</span></p>
          <p>State Name: {PDF_SELLER.state}, Code: {PDF_SELLER.stateCode}</p>
        </div>
      </div>

      <div className="mx-4 my-3 border border-gray-400 bg-[#fcfcfd] rounded-sm overflow-hidden">
        <p className="text-[10px] font-bold text-gray-700 px-2 pt-2">Description / Remarks</p>
        <p className="text-gray-800 px-2 pb-2 pt-1 whitespace-pre-wrap leading-snug">{remarksText}</p>
      </div>

      <div className="px-2 sm:px-3 py-2 overflow-x-auto border-b border-gray-300">
        <table className="w-full min-w-[640px] border-collapse border border-slate-400 text-[10px] sm:text-[11px]">
          <thead>
            <tr className="bg-[#e1e8f4] text-slate-900">
              <th className="border border-slate-400 px-1.5 py-1.5 text-center font-semibold w-9">Sl.<br />No.</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-left font-semibold min-w-[8rem]">Description of Goods</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-center font-semibold w-14">HSN/SAC</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold w-14 tabular-nums">Qty</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold w-[4.5rem] tabular-nums">Rate ({PDF_RS})</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-center font-semibold w-10">UOM</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-center font-semibold w-10">Disc.<br />%</th>
              <th className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold w-[5rem] tabular-nums">Amount ({PDF_RS})</th>
            </tr>
          </thead>
          <tbody>
            {previewItems.length ? previewItems.map((it, idx) => (
              <tr key={idx} className="align-top">
                <td className="border border-slate-400 px-1.5 py-1.5 text-center tabular-nums">{idx + 1}</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-left leading-snug">{(it.description || it.designation || '–').slice(0, 120)}</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-center font-mono">{it.hsnSac || inv.hsnSac || '–'}</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right tabular-nums">{formatAmountUpTo3Decimals(it.quantity || 0)}</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right tabular-nums">{formatMoney2(it.rate || 0)}</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-center">NO</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-center text-gray-500">—</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right tabular-nums">{formatMoney2(it.amount || 0)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="border border-slate-400 px-2 py-3 text-center text-gray-500">No line items</td>
              </tr>
            )}
            {previewGstMode === 'intra' && previewCgst > 0 && (
              <tr className="bg-slate-50">
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold" colSpan={7}>CGST @ {previewCgstRate}%</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold tabular-nums">{formatMoney2(previewCgst)}</td>
              </tr>
            )}
            {previewGstMode === 'intra' && previewSgst > 0 && (
              <tr className="bg-slate-50">
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold" colSpan={7}>SGST @ {previewSgstRate}%</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold tabular-nums">{formatMoney2(previewSgst)}</td>
              </tr>
            )}
            {previewGstMode === 'inter' && previewIgst > 0 && (
              <tr className="bg-slate-50">
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold" colSpan={7}>IGST @ {previewIgstRate}%</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold tabular-nums">{formatMoney2(previewIgst)}</td>
              </tr>
            )}
            {previewGstMode === 'sez_zero' && (
              <tr className="bg-slate-50">
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold" colSpan={7}>GST @ 0% (SEZ / nil rated)</td>
                <td className="border border-slate-400 px-1.5 py-1.5 text-right font-semibold tabular-nums">{formatMoney2(0)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap justify-between items-baseline gap-2 mt-2 text-[10px] sm:text-[11px] px-1">
          <span className="font-semibold tabular-nums">Total Quantity: {formatAmountUpTo3Decimals(previewTotalQty)} NO</span>
          <span className="font-semibold tabular-nums text-right">
            Invoice Total: {PDF_RS} {formatInvoiceTotalDisplay(previewTotal)} <span className="font-normal text-gray-600">(E. &amp; O.E.)</span>
          </span>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-gray-300">
        <p className="font-bold text-gray-900">Amount Chargeable (in words)</p>
        <p className="text-gray-800 mt-1">{amountInWords(previewTotal)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 py-3 border-b border-gray-300 sm:divide-x sm:divide-gray-300">
        <div className="sm:pr-4">
          <p className="font-bold text-gray-900 mb-1">Bank Details</p>
          <p className="text-gray-800">A/c Holder&apos;s Name: {BANK.accountHolder}</p>
          <p className="text-gray-800">Bank Name: {BANK.bankName}</p>
          <p className="text-gray-800">A/c No.: {BANK.accountNo}</p>
          <p className="text-gray-800">Branch &amp; IFS Code: {BANK.branchAndIfsc}</p>
          <p className="mt-3 text-gray-800">for {PDF_SELLER.name}</p>
          <p className="font-semibold mt-1">Authorised Signatory</p>
        </div>
        <div className="sm:pl-4">
          <p className="font-bold text-gray-900 mb-1">Terms &amp; Conditions</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-800">
            {termsLines.map((t, i) => (
              <li key={i} className="pl-0.5">{t}</li>
            ))}
          </ol>
          <p className="mt-3 italic text-gray-800">Customer&apos;s Seal and Signature</p>
          {typeof sig === 'string' && sig.startsWith('data:image/') ? (
            <div className="mt-3 flex flex-col items-end">
              <img src={sig} alt="" className="max-h-16 max-w-[10rem] object-contain border border-gray-200 rounded" />
              <p className="text-[10px] text-gray-600 mt-1">Digital Signature</p>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-center font-bold text-sm py-2 border-b border-gray-300">{JURISDICTION}</p>

      <div className="bg-[rgb(165,42,42)] text-white px-4 py-2.5 text-[10px] sm:text-[11px] leading-relaxed">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Phone: {FOOTER_PHONE}</span>
          <span>Email: {FOOTER_EMAIL}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1">
          <span>Website: {FOOTER_WEB}</span>
          <span className="opacity-95 max-w-[55%] min-w-[12rem]">{FOOTER_ADDRESS}</span>
        </div>
      </div>
    </div>
  );
}
