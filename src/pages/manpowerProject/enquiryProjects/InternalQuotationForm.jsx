// src/pages/Manpower/InternalQuotationForm.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ManpowerNavbar from "../ManpowerNavbar";

import { supabase } from "../../../lib/supabase";

const InternalQuotationForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('manpower');

  const [formData, setFormData] = useState({
    quotation_number: "",
    subject: "",
    remarks: "",
    amount: "",
    validity: "",
  });

  useEffect(() => {
    const fetchEnquiry = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('manpower_enquiries')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        console.error('Error fetching enquiry:', error);
        setEnquiry(null);
      } else {
        setEnquiry(data);
      }
      setLoading(false);
    };

    if (id) {
      fetchEnquiry();
    }
  }, [id]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!enquiry) return;

    const newQuotation = {
      enquiry_id: enquiry.id,
      enquiry_number: enquiry.enquiry_number,
      client: enquiry.client,
      quotation_number: formData.quotation_number,
      subject: formData.subject,
      remarks: formData.remarks,
      amount: formData.amount,
      validity: formData.validity,
      created_at: new Date().toISOString(),
    };

    // Save in localStorage for now
    const saved = JSON.parse(localStorage.getItem("manpower_internal_quotations")) || [];
    saved.push(newQuotation);
    localStorage.setItem("manpower_internal_quotations", JSON.stringify(saved));

    alert("Quotation saved successfully!");
    navigate("/app/manpower/internal-quotation"); // go back to list
  };

  if (loading) {
    return <p className="text-center text-gray-500">Loading enquiry...</p>;
  }

  if (!enquiry) {
    return (
      <p className="text-center text-red-600">
        Enquiry not found or not approved!
      </p>
    );
  }

  return (
    <div className="p-6">
      <ManpowerNavbar />

      <h2 className="text-2xl font-bold mb-4">
        Internal Quotation - {enquiry.enquiry_number}
      </h2>

      {/* Client Info */}
      <div className="bg-white p-6 shadow rounded-lg mb-6">
        <h3 className="font-semibold mb-2">Client Details</h3>
        <p><strong>Client:</strong> {enquiry.client}</p>
        <p><strong>Email:</strong> {enquiry.email}</p>
        <p><strong>Phone:</strong> {enquiry.phone}</p>
        <p>
          <strong>Address:</strong> {enquiry.street}, {enquiry.city},{" "}
          {enquiry.state}, {enquiry.country}
        </p>
      </div>
      {/* Bottom Demo Data Tabs */}
      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="border-b px-4 py-3 flex flex-wrap gap-2">
          {[
            { key: 'manpower', label: 'Manpower' },
            { key: 'cost', label: 'Cost Breakup' },
            { key: 'operational', label: 'Operational Cost Details' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium border ${activeTab === tab.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {activeTab === 'manpower' && (
            <div>
              <h4 className="text-lg font-semibold mb-3">Manpower Overview</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { role: 'Technicians', qty: 6, shift: '8 hrs', rate: 1500 },
                  { role: 'Supervisors', qty: 2, shift: '8 hrs', rate: 2200 },
                  { role: 'Helpers', qty: 4, shift: '8 hrs', rate: 900 },
                ].map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <p className="font-medium">{item.role}</p>
                    <p className="text-sm text-gray-600">Qty: {item.qty} • Shift: {item.shift}</p>
                    <p className="mt-1 text-sm"><span className="text-gray-600">Rate/day:</span> ₹{item.rate.toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'cost' && (
            <div>
              <h4 className="text-lg font-semibold mb-3">Cost Breakup</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700">
                      <th className="border px-3 py-2 text-left">Component</th>
                      <th className="border px-3 py-2 text-center">Qty</th>
                      <th className="border px-3 py-2 text-right">Rate</th>
                      <th className="border px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { component: 'Manpower (Daily)', qty: 12, rate: 1200 },
                      { component: 'Tools & Consumables', qty: 1, rate: 3500 },
                      { component: 'Transportation', qty: 1, rate: 2000 },
                    ].map((row, idx) => (
                      <tr key={idx}>
                        <td className="border px-3 py-2">{row.component}</td>
                        <td className="border px-3 py-2 text-center">{row.qty}</td>
                        <td className="border px-3 py-2 text-right">₹{row.rate.toLocaleString('en-IN')}</td>
                        <td className="border px-3 py-2 text-right">₹{(row.qty * row.rate).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'operational' && (
            <div>
              <h4 className="text-lg font-semibold mb-3">Operational Cost Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'Accommodation', detail: '2 rooms • 15 days', cost: 15000 },
                  { name: 'Meals', detail: 'Daily allowance', cost: 9000 },
                  { name: 'Local Travel', detail: 'City commute', cost: 5000 },
                ].map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-600">{item.detail}</p>
                    <p className="mt-1 text-sm"><span className="text-gray-600">Cost:</span> ₹{item.cost.toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InternalQuotationForm;
