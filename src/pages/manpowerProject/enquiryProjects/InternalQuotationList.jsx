// src/pages/manpowerProject/enquiryProjects/InternalQuotationList.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../../../lib/supabase";

const InternalQuotationList = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  useEffect(() => {
    const fetchApprovedEnquiries = async () => {
      setLoading(true);
      setListError("");
      const { data, error } = await supabase
        .from('manpower_enquiries')
        .select('*')
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching approved enquiries:', error);
        setEnquiries([]);
        setListError(error.message || String(error));
      } else {
        setEnquiries(data || []);
      }
      setLoading(false);
    };

    fetchApprovedEnquiries();
  }, []);

  const quotationNumberByEnquiryId = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("manpower_quotations")) || [];
      const m = new Map();
      (saved || []).forEach((q) => {
        if (!q?.enquiry_id) return;
        if (q?.quotation_number) m.set(String(q.enquiry_id), String(q.quotation_number));
      });
      return m;
    } catch {
      return new Map();
    }
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-gray-500">
          Loading enquiries...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Internal Quotation</h2>
          <p className="text-sm text-slate-500 mt-1">Shows only approved manpower enquiries.</p>
        </div>
        <div className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm w-fit">
          {enquiries.length} approved enquir{enquiries.length === 1 ? "y" : "ies"}
        </div>
      </div>

      {listError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 text-sm">
          Could not load enquiries: {listError}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Enquiry No</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Quotation Number</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Client Name</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enquiries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No approved enquiries available.
                  </td>
                </tr>
              ) : (
                enquiries.map((enquiry) => {
                  const qNo = quotationNumberByEnquiryId.get(String(enquiry.id)) || "—";
                  return (
                    <tr key={enquiry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link to={`/app/commercial/manpower-training/internal-quotation/${enquiry.id}`} className="font-semibold text-purple-700 hover:text-purple-800 hover:underline">
                          {enquiry.enquiry_number || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{qNo}</td>
                      <td className="px-4 py-3 text-slate-800">{enquiry.client || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/app/commercial/manpower-training/internal-quotation/${enquiry.id}`}
                          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InternalQuotationList;
