import React, { forwardRef } from "react";

const formatInr = (num) =>
  `INR ${Math.round(Number(num) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

// Turn the free-text terms into a), b), c) … lines (stripping any existing marker).
const buildTermLines = (terms) => {
  if (!terms) return [];
  return terms
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^([•\-–]|\(?[a-zA-Z0-9]+[).]|[0-9]+\.)\s*/, "").trim());
};

/**
 * A4-styled quotation document. This is the SINGLE source of truth for the
 * quotation layout: it is shown on screen as a live preview and the very same
 * node is rasterised to PDF, so the exported PDF and the e-mail attachment look
 * exactly like what the user sees.
 *
 * Width is fixed to 794px (~210mm at 96dpi) so the on-screen preview and the
 * PDF share identical proportions.
 */
const QuotationDocument = forwardRef(function QuotationDocument(
  { quotation, items = [], logoSrc, signatureSrc },
  ref
) {
  const grandTotal = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  const termLines = buildTermLines(quotation?.terms);

  const addressLines = [
    quotation?.street,
    quotation?.street2,
    [quotation?.city, quotation?.state, quotation?.zip].filter(Boolean).join(", "),
    quotation?.country,
  ].filter(Boolean);

  return (
    <div
      ref={ref}
      style={{ width: 794 }}
      className="mx-auto bg-white px-12 py-10 text-slate-900"
    >
      {/* Header: ref/date + logo */}
      <div className="flex items-start justify-between">
        <div className="text-[12px] leading-5">
          <p className="font-bold">
            Ref. No.: {quotation?.base_quotation_no || quotation?.quotation_number || "—"}
          </p>
          <p className="font-bold">Date: {quotation?.date || "—"}</p>
          {quotation?.template ? (
            <p className="font-bold">Category: {quotation.template}</p>
          ) : null}
        </div>
        {logoSrc ? (
          <img src={logoSrc} alt="Indus Fire Safety" crossOrigin="anonymous" className="h-20 w-auto object-contain" />
        ) : null}
      </div>

      {/* To block */}
      <div className="mt-6 text-[13px] leading-6">
        <p>To,</p>
        <p className="font-bold">{quotation?.client || "—"}</p>
        {addressLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {/* Subject */}
      {quotation?.subject ? (
        <p className="mt-6 text-[14px] font-bold leading-6">Subject: {quotation.subject}</p>
      ) : null}

      {/* Greeting */}
      <p className="mt-4 text-[13px] leading-6">Dear Sir/Madam,</p>

      {/* Body */}
      {quotation?.body ? (
        <p className="mt-2 whitespace-pre-line text-[13px] leading-6" style={{ textAlign: "justify" }}>
          {quotation.body}
        </p>
      ) : null}

      {/* Part-1: Commercial offer */}
      <h3 className="mt-7 text-[14px] font-bold">Part-1: Commercial offer</h3>
      <table className="mt-2 w-full border-collapse text-[12px]" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th
              className="border border-slate-300 px-3 py-2 text-left font-bold text-white"
              style={{ backgroundColor: "#2980b9", width: "52%" }}
            >
              Cost Components
            </th>
            <th
              className="border border-slate-300 px-3 py-2 text-center font-bold text-white"
              style={{ backgroundColor: "#2980b9", width: "12%" }}
            >
              Qty
            </th>
            <th
              className="border border-slate-300 px-3 py-2 text-right font-bold text-white"
              style={{ backgroundColor: "#2980b9", width: "18%" }}
            >
              Rate
            </th>
            <th
              className="border border-slate-300 px-3 py-2 text-right font-bold text-white"
              style={{ backgroundColor: "#2980b9", width: "18%" }}
            >
              Total Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                No items.
              </td>
            </tr>
          ) : (
            items.map((it, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 1 ? "#f8f9fa" : "#ffffff" }}>
                <td className="border border-slate-300 px-3 py-2 align-top">{it.description}</td>
                <td className="border border-slate-300 px-3 py-2 text-center align-top">{it.qty}</td>
                <td className="border border-slate-300 px-3 py-2 text-right align-top">{formatInr(it.rate)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right align-top">{formatInr(it.total)}</td>
              </tr>
            ))
          )}
          <tr>
            <td
              colSpan={3}
              className="border border-slate-300 px-3 py-2 text-right font-bold"
              style={{ backgroundColor: "#e6f0ff" }}
            >
              Grand Total
            </td>
            <td
              className="border border-slate-300 px-3 py-2 text-right font-bold"
              style={{ backgroundColor: "#e6f0ff" }}
            >
              {formatInr(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Part-2: Terms & Conditions */}
      <h3 className="mt-7 text-[14px] font-bold">Part-2: Terms &amp; Conditions:</h3>
      {termLines.length > 0 ? (
        <div className="mt-2 text-[12.5px] leading-6">
          {termLines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 font-medium">{String.fromCharCode(97 + i)})</span>
              <span style={{ textAlign: "justify" }}>{line}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] italic text-slate-400">No terms added.</p>
      )}

      {/* Signature */}
      <div className="mt-8 text-[13px] leading-6">
        <p>For Indus Fire Safety Pvt. Ltd.</p>
        {signatureSrc ? (
          <img
            src={signatureSrc}
            alt="Signature"
            crossOrigin="anonymous"
            className="mt-2 h-16 w-40 object-contain"
          />
        ) : (
          <div className="mt-2 h-16 w-40 border border-slate-300" />
        )}
        <p className="mt-1 font-bold">{quotation?.signedBy || "Authorized Signatory"}</p>
        <p>Authorized Signatory</p>
      </div>
    </div>
  );
});

export default QuotationDocument;
