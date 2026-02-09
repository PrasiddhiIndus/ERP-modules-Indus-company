// src/pages/CostingSheet.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import CostingTable from "./CostingTable";
import AccessoriesTable from "./AccessoriesTable";
import MocTable from "./MocTable";
import FireTenderNavbar from "./FireTenderNavbar";

const CostingSheet = () => {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("costing");
  const [accessoriesTotal, setAccessoriesTotal] = useState(0);

  // fetch tender details
  useEffect(() => {
    const fetchTender = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tenders")
        .select("*")
        .eq("id", id)
        .eq("status", "Approved")
        .single();

      if (error) {
        console.error("Error fetching tender:", error.message);
        setTender(null);
      } else {
        setTender(data);
      }
      setLoading(false);
    };

    fetchTender();
  }, [id]);

  // Refresh accessories total when switching to accessories tab
  useEffect(() => {
    if (activeTab === "accessories" && tender) {
      // The AccessoriesTable will call onTotalChange when it loads
      // This ensures the total is updated when switching tabs
    }
  }, [activeTab, tender]);

  if (loading) {
    return <p className="text-center text-gray-500">Loading tender...</p>;
  }

  if (!tender) {
    return (
      <p className="text-center text-red-600">
        Tender not found or not approved!
      </p>
    );
  }

  return (
    <div className="p-6">
      <FireTenderNavbar/>
      <h2 className="text-2xl font-bold mb-4">{tender.tender_number}</h2>
      {/* Client Info */}
      <div className="bg-white p-6 shadow rounded-lg mb-6">
        <h3 className="font-semibold mb-2">Client Details</h3>
        <p><strong>Client:</strong> {tender.client}</p>
        <p><strong>Email:</strong> {tender.email}</p>
        <p><strong>Phone:</strong> {tender.phone}</p>
        <p>
          <strong>Address:</strong> {tender.street}, {tender.city},{" "}
          {tender.state}, {tender.country}
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab("costing")}
            className={`px-4 py-2 font-semibold ${activeTab === "costing"
                ? "border-b-2 border-blue-600"
                : "text-gray-500"
              }`}
          >
            Costing Sheet
          </button>
          <button
            onClick={() => setActiveTab("accessories")}
            className={`px-4 py-2 font-semibold ${activeTab === "accessories"
                ? "border-b-2 border-blue-600"
                : "text-gray-500"
              }`}
          >
            Accessories Sheet
          </button>
          <button
            onClick={() => setActiveTab("moc")}
            className={`px-4 py-2 font-semibold ${activeTab === "moc"
                ? "border-b-2 border-blue-600"
                : "text-gray-500"
              }`}
          >
            MOC
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "costing" && <CostingTable tenderId={tender.id} accessoriesTotal={accessoriesTotal} />}
      {activeTab === "accessories" && <AccessoriesTable tenderId={tender.id} onTotalChange={setAccessoriesTotal} />}
      {activeTab === "moc" && <MocTable tenderId={tender.id} />}

    </div>
  );
};

export default CostingSheet;
