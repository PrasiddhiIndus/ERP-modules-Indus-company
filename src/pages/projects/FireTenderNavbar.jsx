// src/components/FireTenderNavbar.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const FireTenderNavbar = () => {
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const location = useLocation();

    const toggleConfigDropdown = () => {
        setIsConfigOpen(!isConfigOpen);
    };

    return (
        <div className="flex items-center justify-between mb-6 border-b pb-3">
            {/* Title */}
            <h2 className="text-2xl font-semibold">Fire Tender Management</h2>

            {/* Buttons Row - pushed right */}
            <div className="flex items-center gap-3 ml-auto">
                {/* New Tender button */}
                <Link
                    to="/app/fire-tender"
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                    New Tender
                </Link>
                <Link
                    to="/app/fire-tender/list"
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                    Tender List
                </Link>


                {/* ✅ Costing Sheet */}
                <Link
                    to="/app/fire-tender/costing"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/fire-tender/costing"
                        ? "bg-green-700"
                        : "bg-green-600 hover:bg-green-700"
                        }`}
                >
                    Costing Sheet
                </Link>

                {/* ✅ Quotation */}
                <Link
                    to="/app/fire-tender/quotation"
                    className={`px-4 py-2 rounded text-white ${location.pathname === "/app/fire-tender/quotation"
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
                                    to="/app/fire-tender/configuration/main-component"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Main Component
                                </Link>
                                <Link
                                    to="/app/fire-tender/configuration/manual-sub-category"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Manual Sub Category
                                </Link>
                                <Link
                                    to="/app/fire-tender/configuration/fire-tender-mail-template"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Fire Tender Mail Template
                                </Link>
                                <Link
                                    to="/app/fire-tender/configuration/price-master"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Price Master
                                </Link>
                                <Link
                                    to="/app/fire-tender/configuration/accessories"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Accessories
                                </Link>
                                <Link
                                    to="/app/fire-tender/configuration/final-components"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Final Components
                                </Link>
                                <Link
                                    to="/app/fire-tender/configuration/vehicle-type"
                                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                >
                                    Vehicle Type
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FireTenderNavbar;
