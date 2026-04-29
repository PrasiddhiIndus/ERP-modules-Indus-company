// src/components/ManpowerNavbar.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const ManpowerNavbar = () => {
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const location = useLocation();

    const p = location.pathname;
    const MANPOWER_BASE = "/app/commercial/manpower-training/manpower-management";
    const IQ_BASE = "/app/commercial/manpower-training/internal-quotation";
    const isManpowerRoot = p === MANPOWER_BASE;
    const rest = p.replace(/^\/app\/commercial\/manpower-training\/manpower-management\//, "");
    const isReservedSubpath =
        rest.startsWith("internal-quotation") || rest.startsWith("configuration") || rest === "list";
    const isIdRoute = p.startsWith(`${MANPOWER_BASE}/`) && rest.length > 0 && !isReservedSubpath && !rest.includes("/");
    const onEnquiryHub = isManpowerRoot || isIdRoute;
    const newEnquiryActive = onEnquiryHub && location.search.includes("new=1");
    const listActive = onEnquiryHub && !location.search.includes("new=1");

    const toggleConfigDropdown = () => {
        setIsConfigOpen(!isConfigOpen);
    };

    return (
        <div className="flex items-center justify-between mb-6 border-b pb-3">
            {/* Title */}
            <h2 className="text-2xl font-semibold">Manpower Management</h2>

            {/* Buttons Row - pushed right */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-auto">
                <Link
                    to={`${MANPOWER_BASE}?new=1`}
                    className={`px-4 py-2 rounded text-white ${newEnquiryActive ? "bg-red-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                    New Enquiry
                </Link>

                <Link
                    to={MANPOWER_BASE}
                    className={`px-4 py-2 rounded text-white ${listActive ? "bg-yellow-700" : "bg-yellow-600 hover:bg-yellow-700"}`}
                >
                    Enquiry List
                </Link>

                {/* ✅ Internal Quotation */}
                <Link
                    to={IQ_BASE}
                    className={`px-4 py-2 rounded text-white ${location.pathname === IQ_BASE
                        ? "bg-green-700"
                        : "bg-green-600 hover:bg-green-700"
                        }`}
                >
                    Internal Quotation
                </Link>

                {/* ✅ Quotation */}
                <Link
                    to="/app/commercial/manpower-training/quotation"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/commercial/manpower-training/quotation"
                        ? "bg-purple-700"
                        : "bg-purple-600 hover:bg-purple-700"
                        }`}
                >
                    Quotation
                </Link>

                {/* 🔽 Configuration Dropdown */}
                <div className="relative inline-block text-left">
                    <button
                        onClick={toggleConfigDropdown}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Configuration
                    </button>

                    {isConfigOpen && (
                        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1">
                                <Link
                                    to="/app/commercial/manpower-training/configuration/roles"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Roles
                                </Link>
                                <Link
                                    to="/app/commercial/manpower-training/configuration/price-master"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Price Master
                                </Link>
                                <Link
                                    to="/app/commercial/manpower-training/configuration/mail-template"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Mail Template
                                </Link>
                                <Link
                                    to="/app/commercial/manpower-training/configuration/employee-type"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Employee Type
                                </Link>
                                <Link
                                    to="/app/commercial/manpower-training/configuration/departments"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Departments
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManpowerNavbar;
