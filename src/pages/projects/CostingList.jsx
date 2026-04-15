// src/pages/CostingList.jsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Calculator, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import FireTenderNavbar from "./FireTenderNavbar";

const ITEMS_PER_PAGE = 5;

const CostingList = () => {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchApprovedTenders = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("tenders")
        .select("id, tender_number, client, status")
        .eq("status", "Approved");

      if (error) {
        console.error("Error fetching tenders:", error.message);
        setTenders([]);
      } else {
        setTenders(data || []);
      }

      setLoading(false);
    };

    fetchApprovedTenders();
  }, []);

  const filteredTenders = tenders.filter(
    (tender) =>
      tender.tender_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tender.client?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredTenders.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTenders = filteredTenders.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handlePrevious = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
        <FireTenderNavbar />

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 ring-1 ring-red-100">
                <Calculator className="h-6 w-6 text-red-600" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Costing sheet</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Open an approved tender to build or review costing, accessories, and MOC.
                </p>
              </div>
            </div>
            <div className="relative w-full min-w-0 xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search by tender no. or client…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/25"
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Loader2 className="mb-3 h-9 w-9 animate-spin text-red-600" />
              <p className="text-sm font-medium">Loading approved tenders…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-red-100 bg-gradient-to-r from-red-50 via-orange-50/80 to-amber-50">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Tender number
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Client
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedTenders.length > 0 ? (
                    paginatedTenders.map((tender) => (
                      <tr key={tender.id} className="transition-colors hover:bg-red-50/25">
                        <td className="px-4 py-3">
                          <Link
                            to={`/app/fire-tender/costing/${tender.id}`}
                            className="font-semibold text-red-700 underline-offset-2 hover:text-red-900 hover:underline"
                          >
                            {tender.tender_number}
                          </Link>
                        </td>
                        <td className="max-w-[280px] truncate px-4 py-3 text-slate-800" title={tender.client}>
                          {tender.client}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
                            {tender.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500">
                        {searchTerm.trim()
                          ? "No tenders match your search."
                          : "No approved tenders found. Approve a tender from New Tender first."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && filteredTenders.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:px-6">
            <p className="text-xs text-slate-600">
              Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredTenders.length)} of{" "}
              {filteredTenders.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentPage === 1}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  currentPage === 1
                    ? "cursor-not-allowed bg-slate-100 text-slate-400"
                    : "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="min-w-[100px] text-center text-sm font-medium text-slate-700">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={currentPage === totalPages}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  currentPage === totalPages
                    ? "cursor-not-allowed bg-slate-100 text-slate-400"
                    : "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-sm hover:from-red-700 hover:to-red-800"
                }`}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CostingList;
