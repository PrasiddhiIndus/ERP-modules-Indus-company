import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, Plus, FileText, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import ManpowerNavbar from "./ManpowerNavbar";
import ManpowerEnquiryFormPanel from "./components/ManpowerEnquiryFormPanel";

const ITEMS_PER_PAGE = 10;

function statusPillClass(status) {
  const s = status || "Pending";
  if (s === "Approved") return "bg-green-100 text-green-700 border border-green-200";
  if (s === "Rejected") return "bg-red-100 text-red-700 border border-red-200";
  return "bg-gray-100 text-gray-700 border border-gray-200";
}

/** IFSL No. column: same reference as enquiry number once approved (no extra DB column). */
function formatIfslDisplay(row) {
  if (row.status === "Approved" && row.enquiry_number) return row.enquiry_number;
  return "—";
}

const ManpowerManagement = () => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [enquiries, setEnquiries] = useState([]);
  const [listError, setListError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetchEnquiries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("manpower_enquiries").select("*").order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        setListError(error.message || String(error));
        setEnquiries([]);
      } else {
        setListError(null);
        setEnquiries(data || []);
      }
    } catch (e) {
      console.error(e);
      setEnquiries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditingId(null);
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (routeId && routeId !== "list" && routeId !== "internal-quotation") {
      setEditingId(routeId);
      setShowForm(true);
    } else {
      setEditingId(null);
    }
  }, [routeId]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return enquiries;
    const q = searchQuery.toLowerCase();
    return enquiries.filter((e) => {
      return (
        (e.enquiry_number || "").toLowerCase().includes(q) ||
        (e.client || "").toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        (e.phone || "").toLowerCase().includes(q) ||
        (e.source || "").toLowerCase().includes(q)
      );
    });
  }, [enquiries, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    navigate("/app/manpower", { replace: true });
  };

  const openNew = () => {
    setEditingId(null);
    setShowForm(true);
    navigate("/app/manpower", { replace: true });
  };

  const openEdit = (enquiryId) => {
    setEditingId(enquiryId);
    setShowForm(true);
    navigate(`/app/manpower/${enquiryId}`, { replace: false });
  };

  const afterSave = () => {
    closeForm();
    fetchEnquiries();
  };

  const handleApprove = async (rowId) => {
    const { error } = await supabase.from("manpower_enquiries").update({ status: "Approved" }).eq("id", rowId);
    if (error) console.error(error);
    fetchEnquiries();
  };

  const handleReject = async (rowId) => {
    const { error } = await supabase.from("manpower_enquiries").update({ status: "Rejected" }).eq("id", rowId);
    if (error) console.error(error);
    fetchEnquiries();
  };

  const handleDelete = async (rowId) => {
    if (!confirm("Delete this enquiry?")) return;
    const { error } = await supabase.from("manpower_enquiries").delete().eq("id", rowId);
    if (error) console.error(error);
    fetchEnquiries();
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <ManpowerNavbar />

      <div className="mt-4 bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manpower Management</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Enquiries, approval, and IFSL reference — same database as before</p>
            {listError && (
              <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                Could not load enquiries: {listError}. If the table is missing, run the migration{" "}
                <code className="text-xs">20260414120000_manpower_enquiries_and_storage.sql</code> in Supabase SQL Editor.
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial sm:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search enquiry no., client, email, phone, source…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
            <button
              type="button"
              onClick={openNew}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span>New Enquiry</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
              <p className="mt-2 text-sm">Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-10 h-10 mx-auto text-gray-400 mb-2" />
              <p className="text-base font-medium text-gray-700">{enquiries.length === 0 ? "No enquiries yet" : "No matches"}</p>
              <p className="text-xs mt-1 text-gray-500">
                {enquiries.length === 0 ? "Use New Enquiry to add a row." : "Try another search."}
              </p>
            </div>
          ) : (
            <div className="manpower-table-scroll overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(220, 38, 38, 0.45) #f3f4f6" }}>
              <style>{`
                .manpower-table-scroll::-webkit-scrollbar { height: 8px; }
                .manpower-table-scroll::-webkit-scrollbar-track { background: #f3f4f6; border-radius: 4px; }
                .manpower-table-scroll::-webkit-scrollbar-thumb { background: rgba(220, 38, 38, 0.45); border-radius: 4px; }
                .manpower-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(220, 38, 38, 0.65); }
              `}</style>
                <table className="w-full min-w-[1180px] text-xs">
                  <thead className="bg-gradient-to-r from-red-50 to-amber-50 border-b border-red-100">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Enquiry No.</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Client</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Contact</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Source</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Due date</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">IFSL No.</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Status</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle w-[200px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {paginated.map((e) => (
                      <tr key={e.id} className="hover:bg-red-50/35 transition-colors">
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span className="text-xs font-semibold text-gray-900">{e.enquiry_number || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span className="text-xs text-gray-800 font-medium line-clamp-2">{e.client || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="text-xs text-gray-700 leading-snug">{e.email || "—"}</div>
                          <div className="text-[11px] text-gray-500">{e.phone || "—"}</div>
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap text-xs text-gray-600">{e.source || "—"}</td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap text-xs text-gray-600">
                          {e.due_date ? new Date(e.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span className="text-xs font-semibold text-purple-700">{formatIfslDisplay(e)}</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusPillClass(e.status)}`}>
                            {e.status || "Pending"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex flex-wrap justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApprove(e.id)}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-green-600 text-white hover:bg-green-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(e.id)}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-red-500 text-white hover:bg-red-600"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(e.id)}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-amber-500 text-white hover:bg-amber-600"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(e.id)}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          )}
        </div>

        {filtered.length > ITEMS_PER_PAGE && (
          <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-2 px-2 py-2 border-t border-gray-100">
            <span className="text-xs text-gray-600">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-200 text-gray-700 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-200 text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="max-h-[95vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-4 sm:px-6 text-white">
              <div>
                <h2 className="text-lg font-semibold sm:text-xl">{editingId ? "Edit Manpower Enquiry" : "New Manpower Enquiry"}</h2>
                <p className="mt-1 text-xs text-purple-100 sm:text-sm">Saved to manpower_enquiries — list refreshes after save.</p>
              </div>
              <button type="button" onClick={closeForm} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <ManpowerEnquiryFormPanel key={editingId || "new"} enquiryId={editingId} onSaved={afterSave} onCancel={closeForm} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManpowerManagement;
