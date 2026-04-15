import React, { useMemo, useState } from 'react';
import { FileWarning, ArrowRight, ClipboardList } from 'lucide-react';
import { roundInvoiceAmount } from '../../../utils/invoiceRound';

const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function requestStatus(inv) {
  return inv.cnDnRequestStatus || inv.cn_dn_request_status || null;
}

function noteTypeLabel(inv) {
  return (inv.cnDnRequestNoteType || inv.cn_dn_request_note_type) === 'debit' ? 'Debit' : 'Credit';
}

function formatReqDt(iso) {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function invoiceAmount(inv) {
  return roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0);
}

const tableShellClass = 'rounded-xl border border-slate-200/90 overflow-hidden bg-gradient-to-br from-red-50/35 via-white to-amber-50/25 ring-1 ring-slate-900/5';
const innerClass = 'p-2';
const whiteWrapClass = 'bg-white rounded-lg overflow-hidden';
const scrollClass = 'w-full max-w-full min-w-0 overflow-x-auto';

const thBase =
  'px-3 py-2.5 text-left text-xs font-bold text-gray-900 border-b border-red-100/60';
const tdBase = 'px-3 py-2 text-xs text-gray-800 align-top';
const tdMono = `${tdBase} font-mono tabular-nums`;
const tdNum = `${tdBase} text-right tabular-nums`;

