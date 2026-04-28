import React, { useMemo } from "react";

export default function ManpowerQuotationList() {
  const quotations = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("manpower_quotations")) || [];
    } catch {
      return [];
    }
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Quotation</h2>
        <div className="text-sm text-gray-600">{quotations.length} quotation{quotations.length === 1 ? "" : "s"}</div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Quotation No.</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Enquiry No.</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Subject</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Validity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No quotations found.
                  </td>
                </tr>
              ) : (
                quotations
                  .slice()
                  .reverse()
                  .map((q, idx) => (
                    <tr key={`${q.quotation_number || "Q"}-${q.enquiry_id || idx}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{q.quotation_number || "—"}</td>
                      <td className="px-4 py-3 text-gray-800">{q.client || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{q.enquiry_number || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{q.subject || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{q.amount ? `₹${Number(q.amount).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{q.validity || "—"}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

