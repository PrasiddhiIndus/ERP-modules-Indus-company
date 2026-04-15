// src/components/FireTenderNavbar.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings, ChevronDown } from "lucide-react";

const FireTenderNavbar = () => {
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const location = useLocation();

    const toggleConfigDropdown = () => {
        setIsConfigOpen(!isConfigOpen);
    };

    return (
        <div className="flex items-center justify-between mb-5 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
            <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Fire Tender Module</h2>
                <p className="text-xs sm:text-sm text-gray-500">Configuration and module setup</p>
            </div>

            <div className="relative inline-block text-left">
                <button
                    onClick={toggleConfigDropdown}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        location.pathname.includes("/app/fire-tender/configuration")
                            ? "bg-red-700 text-white"
                            : "bg-red-600 text-white hover:bg-red-700"
                    }`}
                >
                    <Settings className="w-4 h-4" />
                    Configuration
                    <ChevronDown className={`w-4 h-4 transition-transform ${isConfigOpen ? "rotate-180" : ""}`} />
                </button>

                {isConfigOpen && (
                    <div className="absolute right-0 mt-2 w-64 rounded-xl shadow-xl bg-white border border-gray-200 z-20 overflow-hidden">
                        <div className="py-1">
                            <Link
                                to="/app/fire-tender/configuration/main-component"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Main Component
                            </Link>
                            <Link
                                to="/app/fire-tender/configuration/manual-sub-category"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Manual Sub Category
                            </Link>
                            <Link
                                to="/app/fire-tender/configuration/fire-tender-mail-template"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Fire Tender Mail Template
                            </Link>
                            <Link
                                to="/app/fire-tender/configuration/price-master"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Price Master
                            </Link>
                            <Link
                                to="/app/fire-tender/configuration/accessories"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Accessories
                            </Link>
                            <Link
                                to="/app/fire-tender/configuration/final-components"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Final Components
                            </Link>
                            <Link
                                to="/app/fire-tender/configuration/vehicle-type"
                                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Vehicle Type
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FireTenderNavbar;
