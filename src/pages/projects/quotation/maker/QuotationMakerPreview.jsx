import React, { useMemo } from 'react';
import {
  QUOTATION_TYPES,
  buildColumnKeys,
  columnLabel,
  columnTotal,
  computeTotals,
  expandDisplayRows,
  formatMoneyIn,
  headingColumnTotal,
  isGroup,
  lineAmount,
  normalizeType,
  numberOf,
  rowTotal,
} from './quotationMakerModel';
import { formatDateDdMmYyyy } from '../../../../utils/dateDisplay';

function PreviewTableHead({ type, colKeys }) {
  return (
    <tr>
      {colKeys.map((key) => {
        const label = columnLabel(key, type);
        if (
          key === 'supply_unit' ||
          key === 'supply_total' ||
          key === 'install_unit' ||
          key === 'install_total'
        ) {
          const parts = String(label).split(' ');
          if (parts.length >= 2) {
            return (
              <th key={key} className="qm-th-amt">
                {parts[0]}
                <br />
                {parts.slice(1).join(' ')}
              </th>
            );
          }
        }
        const cls =
          key === 'sr'
            ? 'qm-th-sr'
            : key === 'unit'
              ? 'qm-th-unit'
              : key === 'qty'
                ? 'qm-th-qty'
                : key === 'description' || key === 'make' || key === 'remarks'
                  ? 'qm-th-desc'
                  : 'qm-th-amt';
        return (
          <th key={key} className={cls}>
            {label}
          </th>
        );
      })}
    </tr>
  );
}

function PreviewRow({ rows, r, type, colKeys }) {
  const mode = normalizeType(type);

  if (r.row_type === 'heading_total') {
    const hid = r.heading_id;
    const heading = (rows || []).find((x) => x.id === hid);
    return (
      <tr className="qm-heading-total" data-pdf-nosplit>
        {colKeys.map((key) => {
          if (key === 'sr') return <td key={key} className="qm-num-cell" />;
          if (key === 'description') {
            return (
              <td key={key} className="qm-desc-cell">
                <b>Total — {r.description || 'Section'}</b>
              </td>
            );
          }
          if (key === 'supply_total') {
            return (
              <td key={key} className="qm-amt-cell">
                <b>{formatMoneyIn(headingColumnTotal(rows, hid, 'supply'))}</b>
              </td>
            );
          }
          if (key === 'install_total') {
            return (
              <td key={key} className="qm-amt-cell">
                <b>{formatMoneyIn(headingColumnTotal(rows, hid, 'inst'))}</b>
              </td>
            );
          }
          if (key === 'total') {
            return (
              <td key={key} className="qm-amt-cell">
                <b>{formatMoneyIn(rowTotal(rows, heading, mode))}</b>
              </td>
            );
          }
          return <td key={key} />;
        })}
      </tr>
    );
  }

  if (r.row_type === 'heading') {
    return (
      <tr className="qm-heading" data-pdf-nosplit>
        <td className="qm-num-cell" />
        <td className="qm-desc-cell" colSpan={Math.max(1, colKeys.length - 1)}>
          <b>{r.description}</b>
        </td>
      </tr>
    );
  }

  const no = numberOf(rows, r);
  if (isGroup(rows, r)) {
    return (
      <tr data-pdf-nosplit>
        <td className="qm-num-cell">{no}</td>
        <td className="qm-desc-cell">
          <b>{r.description}</b>
        </td>
        <td className="qm-desc-cell" colSpan={Math.max(1, colKeys.length - 2)}>
          <i>Priced through parts</i>
        </td>
      </tr>
    );
  }

  const q = Number(r.qty) || 0;
  const cells = colKeys.map((key) => {
    switch (key) {
      case 'sr':
        return (
          <td key={key} className="qm-num-cell">
            {no}
          </td>
        );
      case 'description':
        return (
          <td key={key} className={`qm-desc-cell${r.parent_row_id ? ' qm-part' : ''}`}>
            {r.parent_row_id ? <span className="qm-indent">{r.description}</span> : r.description}
          </td>
        );
      case 'unit':
        return (
          <td key={key} className="qm-unit-cell">
            {r.unit || '—'}
          </td>
        );
      case 'qty':
        return (
          <td key={key} className="qm-qty-cell">
            {q}
          </td>
        );
      case 'make':
        return (
          <td key={key} className="qm-desc-cell">
            {r.make || '—'}
          </td>
        );
      case 'remarks':
        return (
          <td key={key} className="qm-desc-cell">
            {r.remarks || '—'}
          </td>
        );
      case 'price_unit': {
        const rate =
          mode === 'normal' ? r.rate : mode === 'supply' ? r.supply_rate : r.install_rate;
        return (
          <td key={key} className="qm-amt-cell">
            {formatMoneyIn(rate)}
          </td>
        );
      }
      case 'supply_unit':
        return (
          <td key={key} className="qm-amt-cell">
            {formatMoneyIn(r.supply_rate)}
          </td>
        );
      case 'install_unit':
        return (
          <td key={key} className="qm-amt-cell">
            {formatMoneyIn(r.install_rate)}
          </td>
        );
      case 'supply_total':
        return (
          <td key={key} className="qm-amt-cell">
            {formatMoneyIn(lineAmount(r, 'supply'))}
          </td>
        );
      case 'install_total':
        return (
          <td key={key} className="qm-amt-cell">
            {formatMoneyIn(lineAmount(r, 'inst'))}
          </td>
        );
      case 'total':
        return (
          <td key={key} className="qm-amt-cell">
            <b>{formatMoneyIn(rowTotal(rows, r, mode))}</b>
          </td>
        );
      default:
        return null;
    }
  });

  return <tr data-pdf-nosplit>{cells}</tr>;
}

