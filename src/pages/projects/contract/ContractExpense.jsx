import React from 'react';
import { Receipt } from 'lucide-react';

/** Projects — Contract Management · Expense (placeholder until expense workflows are built). */
export default function ContractExpense() {
  return (
    <div className="p-6 sm:p-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Receipt className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Expense</h2>
        <p className="mt-2 text-sm text-slate-600">
          Record and review project expenses under Contract Management. This screen is ready for access
          control; expense workflows will be added here.
        </p>
      </div>
    </div>
  );
}
