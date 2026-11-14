import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  FilePenLine,
  FileText,
  History,
  Loader2,
  Paperclip,
  Pencil,
  X,
} from 'lucide-react';
import {
  fetchAttachments,
  fetchFollowups,
  fetchQuotationSettings,
} from '../../../../services/quotationApi';
import { formatDisplayDate } from '../quotationConstants';
import StatusBadge from '../StatusBadge';
import QuotationMakerPreview from './QuotationMakerPreview';
import { fetchCreatorSignatureUrl, fetchMakerQuotation } from './quotationMakerApi';
import { formatMoneyIn } from './quotationMakerModel';
import { cellValue } from './quotationMasterColumns.jsx';
import './quotationMaker.css';

/** "Details" tab — the Offer Database sheet columns, in sheet order. */
const DETAIL_ROWS = [
  ['offer_no', 'Offer No'],
  ['offer_date', 'Date', 'date'],
  ['client_name', 'Client Name'],
  ['location', 'Location'],
  ['contact_person', 'Contact Person'],
  ['contact_no', 'Contact No'],
  ['email_id', 'E-mail ID', 'email'],
  ['quoted_rate', 'Quoted Rate', 'money'],
  ['offer_status', 'Offer Status', 'status'],
  ['offer_type', 'Offer Type'],
  ['offer_link', 'Offer Link', 'link'],
  ['scope', 'Scope', 'long'],
  ['last_followup_date', 'Last Followup Date', 'date'],
  ['enquiry_received_from', 'Enquiry Received From'],
  ['remark', 'Remark', 'long'],
  ['order_converted_date', 'Order Converted Date', 'date'],
  ['quarter', 'Quarter'],
];