function StatusTable({ title, subtitle, rows, columns, emptyMessage, badgeClass, tableMinWidthClass = 'min-w-[760px]' }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          {subtitle ? <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p> : null}
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
        >
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center">
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className={tableShellClass}>
          <div className={innerClass}>
            <div className={whiteWrapClass}>
              <div className={scrollClass}>
                <table className={`w-full ${tableMinWidthClass} table-auto border-collapse`}>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          className={`${thBase} whitespace-nowrap ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {rows.map((inv) => (
                      <tr key={String(inv.id)} className="hover:bg-gray-50/80">
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={
                              c.align === 'right'
                                ? tdNum
                                : c.mono
                                  ? tdMono
                                  : `${tdBase} ${c.align === 'center' ? 'text-center' : 'text-left'}`
                            }
                          >
                            {c.render(inv)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Request Commercial approval to raise a credit/debit note against a saved tax invoice.
 * Used on Create Invoice (CN/DN tab) and can be reused elsewhere with the same billing context.
 */
export default function RequestCnDnApprovalSection({ invoices, setInvoices, onNavigateTab }) {
  const [invoiceId, setInvoiceId] = useState('');
  const [noteType, setNoteType] = useState('credit');
  const [reason, setReason] = useState('');

  const eligible = useMemo(
    () =>
      (invoices || []).filter((inv) => {
        const k = String(inv.invoiceKind || inv.invoice_kind || 'tax').toLowerCase();
        return k !== 'proforma' && k !== 'draft';
      }),
    [invoices]
  );

  const pendingList = useMemo(
    () => (invoices || []).filter((inv) => requestStatus(inv) === STATUS.PENDING),
    [invoices]
  );

  const approvedList = useMemo(
    () => (invoices || []).filter((inv) => requestStatus(inv) === STATUS.APPROVED),
    [invoices]
  );

  const rejectedList = useMemo(
    () => (invoices || []).filter((inv) => requestStatus(inv) === STATUS.REJECTED),
    [invoices]
  );

  const selected = eligible.find((i) => String(i.id) === String(invoiceId));

  const submitRequest = () => {
    if (!selected) return;
    const st = requestStatus(selected);
    if (st === STATUS.PENDING || st === STATUS.APPROVED) {
      window.alert(
        'This invoice already has a pending or approved CN/DN request. Open Credit / Debit Notes from the sidebar to approve or issue.'
      );
      return;
    }
    const r = reason.trim();
    if (!r) {
      window.alert('Please enter a reason for the request.');
      return;
    }
    const nowIso = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((i) =>
        String(i.id) === String(selected.id)
          ? {
              ...i,
              cnDnRequestStatus: STATUS.PENDING,
              cnDnRequestNoteType: noteType,
              cnDnRequestReason: r,
              cnDnRequestedAt: nowIso,
              cnDnApprovedAt: null,
            }
          : i
      )
    );
    setReason('');
    window.alert(
      'Request saved. Open Billing → Credit / Debit Notes in the left menu (or use the button below) to approve it.'
    );
  };

  const sharedColumns = [
    {
      key: 'inv',
      label: 'Tax invoice',
      mono: true,
      render: (inv) => inv.taxInvoiceNumber || inv.bill_number || '–',
    },
    {
      key: 'type',
      label: 'Note type',
      align: 'center',
      render: (inv) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
            noteTypeLabel(inv) === 'Debit'
              ? 'bg-violet-100 text-violet-800'
              : 'bg-sky-100 text-sky-800'
          }`}
        >
          {noteTypeLabel(inv)}
        </span>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      render: (inv) => (
        <span className="line-clamp-2 max-w-[14rem]" title={inv.clientLegalName || inv.client_name || ''}>
          {inv.clientLegalName || inv.client_name || '—'}
        </span>
      ),
    },
    {
      key: 'oc',
      label: 'OC / Site',
      render: (inv) => (
        <span className="whitespace-nowrap" title={`${inv.ocNumber || ''} / ${inv.siteId || ''}`}>
          {inv.ocNumber || '–'} / {inv.siteId || '–'}
        </span>
      ),
    },
    {
      key: 'amt',
      label: 'Invoice (₹)',
      align: 'right',
      render: (inv) => `₹${invoiceAmount(inv).toLocaleString('en-IN')}`,
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (inv) => (
        <span className="line-clamp-2 max-w-[16rem] text-gray-700" title={inv.cnDnRequestReason || inv.cn_dn_request_reason || ''}>
          {inv.cnDnRequestReason || inv.cn_dn_request_reason || '—'}
        </span>
      ),
    },
    {
      key: 'req',
      label: 'Requested',
      render: (inv) => formatReqDt(inv.cnDnRequestedAt || inv.cn_dn_requested_at),
    },
  ];

  const approvedColumns = [
    ...sharedColumns,
    {
      key: 'appr',
      label: 'Approved',
      render: (inv) => formatReqDt(inv.cnDnApprovedAt || inv.cn_dn_approved_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 rounded-lg bg-slate-100 p-2">
            <ClipboardList className="w-5 h-5 text-slate-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">CN/DN request pipeline</p>
            <p className="text-xs text-gray-600">
              Submit below → Commercial approves under <strong className="font-medium">Credit / Debit Notes</strong> → issue
              the note.
            </p>
          </div>
        </div>
        {onNavigateTab ? (
          <button
            type="button"
            onClick={() => onNavigateTab('credit-notes')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm shrink-0"
          >
            Open Credit / Debit Notes
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/80 flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-amber-700 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">New request</h3>
            <p className="text-xs text-amber-800/90">
              Choose a saved tax invoice, note type, and reason. Submitted requests appear in the tables below.
            </p>
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tax invoice</label>
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white shadow-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              >
                <option value="">Select invoice…</option>
                {eligible.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.taxInvoiceNumber || inv.bill_number || inv.id} — {inv.clientLegalName || inv.client_name || '—'}
                    {requestStatus(inv) === STATUS.PENDING
                      ? ' (pending)'
                      : requestStatus(inv) === STATUS.APPROVED
                        ? ' (approved — issue in C/D Notes)'
                        : requestStatus(inv) === STATUS.REJECTED
                          ? ' (rejected — may request again if cleared)'
                          : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Note type</label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white shadow-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              >
                <option value="credit">Credit note</option>
                <option value="debit">Debit note</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Reason for request</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              placeholder="Brief reason for Commercial approval (visible in the worklist)"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-gray-100">
            {onNavigateTab ? (
              <button
                type="button"
                onClick={() => onNavigateTab('credit-notes')}
                className="px-4 py-2.5 text-sm font-medium border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-50"
              >
                Go to Credit / Debit Notes
              </button>
            ) : null}
            <button
              type="button"
              onClick={submitRequest}
              disabled={!invoiceId}
              className="px-5 py-2.5 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Submit request
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/90">
          <h3 className="text-sm font-semibold text-gray-900">Request status</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Live view of invoices linked to CN/DN approval workflow. Wider tables scroll horizontally on small screens.
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-8">
          <StatusTable
            title="Pending approval"
            subtitle="Waiting for Commercial under Credit / Debit Notes."
            rows={pendingList}
            columns={sharedColumns}
            emptyMessage="No pending requests. Submit a new request using the form above."
            badgeClass="bg-amber-100 text-amber-900"
          />
          <StatusTable
            title="Approved — issue note"
            subtitle="Raise the credit or debit note from Billing → Credit / Debit Notes."
            rows={approvedList}
            columns={approvedColumns}
            emptyMessage="No approved requests at the moment."
            badgeClass="bg-emerald-100 text-emerald-900"
            tableMinWidthClass="min-w-[900px]"
          />
          <StatusTable
            title="Rejected"
            subtitle="Commercial declined the request; you may submit again after the worklist is cleared if applicable."
            rows={rejectedList}
            columns={sharedColumns}
            emptyMessage="No rejected requests."
            badgeClass="bg-red-100 text-red-800"
          />
        </div>
      </div>
    </div>
  );
}
