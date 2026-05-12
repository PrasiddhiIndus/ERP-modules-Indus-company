import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, Plus, FileText, X, CheckCircle2, XCircle, Pencil, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { COMMERCIAL_MT_APPROVER_MODULE_KEYS, userCanApproveInModules } from "../../config/roles";
import ManpowerEnquiryFormPanel from "./components/ManpowerEnquiryFormPanel";

const ITEMS_PER_PAGE = 10;
const META_PREFIX = "__META__:";

function parseAuthorizationMeta(value) {
  if (!value || typeof value !== "string" || !value.startsWith(META_PREFIX)) {
    return { meta: {}, rawText: value || "" };
  }
  try {
    return { meta: JSON.parse(value.slice(META_PREFIX.length)) || {}, rawText: "" };
  } catch {
    return { meta: {}, rawText: value };
  }
}

function buildAuthorizationValue(meta, rawText) {
  const nextMeta = { ...(meta || {}) };
  if (rawText && String(rawText).trim() && !nextMeta.authorizationTo) {
    nextMeta.authorizationTo = String(rawText).trim();
  }
  return `${META_PREFIX}${JSON.stringify(nextMeta)}`;
}

function statusPillClass(status) {
  const s = status || "Pending";
  if (s === "Approved") return "bg-green-100 text-green-700 border border-green-200";
  if (s === "Rejected") return "bg-red-100 text-red-700 border border-red-200";
  return "bg-gray-100 text-gray-700 border border-gray-200";
}

