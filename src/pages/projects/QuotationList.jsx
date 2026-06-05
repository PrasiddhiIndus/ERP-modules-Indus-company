import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Loader2, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import FireTenderNavbar from "./FireTenderNavbar";
import {
  fetchApprovedQuotationTenderIds,
  generateFireTenderQuotationNumber,
  quotationsByTenderId,
} from "../../lib/fireTenderShared";

const QuotationList = ({ embeddedInHub = false }) => {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchApprovedTenders = async () => {
      try {
        setLoading(true);
        setError(null);

        const tenderIds = await fetchApprovedQuotationTenderIds(supabase);

        if (tenderIds.length === 0) {
          setQuotations([]);
          setLoading(false);
          return;
        }

        const { data: tenders, error: tendersError } = await supabase
          .from("tenders")
          .select("id, tender_number, client, status")
          .in("id", tenderIds);

        if (tendersError) throw tendersError;

        const { data: existingQuotations, error: quotationsError } = await supabase
          .from("quotations")
          .select("tender_id, quotation_number, base_quotation_no")
          .in("tender_id", tenderIds);

        if (quotationsError) throw quotationsError;

        const quotationMap = quotationsByTenderId(existingQuotations);
        const sortedTenders = [...(tenders || [])].sort((a, b) => a.id - b.id);

        const finalQuotations = sortedTenders.map((tender, index) => {
          const existing = quotationMap.get(tender.id);
          const quotationNumber =
            existing?.quotation_number ||
            existing?.base_quotation_no ||
            generateFireTenderQuotationNumber(index);

          return {
            id: tender.id,
            tenderNumber: tender.tender_number,
            quotationNumber,
            client: tender.client,
            status: tender.status || "Approved",
          };
        });

        setQuotations(finalQuotations);
      } catch (err) {
        console.error("Error fetching quotations:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovedTenders();
  }, []);

  const filtered = quotations.filter((q) => {
    const k = search.toLowerCase();
    return (
      (q.tenderNumber || "").toLowerCase().includes(k) ||
      (q.quotationNumber || "").toLowerCase().includes(k) ||
      (q.client || "").toLowerCase().includes(k)
    );
  });

  return (
    <div className={embeddedInHub ? "space-y-4" : "min-h-screen bg-slate-50"}>
      <div className={embeddedInHub ? "space-y-4" : "mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6"}>
        {!embeddedInHub && <FireTenderNavbar />}

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 ring-1 ring-red-100">
                <FileText className="h-6 w-6 text-red-600" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Quotation sheet</h1>
                <p className="mt-1 text-sm text-slate-600">Open tender quotations with consistent Fire Tender workflow.</p>
              </div>
            </div>
            <div className="relative w-full min-w-0 xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tender, quotation no. or client..."
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/25"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
            <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-red-600" />
            <p className="text-sm font-medium text-slate-600">Loading quotations...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50/80 p-6 text-center text-red-700 shadow-sm">Error: {error}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-red-100 bg-gradient-to-r from-red-50 via-orange-50/80 to-amber-50">
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 w-11">S.No</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">Tender No.</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">Quotation No.</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">Client</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                        {search.trim() ? "No matching quotations found." : "No approved quotations found."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((q, idx) => (
                      <tr key={q.id} className="transition-colors hover:bg-red-50/25">
                        <td className="px-4 py-3 text-center tabular-nums text-slate-600">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/app/fire-tender/quotation/${q.id}`}
                            state={{ quotation: q }}
                            className="font-semibold text-red-700 underline-offset-2 hover:text-red-900 hover:underline"
                          >
                            {q.tenderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{q.quotationNumber}</td>
                        <td className="max-w-[280px] truncate px-4 py-3 text-slate-700" title={q.client || "N/A"}>
                          {q.client || "N/A"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
                            {q.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuotationList;
