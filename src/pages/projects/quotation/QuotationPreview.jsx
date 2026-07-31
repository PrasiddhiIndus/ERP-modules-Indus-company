import React from 'react';
import { applyTermsPlaceholders } from '../../../services/quotationApi';
import { displayDescription, displaySrNo } from './pricingEngine';
import { formatCurrency, formatDisplayDate } from './quotationConstants';
import { QUOTATION_LETTERHEAD_SRC } from './quotationPrint.js';
import './quotationPrint.css';

/**
 * Client-facing Offer Format preview (columns A–J equivalent).
 */
export default function QuotationPreview({ form, lines }) {
  const terms = applyTermsPlaceholders(form.terms_text || '', {
    validityDays: form.validity_days,
    deliveryPeriod: form.delivery_period,
  });

  return (
    <div className="quotation-preview bg-white text-slate-900 max-w-3xl mx-auto border border-slate-200 shadow-sm">
      <div className="qp-body px-8 py-6">
        <header className="qp-header">
          <div className="qp-title-wrap">
            <h1 className="qp-title">QUOTATION</h1>
          </div>
          <div className="qp-letterhead">
            <img src={QUOTATION_LETTERHEAD_SRC} alt="Indus Fire Safety Pvt. Ltd." />
          </div>
        </header>

        <section className="qp-block qp-meta">
          <p className="qp-line">
            <span className="qp-label">Ref:</span> {form.offer_no || '—'}
          </p>
          <p className="qp-line">
            <span className="qp-label">Date:</span> {formatDisplayDate(form.offer_date)}
          </p>
        </section>

        <section className="qp-block qp-recipient">
          <p className="qp-line">To,</p>
          <p className="qp-line qp-name">{form.contact_person || '—'}</p>
          <p className="qp-line">{form.client_name || '—'}</p>
          <p className="qp-line">{form.location || '—'}</p>
          <p className="qp-line">Contact No: {form.contact_no || '—'}</p>
          <p className="qp-line">Mail Id: {form.email_id || '—'}</p>
        </section>

        <section className="qp-block">
          <p className="qp-line">
            <span className="qp-label">Subject:</span> {form.subject || form.scope || '—'}
          </p>
        </section>

        <section className="qp-block">
          <p className="qp-paragraph">Dear Sir,</p>
          <p className="qp-paragraph">We are thankful for your enquiry on the subject.</p>
        </section>

        {(form.cover_letter_text || '')
          .split(/\n\n+/)
          .filter(Boolean)
          .map((para, i) => (
            <p key={i} className="qp-paragraph">
              {para.trim()}
            </p>
          ))}

        <p className="qp-annexure">ANNEXURE:A</p>

        <div className="qp-table-wrap overflow-x-auto">
          <table className="qp-table w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="col-sr">Sr. No.</th>
                <th className="col-desc">Description</th>
                <th className="col-qty">Qty</th>
                <th className="col-unit">Unit</th>
                <th className="col-rate">Supply &amp; Installation Unit Rate</th>
                <th className="col-amt">Supply &amp; Installation Amount</th>
                <th className="col-remarks">Remarks</th>
                <th className="col-make">Make</th>
              </tr>
            </thead>
            <tbody>
              {(lines || []).map((line) => (
                <tr key={line.id} className={line.row_type === 'section' ? 'section-row bg-slate-50 font-semibold' : ''}>
                  <td>{displaySrNo(line)}</td>
                  <td>{displayDescription(line)}</td>
                  <td className="text-right">{line.row_type === 'section' ? '' : line.qty}</td>
                  <td>{line.row_type === 'section' ? '' : line.unit}</td>
                  <td className="text-right">{line.row_type === 'section' ? '' : formatCurrency(line.unit_rate)}</td>
                  <td className="text-right">{line.row_type === 'section' ? '' : formatCurrency(line.line_amount)}</td>
                  <td>{line.remarks || ''}</td>
                  <td>{line.make || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="qp-total">Total Amount: {formatCurrency(form.quoted_rate)}</p>

        <section className="qp-block">
          <div className="qp-terms-title">Terms and Conditions</div>
          <div className="qp-terms">{terms}</div>
        </section>

        <p className="qp-closing">
          Hope, you will find our offer as most competitive in the market. We look forward to be associated with your
          esteemed organization through our qualitative services!
        </p>

        <section className="qp-signature">
          <p className="qp-line">Thanks &amp; regards</p>
          <p className="qp-signature-name">{form.prepared_by_name || form.owner_name || '—'}</p>
          {form.prepared_by_designation ? <p className="qp-line">{form.prepared_by_designation}</p> : null}
        </section>

        <footer className="qp-footer">Indus Fire Safety Pvt Ltd.</footer>
      </div>
    </div>
  );
}