function statusDisplay(status) {
  return status === "Rejected" ? "Regret" : status || "Pending";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatEnquiryDate(row) {
  const { meta } = parseAuthorizationMeta(row.authorization_to);
  return formatDate(meta.enquiryDate || row.created_at);
}

function formatIfslDisplay(row) {
  const { meta } = parseAuthorizationMeta(row.authorization_to);
  if (meta.ifslNumber) return meta.ifslNumber;
  return "—";
}

function getRejectionRemark(row) {
  const { meta } = parseAuthorizationMeta(row.authorization_to);
  return String(meta.rejectionRemark || "").trim();
}

const ManpowerManagement = () => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userProfile, accessibleModules } = useAuth();
  const canApproveEnquiries = userCanApproveInModules(
    userProfile,
    accessibleModules,
    COMMERCIAL_MT_APPROVER_MODULE_KEYS
  );

  const [enquiries, setEnquiries] = useState([]);
  const [listError, setListError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, row: null, remark: "", error: "", submitting: false });
  const [remarkDialog, setRemarkDialog] = useState({ open: false, row: null, remark: "" });

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
    if (routeId && routeId !== "list" && routeId !== "internal-quotation" && routeId !== "quotation" && routeId !== "configuration") {
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
    navigate("/app/commercial/manpower-training/manpower-management", { replace: true });
  };

  const openNew = () => {
    setEditingId(null);
    setShowForm(true);
    navigate("/app/commercial/manpower-training/manpower-management", { replace: true });
  };

  const openEdit = (enquiryId) => {
    setEditingId(enquiryId);
    setShowForm(true);
    navigate(`/app/commercial/manpower-training/manpower-management/${enquiryId}`, { replace: false });
  };

  const afterSave = () => {
    closeForm();
    fetchEnquiries();
  };

  const handleApprove = async (rowId) => {
    if (!canApproveEnquiries) return;
    try {
      const { data: currentRow, error: rowError } = await supabase
        .from("manpower_enquiries")
        .select("id, authorization_to")
        .eq("id", rowId)
        .single();
      if (rowError) throw rowError;

      const currentParsed = parseAuthorizationMeta(currentRow?.authorization_to);
      let ifslNumber = currentParsed.meta.ifslNumber || "";

      if (!ifslNumber) {
        const { data: allRows, error: allError } = await supabase.from("manpower_enquiries").select("authorization_to");
        if (allError) throw allError;

        const year = new Date().getFullYear();
        let maxSequence = 0;

        (allRows || []).forEach((row) => {
          const { meta } = parseAuthorizationMeta(row.authorization_to);
          const val = String(meta.ifslNumber || "");
          const match = val.match(/^(?:IFSL|IFSPL)\/ENQ\/(\d{4})\/(\d{4})$/);
          if (match && Number(match[1]) === year) {
            maxSequence = Math.max(maxSequence, Number(match[2]));
          }
        });

        ifslNumber = `IFSPL/ENQ/${year}/${String(maxSequence + 1).padStart(4, "0")}`;
      }

      const approvedAt = currentParsed.meta.approvedAt || currentParsed.meta.convertedAt || new Date().toISOString();
      const nextMeta = {
        ...(currentParsed.meta || {}),
        ifslNumber,
        approvedAt,
        convertedAt: approvedAt,
      };
      delete nextMeta.rejectionRemark;
      delete nextMeta.rejectedAt;

      const { error } = await supabase
        .from("manpower_enquiries")
        .update({
          status: "Approved",
          authorization_to: buildAuthorizationValue(nextMeta, currentParsed.rawText),
        })
        .eq("id", rowId);
      if (error) throw error;
      navigate("/app/manpower/internal-quotation", { replace: false });
    } catch (error) {
      console.error(error);
    }
    fetchEnquiries();
  };

  const openRejectDialog = (row) => {
    if (!canApproveEnquiries) return;
    setRejectDialog({ open: true, row, remark: getRejectionRemark(row), error: "", submitting: false });
  };

  const closeRejectDialog = () => {
    if (rejectDialog.submitting) return;
    setRejectDialog({ open: false, row: null, remark: "", error: "", submitting: false });
  };

  const submitReject = async () => {
    if (!canApproveEnquiries || !rejectDialog.row) return;
    const remark = rejectDialog.remark.trim();
    if (!remark) {
      setRejectDialog((prev) => ({ ...prev, error: "Please enter rejection remark." }));
      return;
    }

    setRejectDialog((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      const currentParsed = parseAuthorizationMeta(rejectDialog.row.authorization_to);
      const nextMeta = {
        ...(currentParsed.meta || {}),
        rejectionRemark: remark,
        rejectedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("manpower_enquiries")
        .update({
          status: "Rejected",
          authorization_to: buildAuthorizationValue(nextMeta, currentParsed.rawText),
        })
        .eq("id", rejectDialog.row.id);
      if (error) throw error;

      setRejectDialog({ open: false, row: null, remark: "", error: "", submitting: false });
      fetchEnquiries();
    } catch (error) {
      console.error(error);
      setRejectDialog((prev) => ({ ...prev, submitting: false, error: error?.message || "Failed to reject enquiry." }));
    }
  };

  const openRemarkDialog = (row) => {
    const remark = getRejectionRemark(row);
    if (!remark) return;
    setRemarkDialog({ open: true, row, remark });
  };

  const handleDelete = async (rowId) => {
    if (!confirm("Delete this enquiry?")) return;
    const { error } = await supabase.from("manpower_enquiries").delete().eq("id", rowId);
    if (error) console.error(error);
    fetchEnquiries();
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="mt-4 bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manpower Management</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Enquiries, approval, and IFSPL reference — same database as before</p>
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
                <table className="w-full min-w-[1160px] text-xs table-fixed">
                  <thead className="bg-gradient-to-r from-red-50 to-amber-50 border-b border-red-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 w-[15%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Enquiry No.</th>
                      <th className="px-3 py-2.5 w-[13%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Enquiry Date</th>
                      <th className="px-3 py-2.5 w-[18%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Client</th>
                      <th className="px-3 py-2.5 w-[12%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Source</th>
                      <th className="px-3 py-2.5 w-[12%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Due Date</th>
                      <th className="px-3 py-2.5 w-[13%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">IFSPL No.</th>
                      <th className="px-3 py-2.5 w-[8%] text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Status</th>
                      <th className="px-3 py-2.5 w-[9%] text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider align-middle">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {paginated.map((e) => {
                      const rejectionRemark = getRejectionRemark(e);
                      return (
                        <tr key={e.id} className="hover:bg-red-50/35 transition-colors">
                          <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                            <span className="text-xs font-semibold text-gray-900">{e.enquiry_number || "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle whitespace-nowrap text-xs text-gray-600">{formatEnquiryDate(e)}</td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className="text-xs text-gray-800 font-medium line-clamp-2">{e.client || "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle whitespace-nowrap text-xs text-gray-600">{e.source || "—"}</td>
                          <td className="px-3 py-2.5 align-middle whitespace-nowrap text-xs text-gray-600">{formatDate(e.due_date)}</td>
                          <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                            <span className="text-xs font-semibold text-purple-700">{formatIfslDisplay(e)}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusPillClass(e.status)}`}>
                              {statusDisplay(e.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex justify-center items-center gap-1.5">
                              {canApproveEnquiries ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(e.id)}
                                    title="Approve"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openRejectDialog(e)}
                                    title="Regret with remark"
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              ) : null}
                              {rejectionRemark ? (
                                <button
                                  type="button"
                                  onClick={() => openRemarkDialog(e)}
                                  title="View regret remark"
                                  className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openEdit(e.id)}
                                title="Edit"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(e.id)}
                                title="Delete"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

      {rejectDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Regret Enquiry</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {rejectDialog.row?.enquiry_number || "Enquiry"} · {rejectDialog.row?.client || "Client not set"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRejectDialog}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close reject remark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Remark</label>
              <textarea
                value={rejectDialog.remark}
                onChange={(event) => setRejectDialog((prev) => ({ ...prev, remark: event.target.value, error: "" }))}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                placeholder="Enter why this enquiry is regretted..."
              />
              {rejectDialog.error && <p className="mt-2 text-xs text-red-600">{rejectDialog.error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeRejectDialog}
                disabled={rejectDialog.submitting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={rejectDialog.submitting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {rejectDialog.submitting ? "Saving..." : "Save Remark"}
              </button>
            </div>
          </div>
        </div>
      )}

      {remarkDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Regret Remark</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {remarkDialog.row?.enquiry_number || "Enquiry"} · {remarkDialog.row?.client || "Client not set"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRemarkDialog({ open: false, row: null, remark: "" })}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close remark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                {remarkDialog.remark}
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setRemarkDialog({ open: false, row: null, remark: "" })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="max-h-[95vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="h-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500" />
            <div className="flex items-start justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold sm:text-xl text-slate-900 truncate">{editingId ? "Edit Manpower Enquiry" : "New Manpower Enquiry"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Capture enquiry details in a single, structured form.</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-red-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
              <div className="bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
              <ManpowerEnquiryFormPanel key={editingId || "new"} enquiryId={editingId} onSaved={afterSave} onCancel={closeForm} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManpowerManagement;