export default function QuotationViewDrawer({ row, onClose, onEditQuotation, onEditDetails }) {
  const fromMaker = Boolean(row.quotation_type);
  const [tab, setTab] = useState('details');
  const [doc, setDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [texts, setTexts] = useState({ opening: null, closing: null });
  const [followups, setFollowups] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [extrasLoading, setExtrasLoading] = useState(true);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Follow-ups + attachments (read only).
  useEffect(() => {
    let cancelled = false;
    setExtrasLoading(true);
    Promise.allSettled([fetchFollowups(row.id), fetchAttachments(row.id)]).then(([f, a]) => {
      if (cancelled) return;
      setFollowups(f.status === 'fulfilled' ? f.value : []);
      setAttachments(a.status === 'fulfilled' ? a.value : []);
      setExtrasLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  // Quotation document (only for quotations built in Make a Quotation).
  useEffect(() => {
    if (!fromMaker) return undefined;
    let cancelled = false;
    setDocLoading(true);
    setDocError('');
    Promise.all([fetchMakerQuotation(row.id), fetchQuotationSettings().catch(() => null)])
      .then(async ([data, settings]) => {
        if (cancelled) return;
        setDoc(data);
        setTexts({ opening: settings?.makerOpening ?? null, closing: settings?.makerClosing ?? null });
        const sigUser = data?.form?.created_by;
        if (sigUser) {
          const url = await fetchCreatorSignatureUrl(sigUser).catch(() => '');
          if (!cancelled) setSignatureUrl(url || '');
        }
      })
      .catch((err) => {
        if (!cancelled) setDocError(err?.message || 'Could not load the quotation document.');
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, fromMaker]);

  const tabs = [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'document', label: 'Quotation Document', icon: FileText },
    { id: 'activity', label: `Follow-ups & Files (${followups.length + attachments.length})`, icon: History },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-6xl bg-white shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Quotation details"
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 truncate">{row.offer_no || 'Quotation'}</h3>
              <StatusBadge status={row.offer_status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {row.client_name || '—'}
              {row.location ? ` · ${row.location}` : ''} · {formatDisplayDate(row.offer_date)} · ₹{' '}
              {formatMoneyIn(cellValue(row, 'quoted_rate') || 0)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <HeaderBtn onClick={onEditDetails} icon={Pencil} label="Edit details" />
            <HeaderBtn
              onClick={onEditQuotation}
              icon={FilePenLine}
              label="Edit quotation"
              disabled={!fromMaker}
              title={fromMaker ? '' : 'Not created in Make a Quotation'}
            />
            <button
              type="button"
              onClick={onClose}
              className="ml-1 p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              title="Close"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-slate-200 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5">
          {tab === 'details' && (
            <section className="rounded-lg border border-slate-200 bg-white">
              <h4 className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> Quotation Details
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {DETAIL_ROWS.map(([key, label, type]) => (
                  <div
                    key={key}
                    className={`px-4 py-2.5 border-b border-slate-100 min-w-0 ${
                      type === 'long' ? 'sm:col-span-2 xl:col-span-3' : ''
                    }`}
                  >
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 break-words whitespace-pre-wrap">
                      <Value type={type} value={cellValue(row, key)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {tab === 'document' &&
            (!fromMaker ? (
              <EmptyState
                title="No quotation document"
                text="This offer was not created in Make a Quotation, so there is no document to preview."
              >
                {row.offer_link ? (
                  <a
                    href={row.offer_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                  >
                    Open offer link <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </EmptyState>
            ) : docLoading ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
              </div>
            ) : docError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{docError}</div>
            ) : doc ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  To download the PDF, open Edit quotation and use Download PDF.
                </p>
                <div className="qm-page">
                  <QuotationMakerPreview
                    form={doc.form}
                    rows={doc.rows}
                    signatureUrl={signatureUrl}
                    openingText={texts.opening}
                    closingText={texts.closing}
                  />
                </div>
              </div>
            ) : null)}

          {tab === 'activity' &&
            (extrasLoading ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="rounded-lg border border-slate-200 bg-white">
                  <h4 className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-2">
                    <History className="h-3.5 w-3.5" /> Follow-up history ({followups.length})
                  </h4>
                  {followups.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">No follow-ups logged.</p>
                  ) : (
                    <ol className="divide-y divide-slate-100">
                      {followups.map((f, i) => (
                        <li key={f.id || i} className="px-4 py-2.5">
                          <div className="flex justify-between gap-2 text-xs text-slate-500">
                            <span>{formatDisplayDate(f.followup_date)}</span>
                            <span>{f.logged_by || '—'}</span>
                          </div>
                          <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{f.note || '—'}</p>
                          {f.next_followup_date ? (
                            <p className="text-xs text-slate-500 mt-0.5">Next: {formatDisplayDate(f.next_followup_date)}</p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="rounded-lg border border-slate-200 bg-white">
                  <h4 className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5" /> Attachments ({attachments.length})
                  </h4>
                  {attachments.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">No attachments.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {attachments.map((a, i) => (
                        <li key={a.id || i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <a
                            href={a.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline truncate"
                          >
                            {a.file_name || a.file_url}
                          </a>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{formatDisplayDate(a.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}

function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

function Value({ type, value }) {
  if (value == null || value === '') return <span className="text-slate-400">—</span>;
  switch (type) {
    case 'date':
      return formatDisplayDate(value);
    case 'money':
      return <span className="tabular-nums font-medium">₹ {formatMoneyIn(value)}</span>;
    case 'status':
      return <StatusBadge status={value} />;
    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
          {value}
        </a>
      );
    case 'link':
      return /^https?:\/\//i.test(String(value)) ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
          Open <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        // Local/network file paths can't be opened from the browser — show the path to copy.
        <span className="text-xs text-slate-600 select-all break-all" title="Local file path — copy to open">
          {safeDecode(String(value).replace(/^file:\/\/\/?/i, ''))}
        </span>
      );
    case 'long':
      return String(value);
    default:
      return String(value);
  }
}

function HeaderBtn({ onClick, icon: Icon, label, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function EmptyState({ title, text, children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center space-y-2">
      <FileText className="h-8 w-8 text-slate-300 mx-auto" />
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-sm text-slate-500">{text}</p>
      {children}
    </div>
  );
}
