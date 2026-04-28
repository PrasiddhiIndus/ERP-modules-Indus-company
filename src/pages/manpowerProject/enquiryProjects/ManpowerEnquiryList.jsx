import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useNavigate } from "react-router-dom";

const ITEMS_PER_PAGE = 5;

const ManpowerEnquiryList = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  const fetchEnquiries = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("manpower_enquiries")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Fetch error:", fetchError);
        if (fetchError.message?.includes("permission") || fetchError.message?.includes("policy") || fetchError.code === "PGRST301") {
          setError("Permission denied. Some enquiries may not be visible due to Row Level Security. Make sure all enquiries have a user_id matching your account.");
        } else {
          setError(`Error loading enquiries: ${fetchError.message}`);
        }
        setEnquiries([]);
      } else {
        setEnquiries(data || []);
        if (!data || data.length === 0) {
          setError(
            "No enquiries found. This could be because:\n1. No enquiries have been created yet\n2. Enquiries exist but don't have your user_id set\n3. Row Level Security is filtering them out"
          );
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(`Unexpected error: ${err.message}`);
      setEnquiries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const handleApprove = async (rowId) => {
    await supabase.from("manpower_enquiries").update({ status: "Approved" }).eq("id", rowId);
    fetchEnquiries();
  };

  const handleReject = async (rowId) => {
    await supabase.from("manpower_enquiries").update({ status: "Rejected" }).eq("id", rowId);
    fetchEnquiries();
  };

  const handleDelete = async (rowId) => {
    if (!confirm("Delete this enquiry?")) return;
    await supabase.from("manpower_enquiries").delete().eq("id", rowId);
    fetchEnquiries();
  };

  const handleEdit = (rowId) => {
    navigate(`/app/manpower/${rowId}`);
  };

  const totalPages = Math.ceil(enquiries.length / ITEMS_PER_PAGE) || 1;
  const paginatedEnquiries = enquiries.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">MANPOWER ENQUIRIES</h2>

      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading enquiries...</p>
        </div>
      ) : error ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-yellow-800 font-semibold mb-2">Notice</p>
          <p className="text-yellow-700 text-sm whitespace-pre-line">{error}</p>
          <button onClick={fetchEnquiries} className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm">
            Retry
          </button>
        </div>
      ) : enquiries.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 font-semibold mb-2">No enquiries available yet.</p>
          <p className="text-blue-700 text-sm">Create a new enquiry using the &quot;New Enquiry&quot; button above.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedEnquiries.map((e) => (
              <div
                key={e.id}
                className="p-4 bg-white border rounded-lg shadow flex flex-col md:flex-row md:justify-between items-start md:items-center"
              >
                <div className="flex-1">
                  <p className="font-bold text-lg">{e.client}</p>
                  <p className="text-sm text-gray-600">
                    {e.email} | {e.phone}
                  </p>
                  <p className="text-sm">Due: {e.due_date ? new Date(e.due_date).toLocaleDateString() : "N/A"}</p>
                  <p className="text-sm">
                    Enquiry No:{" "}
                    <span className={`ml-1 font-semibold ${e.status === "Rejected" ? "text-red-600" : "text-blue-600"}`}>
                      {e.enquiry_number || "Not Assigned"}
                    </span>
                  </p>
                  <p className="text-sm">
                    Status:{" "}
                    <span
                      className={`ml-1 font-semibold ${
                        e.status === "Approved" ? "text-green-600" : e.status === "Rejected" ? "text-red-600" : "text-gray-600"
                      }`}
                    >
                      {e.status || "Pending"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 md:mt-0">
                  <button
                    onClick={() => handleApprove(e.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(e.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleEdit(e.id)}
                    className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-6">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-300 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ManpowerEnquiryList;
