// src/components/ManpowerNavbar.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const ManpowerNavbar = () => {
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const location = useLocation();

    const toggleConfigDropdown = () => {
        setIsConfigOpen(!isConfigOpen);
    };

    return (
        <div className="flex items-center justify-between mb-6 border-b pb-3">
            {/* Title */}
            <h2 className="text-2xl font-semibold">Manpower Management</h2>

            {/* Buttons Row - pushed right */}
            <div className="flex items-center gap-3 ml-auto">
                {/* ✅ New Enquiry */}
                <Link
                    to="/app/manpower"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/manpower"
                        ? "bg-red-700"
                        : "bg-red-600 hover:bg-red-700"
                        }`}
                >
                    New Enquiry 
                </Link>

                {/* ✅ Enquiry List */}
                <Link
                    to="/app/manpower/list"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/manpower/list"
                        ? "bg-yellow-700"
                        : "bg-yellow-600 hover:bg-yellow-700"
                        }`}
                >
                    Enquiry List
                </Link>

                {/* ✅ Internal Quotation */}
                <Link
                    to="/app/manpower/internal-quotation"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/manpower/internal-quotation"
                        ? "bg-green-700"
                        : "bg-green-600 hover:bg-green-700"
                        }`}
                >
                    Internal Quotation
                </Link>

                {/* ✅ Quotation */}
                <Link
                    to="/app/manpower/quotation"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/manpower/quotation"
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
                                    to="/app/manpower/configuration/roles"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Roles
                                </Link>
                                <Link
                                    to="/app/manpower/configuration/price-master"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Price Master
                                </Link>
                                <Link
                                    to="/app/manpower/configuration/mail-template"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Mail Template
                                </Link>
                                <Link
                                    to="/app/manpower/configuration/employee-type"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Employee Type
                                </Link>
                                <Link
                                    to="/app/manpower/configuration/departments"
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
