import React from 'react';
import { Wallet } from 'lucide-react';

/** Projects — Contract Management · Budget (placeholder until budgeting workflows are built). */
export default function ContractBudget() {
  return (
    <div className="p-6 sm:p-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Wallet className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Budget</h2>
        <p className="mt-2 text-sm text-slate-600">
          Track and manage project budgets under Contract Management. This screen is ready for access
          control; budgeting workflows will be added here.
        </p>
      </div>
    </div>
  );
}
