// src/pages/manpowerProject/enquiryProjects/InternalQuotationList.jsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ManpowerNavbar from "../ManpowerNavbar";

import { supabase } from "../../../lib/supabase";

const InternalQuotationList = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApprovedEnquiries = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('manpower_enquiries')
        .select('*')
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching approved enquiries:', error);
      } else {
        setEnquiries(data || []);
      }
      setLoading(false);
    };

    fetchApprovedEnquiries();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <ManpowerNavbar />
        <p className="text-center text-gray-500">Loading enquiries...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ManpowerNavbar />
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Internal Quotations</h2>
        <div className="text-sm text-gray-600">
          {enquiries.length} approved enquir{enquiries.length === 1 ? 'y' : 'ies'} available
        </div>
      </div>

      {enquiries.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Approved Enquiries</h3>
          <p className="text-gray-500">There are no approved enquiries available for internal quotation.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {enquiries.map((enquiry) => (
            <div key={enquiry.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {enquiry.enquiry_number}
                    </h3>
                    <p className="text-gray-600">{enquiry.client}</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {enquiry.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">Contact</p>
                    <p className="text-sm font-medium text-gray-900">{enquiry.email}</p>
                    <p className="text-sm text-gray-600">{enquiry.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="text-sm text-gray-900">
                      {enquiry.city}, {enquiry.state}
                    </p>
                    <p className="text-sm text-gray-600">{enquiry.country}</p>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Link
                    to={`/app/manpower/internal-quotation/${enquiry.id}`}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Create Quotation
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InternalQuotationList;
