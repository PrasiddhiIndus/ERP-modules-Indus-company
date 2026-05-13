import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Horizontal billing navigation — each link has a plain-English title for hover help.
 */
const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Home',
    title: 'Numbers and health check — money, jobs, and what needs attention',
    to: '/app/billing',
    isActive: (p) => p === '/app/billing' || p === '/app/billing/dashboard',
  },
  {
    id: 'create-invoice',
    label: 'Make bill',
    title: 'Create a tax or draft bill from an approved job (PO)',
    to: '/app/billing/create-invoice',
    isActive: (p) => p.startsWith('/app/billing/create-invoice'),
  },
  {
    id: 'add-on-invoices',
    label: 'Extra bill',
    title: 'Bill money outside the main contract — bonus, reimbursement, etc.',
    to: '/app/billing/add-on-invoices',
    isActive: (p) => p.startsWith('/app/billing/add-on-invoices'),
  },
  {
    id: 'manage-invoices',
    label: 'All bills',
    title: 'Open, print PDF, register GST e-invoice, record payment proof',
    to: '/app/billing/manage-invoices',
    isActive: (p) => p.startsWith('/app/billing/manage-invoices'),
  },
  {
    id: 'credit-notes',
    label: 'Fix bill',
    title: 'Credit or debit note — when you must correct an invoice already sent',
    to: '/app/billing/credit-notes',
    isActive: (p) => p.startsWith('/app/billing/credit-notes'),
  },
  {
    id: 'reports',
    label: 'Reports',
    title: 'Tables — who owes money, gaps, delays, deductions',
    to: '/app/billing/reports',
    isActive: (p) => p.startsWith('/app/billing/reports'),
  },
  {
    id: 'tracking',
    label: 'Money tracking',
    title: 'Payment proofs from clients and penalty cuts',
    to: '/app/billing/tracking',
    isActive: (p) => p.startsWith('/app/billing/tracking'),
  },
  {
    id: 'notifications',
    label: 'Reminders',
    title: 'Dates and alerts — contract ending, next billing time, missing proofs',
    to: '/app/billing/notifications',
    isActive: (p) => p.startsWith('/app/billing/notifications'),
  },
  {
    id: 'generated-e-invoice',
    label: 'GST list',
    title: 'Bills that already have a government IRN number filed',
    to: '/app/billing/generated-e-invoice',
    isActive: (p) => p.startsWith('/app/billing/generated-e-invoice'),
  },
];

export default function BillingFlowNav() {
  const { pathname } = useLocation();

  return (
    <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm px-3 sm:px-6 py-2">
      <div className="mx-auto max-w-[1920px] flex items-center gap-1 overflow-x-auto pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 mr-1 hidden sm:inline">
          Go to
        </span>
        {NAV_ITEMS.map((item, idx) => {
          const active = item.isActive(pathname);
          return (
            <React.Fragment key={item.id}>
              {idx > 0 ? (
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden />
              ) : null}
              <Link
                to={item.to}
                title={item.title}
                className={[
                  'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