export default function QuotationMakerPreview({ form, rows }) {
  const type = normalizeType(form.quotation_type);
  const t = QUOTATION_TYPES[type];
  const totals = computeTotals(rows, type);
  const dateLabel = formatDateDdMmYyyy(form.quote_date) || form.quote_date || '—';
  const si = t.pricing === 2;
  const terms = (form.terms || []).map((s) => String(s || '').trim()).filter(Boolean);
  const colKeys = useMemo(
    () =>
      buildColumnKeys(type, {
        showMake: form.show_make,
        showRemarks: form.show_remarks,
        makeBefore: form.make_column_before || 'unit',
      }).filter((k) => k !== 'actions'),
    [type, form.show_make, form.show_remarks, form.make_column_before]
  );
  const displayRows = useMemo(() => expandDisplayRows(rows), [rows]);

  return (
    <div className="qm-preview-shell">
      <div className="quotation-preview qm-preview" id="qm-preview">
        <div className="qm-phead" data-pdf-nosplit>
          <div className="qm-co">
            <img
              src={`${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}indus-logo.png`}
              alt="Indus Fire Safety"
              className="qm-logo"
            />
            <div>
              <b>INDUS FIRE SAFETY PVT. LTD.</b>
              <div className="qm-tag">Sentinel of Industrial safety</div>
              <div className="qm-iso">ISO 9001 : 2015 Certified Company</div>
            </div>
          </div>
          <div className="qm-refblock">
            <b>QUOTATION</b>
            <div className="qp-line">Ref: {form.quotation_no || '—'}</div>
            <div>Date: {dateLabel}</div>
          </div>
        </div>

        <p className="qm-to" data-pdf-nosplit>
          <b>To,</b>
          <br />
          {form.client_contact || '—'}
          <br />
          {form.client_company || '—'}
          <br />
          {form.client_address || '—'}
        </p>

        <p className="qm-subj" data-pdf-nosplit>
          <b>Subject:</b> {form.subject || t.subject}
        </p>

        <p className="qm-greet" data-pdf-nosplit>
          Dear Sir,
          <br />
          We are thankful for your enquiry. Please find our offer below.
        </p>

        <div className="qm-preview-table-wrap">
          <table
            className={`qm-ptable${si ? ' qm-si' : ''}${form.show_make || form.show_remarks ? ' qm-extra' : ''}`}
          >
            <thead>
              <PreviewTableHead type={type} colKeys={colKeys} />
            </thead>
            <tbody>
              {displayRows.length ? (
                displayRows.map((r) => (
                  <PreviewRow key={r.id} rows={rows} r={r} type={type} colKeys={colKeys} />
                ))
              ) : (
                <tr>
                  <td colSpan={colKeys.length}>No items yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="qm-totals" data-pdf-nosplit>
          <div className="qm-tbox">
            {si ? (
              <>
                <div>
                  <span>Supply total</span>
                  <span>₹ {formatMoneyIn(columnTotal(rows, 'supply'))}</span>
                </div>
                <div>
                  <span>Installation total</span>
                  <span>₹ {formatMoneyIn(columnTotal(rows, 'inst'))}</span>
                </div>
              </>
            ) : null}
            <div className="qm-grand">
              <span>Grand total</span>
              <span>₹ {formatMoneyIn(totals.grand_total)}</span>
            </div>
          </div>
        </div>

        <h3 className="qm-terms-title" data-pdf-nosplit>
          Terms and Conditions
        </h3>
        <ol className="qm-terms">
          {terms.map((line, i) => (
            <li key={i} data-pdf-nosplit>
              {line}
            </li>
          ))}
        </ol>

        <p className="qm-sign" data-pdf-nosplit>
          Thanks &amp; regards
          <br />
          <b>{form.signatory_name || '—'}</b>
          <br />
          {form.signatory_designation || ''}
          <br />
          Indus Fire Safety Pvt Ltd.
        </p>
      </div>
    </div>
  );
}
