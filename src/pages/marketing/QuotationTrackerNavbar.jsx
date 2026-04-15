// src/pages/marketing/QuotationTrackerNavbar.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const QuotationTrackerNavbar = () => {
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const location = useLocation();

    const toggleConfigDropdown = () => {
        setIsConfigOpen(!isConfigOpen);
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200/90 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                {/* Title */}
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Quotation Tracker</h2>

                {/* Buttons Row - pushed right */}
                <div className="flex items-center gap-3 ml-auto">
                    {/* Quotation List button */}
                    <Link
                        to="/app/marketing/quotation-tracker"
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm ${
                            location.pathname === "/app/marketing/quotation-tracker" || 
                            location.pathname === "/app/marketing/quotation-tracker/"
                                ? "bg-red-700"
                                : "bg-red-600 hover:bg-red-700"
                        }`}
                    >
                        Quotation List
                    </Link>

                    {/* Costing Sheet */}
                    <Link
                        to="/app/marketing/quotation-tracker/costing"
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm ${
                            location.pathname.startsWith("/app/marketing/quotation-tracker/costing")
                                ? "bg-green-700"
                                : "bg-green-600 hover:bg-green-700"
                        }`}
                    >
                        Costing Sheet
                    </Link>

                    {/* Internal Quotation */}
                    <Link
                        to="/app/marketing/quotation-tracker/internal-quotation"
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm ${
                            location.pathname.startsWith("/app/marketing/quotation-tracker/internal-quotation")
                                ? "bg-slate-800"
                                : "bg-slate-700 hover:bg-slate-800"
                        }`}
                    >
                        Internal Quotation
                    </Link>

                    {/* 🔽 Configuration Dropdown */}
                    <div className="relative inline-block text-left">
                        <button
                            onClick={toggleConfigDropdown}
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                            Templates
                        </button>

                        {isConfigOpen && (
                            <>
                                <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setIsConfigOpen(false)}
                                ></div>
                                <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                                    <div className="py-1">
                                        <Link
                                            to="/app/marketing/mail-templates"
                                            className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                                            onClick={() => setIsConfigOpen(false)}
                                        >
                                            Mail Templates
                                        </Link>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuotationTrackerNavbar;

