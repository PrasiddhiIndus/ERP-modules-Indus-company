// src/pages/CostingList.jsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import FireTenderNavbar from "./FireTenderNavbar";

const ITEMS_PER_PAGE = 5; // ✅ show 5 tenders per page

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

  // ✅ filter tenders based on search input
  const filteredTenders = tenders.filter(
    (tender) =>
      tender.tender_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tender.client?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ✅ pagination logic
  const totalPages = Math.ceil(filteredTenders.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTenders = filteredTenders.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handlePrevious = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  return (
    <div className="p-6">
      <FireTenderNavbar/>
    
      {/* ✅ Title + Search aligned in one row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-2xl font-semibold mb-2 sm:mb-0">Costing Sheet</h2>
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // reset to first page when searching
          }}
          className="border rounded px-3 py-2 w-full sm:w-64 text-sm"
        />
      </div>

      <div className="bg-white shadow rounded-lg overflow-x-auto">
        {loading ? (
          <p className="text-center py-6 text-gray-500">Loading tenders...</p>
        ) : (
          <table className="min-w-full border-collapse text-sm sm:text-base">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 border">Tender Number</th>
                <th className="px-4 py-2 border">Client</th>
                <th className="px-4 py-2 border">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTenders.length > 0 ? (
                paginatedTenders.map((tender) => (
                  <tr key={tender.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link
                        to={`/fire-tender/costing/${tender.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {tender.tender_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{tender.client}</td>
                    <td className="px-4 py-2 text-green-600 font-medium">
                      {tender.status}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="3"
                    className="text-center text-gray-500 py-4 italic"
                  >
                    No approved tenders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ✅ Pagination controls */}
      {!loading && filteredTenders.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-2">
          <button
            onClick={handlePrevious}
            disabled={currentPage === 1}
            className={`px-4 py-2 rounded text-sm ${
              currentPage === 1
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Previous
          </button>
          <span className="text-gray-700 text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={handleNext}
            disabled={currentPage === totalPages}
            className={`px-4 py-2 rounded text-sm ${
              currentPage === totalPages
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default CostingList;
