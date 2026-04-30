import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const BASE = "/app/commercial/rm-mm-amc-iev/manpower-management";
const IQ = "/app/commercial/rm-mm-amc-iev/internal-quotation";

/** Independent nav for R&M / M&M / AMC / IEV manpower enquiries (same UI pattern as legacy Manpower navbar). */
const ManpowerNavbarRm = () => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const location = useLocation();

  const p = location.pathname;
  const isRoot = p === BASE;
  const rest = p.replace(new RegExp(`^${BASE.replace(/\//g, "\\/")}\\/`), "");
  const isReservedSubpath = rest.startsWith("internal-quotation") || rest === "list";
  const isIdRoute = p.startsWith(`${BASE}/`) && rest.length > 0 && !isReservedSubpath && !rest.includes("/");
  const onEnquiryHub = isRoot || isIdRoute;
  const newEnquiryActive = onEnquiryHub && location.search.includes("new=1");
  const listActive = onEnquiryHub && !location.search.includes("new=1");

  return (
    <div className="flex items-center justify-between mb-6 border-b pb-3">
      <h2 className="text-2xl font-semibold">Manpower Management</h2>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-auto">
        <Link
          to={`${BASE}?new=1`}
          className={`px-4 py-2 rounded text-white ${newEnquiryActive ? "bg-red-700" : "bg-red-600 hover:bg-red-700"}`}
        >
          New Enquiry
        </Link>

        <Link
          to={BASE}
          className={`px-4 py-2 rounded text-white ${listActive ? "bg-yellow-700" : "bg-yellow-600 hover:bg-yellow-700"}`}
        >
          Enquiry List
        </Link>

        <Link
          to={IQ}
          className={`px-4 py-2 rounded text-white ${
            location.pathname.startsWith(IQ) ? "bg-green-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          Internal Quotation
        </Link>

        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Configuration
          </button>

          {isConfigOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
              <div className="py-1">
                <span className="block px-4 py-2 text-xs text-gray-500">
                  Configuration routes use the Commercial — Manpower / Training module paths.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManpowerNavbarRm;
