import React from 'react';
import { formatExportCurrency } from './exportShared';

const tableClass = 'w-full border-collapse text-[11px] text-slate-900';
const thClass =
  'border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-bold uppercase tracking-wide';
const tdClass = 'border border-slate-300 px-2 py-1 align-top';
const tdRight = `${tdClass} text-right whitespace-nowrap`;

/** Reference Layout 1 — Overall SUMMARY sheet. */
export function OverallSummaryPreview({ rows, meta = {} }) {
  return (
    <div
      data-summary-export-root
      className="bg-white text-slate-900 p-6"
      style={{ width: '210mm', fontFamily: 'system-ui, Segoe UI, sans-serif' }}
    >
      <h1 className="text-base font-bold uppercase tracking-wide mb-1">Summary</h1>
      {meta.subtitle ? (
        <p className="text-xs text-slate-600 mb-3">{meta.subtitle}</p>
      ) : (
        <div className="mb-3" />
      )}
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={`${thClass} w-16`}>SR NO</th>
            <th className={thClass}>JOB DESCRIPTION</th>
            <th className={`${thClass} w-24`}>HSN CODE</th>
            <th className={`${thClass} w-28 text-right`}>SUPPLY</th>
            <th className={`${thClass} w-28 text-right`}>INSTALLATION</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.kind === 'main') {
              return (
                <tr key={`m-${idx}`} data-pdf-nosplit>
                  <td className={`${tdClass} font-bold`}>{row.srNo}</td>
                  <td className={`${tdClass} font-bold`}>{row.description}</td>
                  <td className={tdClass}>{row.hsnCode || ''}</td>
                  <td className={tdRight} />
                  <td className={tdRight} />
                </tr>
              );
            }
            if (row.kind === 'child') {
              return (
                <tr key={`c-${idx}`} data-pdf-nosplit>
                  <td className={tdClass}>{row.srNo}</td>
                  <td className={`${tdClass} pl-6`}>{row.description}</td>
                  <td className={tdClass}>{row.hsnCode || ''}</td>
                  <td className={tdRight}>{formatExportCurrency(row.supply)}</td>
                  <td className={tdRight}>{formatExportCurrency(row.installation)}</td>
                </tr>
              );
            }
            if (row.kind === 'total') {
              return (
                <tr key={`t-${idx}`} className="bg-slate-50 font-bold" data-pdf-nosplit>
                  <td className={tdClass} />
                  <td className={tdClass}>Total</td>
                  <td className={tdClass} />
                  <td className={tdRight}>{formatExportCurrency(row.supply)}</td>
                  <td className={tdRight}>{formatExportCurrency(row.installation)}</td>
                </tr>
              );
            }
            if (row.kind === 'grtotal') {
              return (
                <tr key={`g-${idx}`} className="bg-slate-200 font-bold" data-pdf-nosplit>
                  <td className={tdClass} />
                  <td className={tdClass}>GRTOTAL</td>
                  <td className={tdClass} />
                  <td className={tdRight} colSpan={1}>
                    {formatExportCurrency(row.combined)}
                  </td>
                  <td className={tdRight} />
                </tr>
              );
            }
            return null;
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Reference Layout 2 — Per–Main-Head detail sheet. */
export function MainHeadDetailPreview({ title, rows, meta = {} }) {
  return (
    <div
      data-summary-export-root
      className="bg-white text-slate-900 p-6"
      style={{ width: '210mm', fontFamily: 'system-ui, Segoe UI, sans-serif' }}
    >
      <h1 className="text-base font-bold uppercase tracking-wide mb-1">{title || 'Detail'}</h1>
      {meta.subtitle ? (
        <p className="text-xs text-slate-600 mb-3">{meta.subtitle}</p>
      ) : (
        <div className="mb-3" />
      )}
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={`${thClass} w-14`}>Sr. No.</th>
            <th className={thClass}>Description</th>
            <th className={`${thClass} w-14`}>Unit</th>
            <th className={`${thClass} w-14 text-right`}>Qty</th>
            <th className={`${thClass} w-24 text-right`}>Rate (Supply)</th>
            <th className={`${thClass} w-24 text-right`}>Total (Supply)</th>
            <th className={`${thClass} w-28 text-right`}>Rate (Installation)</th>
            <th className={`${thClass} w-28 text-right`}>Total (Installation)</th>
            <th className={`${thClass} w-20`}>Make</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.kind === 'childHeader') {
              return (
                <tr key={`ch-${idx}`} className="bg-slate-100 font-bold" data-pdf-nosplit>
                  <td className={tdClass}>{row.srNo}</td>
                  <td className={tdClass}>{row.description}</td>
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                </tr>
              );
            }
            if (row.kind === 'item') {
              return (
                <tr key={`i-${idx}`} data-pdf-nosplit>
                  <td className={tdClass}>{row.srNo}</td>
                  <td className={tdClass}>
                    <div>{row.description}</div>
                    {row.note ? (
                      <div className="text-[10px] text-slate-600 mt-0.5 whitespace-pre-wrap">{row.note}</div>
                    ) : null}
                  </td>
                  <td className={tdClass}>{row.unit || ''}</td>
                  <td className={tdRight}>{row.qty ?? ''}</td>
                  <td className={tdRight}>{formatExportCurrency(row.supplyRate)}</td>
                  <td className={tdRight}>{formatExportCurrency(row.supplyTotal)}</td>
                  <td className={tdRight}>{formatExportCurrency(row.installationRate)}</td>
                  <td className={tdRight}>{formatExportCurrency(row.installationTotal)}</td>
                  <td className={tdClass}>{row.make || ''}</td>
                </tr>
              );
            }
            if (row.kind === 'childTotal') {
              return (
                <tr key={`ct-${idx}`} className="bg-slate-50 font-bold" data-pdf-nosplit>
                  <td className={tdClass} />
                  <td className={tdClass}>Total</td>
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdRight}>{formatExportCurrency(row.supplyTotal)}</td>
                  <td className={tdClass} />
                  <td className={tdRight}>{formatExportCurrency(row.installationTotal)}</td>
                  <td className={tdClass} />
                </tr>
              );
            }
            if (row.kind === 'grandTotal') {
              return (
                <tr key={`gt-${idx}`} className="bg-slate-200 font-bold" data-pdf-nosplit>
                  <td className={tdClass} />
                  <td className={tdClass}>Grand Total</td>
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdClass} />
                  <td className={tdRight}>{formatExportCurrency(row.supplyTotal)}</td>
                  <td className={tdClass} />
                  <td className={tdRight}>{formatExportCurrency(row.installationTotal)}</td>
                  <td className={tdClass} />
                </tr>
              );
            }
            return null;
          })}
        </tbody>
      </table>
    </div>
  );
}
