import React from "react";
import { useNavigate } from "react-router-dom";
import { FileBarChart, ChevronRight } from "lucide-react";
import { financePath } from "./navConfig";

export default function FinanceReports() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Reports</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Finance reporting tools — multi-site P&amp;L, variance, and portfolio views
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate(financePath("site-ledger"))}
        className="w-full max-w-xl text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-red-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-red-50 text-red-700 shrink-0">
            <FileBarChart className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Site Ledger</h3>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-red-600 shrink-0" />
            </div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Multi-site income–expenditure monitoring with site setup, figure entry, budgets, spreads, and portfolio reports.
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
