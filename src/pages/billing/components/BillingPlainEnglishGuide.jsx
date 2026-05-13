import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, Lightbulb } from 'lucide-react';

const STORAGE_OPEN = 'billing_plain_guide_open';

const WORDS = [
  {
    term: 'Team (vertical)',
    means: 'Which part of the company this bill is for — like Manpower (people at sites) or Training.',
  },
  {
    term: 'OC',
    means: 'Office Contract number — your internal job code on the order.',
  },
  {
    term: 'PO / WO',
    means: 'Purchase Order or Work Order — the agreement or paper that says what work and money was agreed.',
  },
  {
    term: 'Invoice',
    means: 'The bill you send to the client so they can pay you.',
  },
  {
    term: 'Tax invoice vs proforma',
    means: 'Tax invoice is the real bill for GST. Proforma is a draft or quote — not the final tax bill yet.',
  },
  {
    term: 'IRN (e-invoice)',
    means: 'A government receipt number that proves this bill was filed with GST. Without it, the tax bill is not official.',
  },
  {
    term: 'PA (Payment Advice)',
    means: 'Proof from the client that they paid — like a bank advice or payment letter.',
  },
  {
    term: 'Credit / Debit note',
    means: 'A fix when the first bill was wrong — credit lowers what they owe, debit adds more.',
  },
  {
    term: 'Add-on bill',
    means: 'Extra money not in the main contract — like bonus or reimbursement.',
  },
];

/**
 * One friendly strip + optional glossary so every screen shares the same simple language.
 */
export default function BillingPlainEnglishGuide() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_OPEN);
      if (v === '0') setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(STORAGE_OPEN, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="px-4 sm:px-6 pb-3">
      <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/95 via-white to-sky-50/80 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:px-5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 ring-1 ring-amber-200/80">
              <Lightbulb className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                Billing in one sentence: turn approved jobs into client bills, then collect proof of payment and GST filing.
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Use the two dropdowns above to pick <strong>team</strong> and <strong>how the job was agreed</strong>. Then use
                the tabs — left to right is usually the order you work: overview → make bill → extras → fix &amp; print.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center justify-center gap-1.5 shrink-0 rounded-xl border border-amber-300/80 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 transition-colors"
            aria-expanded={open}
          >
            <BookOpen className="w-4 h-4" />
            {open ? 'Hide word list' : 'What do these words mean?'}
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {open ? (
          <div className="border-t border-amber-100 bg-white/90 px-4 sm:px-5 py-4">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Simple glossary</p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {WORDS.map((row) => (
                <li key={row.term} className="text-sm">
                  <span className="font-semibold text-slate-900">{row.term}</span>
                  <span className="text-slate-600"> — {row.means}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
